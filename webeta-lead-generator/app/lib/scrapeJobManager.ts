import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeInput, ScrapeSession, Lead } from "@/lib/types";

export interface ScrapeJobState {
  sessionId: string;
  niche: string;
  city: string;
  startedAt: string;
  status: "idle" | "running" | "completed" | "error" | "cancelled";
  statusMsg: string;
  progress: { index: number; total: number } | null;
  leads: Lead[];
  withPhoneCount: number;
  noWebsiteCount: number;
  sources: { maps: number; zomato: number };
  error?: string;
}

export type JobSubscriber = (event: object) => void;

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

const FOOD_NICHES = [
  "restaurant", "food", "cafe", "dhaba", "biryani", "pizza", "hotel",
  "dining", "eatery", "bakery", "sweet", "mithai", "tiffin", "snacks", "bar", "pub",
  "kitchen", "canteen", "mess", "fast food", "burger", "noodles", "chinese", "mughlai"
];

function isFoodNiche(niche: string): boolean {
  const n = niche.toLowerCase();
  return FOOD_NICHES.some((k) => n.includes(k));
}

function generateMapUrl(name: string, city: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`;
}

function normalizeName(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getScraperPath(name: string): string {
  return path.resolve(process.cwd(), "scripts", `${name}.mjs`);
}

// ── Persistent Global Single-Job State ──────────────────────────────────────────
// Attached to globalThis so state persists across hot-reloads and requests on Node
declare global {
  var __webeta_scrape_state: ScrapeJobState | undefined;
  var __webeta_scrape_children: ChildProcess[] | undefined;
  var __webeta_scrape_subscribers: Set<JobSubscriber> | undefined;
  var __webeta_scrape_timeout: NodeJS.Timeout | undefined;
}

if (!globalThis.__webeta_scrape_subscribers) {
  globalThis.__webeta_scrape_subscribers = new Set<JobSubscriber>();
}
if (!globalThis.__webeta_scrape_children) {
  globalThis.__webeta_scrape_children = [];
}

export function getJobState(): ScrapeJobState | null {
  return globalThis.__webeta_scrape_state ?? null;
}

export function isJobRunning(): boolean {
  return globalThis.__webeta_scrape_state?.status === "running";
}

export function subscribeToJob(fn: JobSubscriber): () => void {
  const subs = globalThis.__webeta_scrape_subscribers!;
  subs.add(fn);

  // Send current state immediately upon subscribing so new tabs catch up instantly
  const state = globalThis.__webeta_scrape_state;
  if (state) {
    if (state.statusMsg) {
      fn({ type: "status", message: state.statusMsg });
    }
    for (let i = 0; i < state.leads.length; i++) {
      fn({
        type: "lead",
        lead: state.leads[i],
        index: i + 1,
        total: state.progress?.total || state.leads.length,
        source: state.leads[i].source || "maps",
      });
    }
    if (state.status === "completed") {
      fn({
        type: "done",
        total: state.leads.length,
        withPhone: state.withPhoneCount,
        noSite: state.noWebsiteCount,
        sessionId: state.sessionId,
        sources: state.sources,
      });
    } else if (state.status === "error") {
      fn({ type: "error", message: state.error || "Scrape failed" });
    } else if (state.status === "cancelled") {
      fn({ type: "status", message: "Scrape stopped by user." });
    }
  }

  return () => {
    subs.delete(fn);
  };
}

function broadcast(event: object) {
  const subs = globalThis.__webeta_scrape_subscribers;
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      // subscriber disconnected or closed
    }
  }
}

async function persistSessionToDisk(state: ScrapeJobState) {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    const session: ScrapeSession = {
      id: state.sessionId,
      niche: state.niche,
      city: state.city,
      timestamp: state.startedAt,
      leadsCount: state.leads.length,
      noWebsiteCount: state.noWebsiteCount,
      withPhoneCount: state.withPhoneCount,
      expandedTerms: [state.niche],
      leads: state.leads,
    };
    const outPath = path.join(SESSIONS_DIR, `${state.sessionId}.json`);
    await fs.writeFile(outPath, JSON.stringify(session, null, 2), "utf-8");
  } catch (err) {
    console.warn("[scrapeJobManager] Failed to persist session to disk:", err);
  }
}

/**
 * Starts a single background scrape job.
 * Enforces single-job concurrency lock: rejects if a job is already running.
 */
export async function startScrapeJob(input: ScrapeInput): Promise<{
  ok: boolean;
  sessionId?: string;
  error?: string;
  running?: boolean;
}> {
  // Check concurrency lock: only 1 scrape at a time
  if (isJobRunning()) {
    const existing = globalThis.__webeta_scrape_state!;
    return {
      ok: false,
      running: true,
      sessionId: existing.sessionId,
      error: `A scrape is already in progress for "${existing.niche}" in ${existing.city}. Please wait for it to complete or stop it.`,
    };
  }

  const sessionId = `session-${Date.now()}`;
  const niche = input.niche.trim();
  const city = input.city.trim();

  const state: ScrapeJobState = {
    sessionId,
    niche,
    city,
    startedAt: new Date().toISOString(),
    status: "running",
    statusMsg: "Starting scraper in background...",
    progress: null,
    leads: [],
    withPhoneCount: 0,
    noWebsiteCount: 0,
    sources: { maps: 0, zomato: 0 },
  };

  globalThis.__webeta_scrape_state = state;
  globalThis.__webeta_scrape_children = [];

  // Safety watchdog timeout: kill after 12 minutes (well before Render's 15 min idle)
  if (globalThis.__webeta_scrape_timeout) clearTimeout(globalThis.__webeta_scrape_timeout);
  globalThis.__webeta_scrape_timeout = setTimeout(() => {
    if (globalThis.__webeta_scrape_state?.status === "running") {
      console.warn("[scrapeJobManager] Watchdog timeout triggered after 12 minutes");
      cancelScrapeJob();
    }
  }, 12 * 60 * 1000);

  // Background detached execution
  (async () => {
    const seenNames = new Set<string>();

    function runChildScraper(scriptPath: string, args: string[], sourceLabel: string): Promise<void> {
      return new Promise((resolve) => {
        state.statusMsg = `Starting ${sourceLabel} scrape...`;
        broadcast({ type: "status", message: state.statusMsg });

        const child = spawn("node", [scriptPath, ...args], {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || "0",
          },
        });
        globalThis.__webeta_scrape_children?.push(child);

        let buffer = "";

        child.stdout.on("data", (d: Buffer) => {
          buffer += d.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);

              if (msg.type === "status") {
                state.statusMsg = msg.message;
                broadcast({ type: "status", message: msg.message });
              }

              if (msg.type === "lead") {
                const normalized = normalizeName(msg.lead.name);
                if (!seenNames.has(normalized)) {
                  const passesFilter = input.noWebsiteOnly ? !msg.lead.website : true;
                  if (passesFilter) {
                    seenNames.add(normalized);
                    const leadIndex = state.leads.length + 1;
                    const lead: Lead = {
                      ...msg.lead,
                      id: `${sessionId}_${String(leadIndex).padStart(3, "0")}`,
                      whatsapp: msg.lead.whatsapp || msg.lead.phone || undefined,
                      mapUrl: msg.lead.mapUrl || generateMapUrl(msg.lead.name, msg.lead.city),
                    };

                    state.leads.push(lead);
                    if (lead.phone) state.withPhoneCount++;
                    if (!lead.website) state.noWebsiteCount++;
                    state.progress = { index: state.leads.length, total: msg.total || state.leads.length };

                    if (sourceLabel.toLowerCase().includes("zomato")) {
                      state.sources.zomato++;
                    } else {
                      state.sources.maps++;
                    }

                    broadcast({
                      type: "lead",
                      lead,
                      index: state.leads.length,
                      total: msg.total || state.leads.length,
                      source: sourceLabel,
                    });

                    // Incrementally save to disk so data is never lost if server restarts
                    persistSessionToDisk(state);
                  }
                }
              }

              if (msg.type === "done") {
                broadcast({
                  type: "source_done",
                  source: sourceLabel,
                  total: msg.total,
                  withPhone: msg.withPhone,
                  noSite: msg.noSite,
                  sources: msg.sources,
                });
              }

              if (msg.type === "error") {
                broadcast({ type: "error", message: msg.message });
              }
            } catch { /* skip non-JSON */ }
          }
        });

        child.on("close", () => resolve());
        child.on("error", () => resolve());
      });
    }

    try {
      // 1. Google Maps
      await runChildScraper(getScraperPath("maps-scraper"), [niche, city, sessionId], "Google Maps");

      // 2. Zomato (if food niche)
      if (isFoodNiche(niche) && state.status === "running") {
        try {
          broadcast({ type: "status", message: "🍽️ Food niche detected — searching Zomato..." });
          await runChildScraper(getScraperPath("zomato-scraper"), [niche, city, `${sessionId}-zomato`], "Zomato");
        } catch {
          broadcast({ type: "status", message: "Zomato scrape skipped. Maps data preserved." });
        }
      }

      if (state.status === "running") {
        state.status = "completed";
        state.statusMsg = `Scrape complete! ${state.leads.length} businesses found.`;
        await persistSessionToDisk(state);

        broadcast({
          type: "done",
          total: state.leads.length,
          withPhone: state.withPhoneCount,
          noSite: state.noWebsiteCount,
          sessionId,
          sources: state.sources,
        });
      }
    } catch (err) {
      state.status = "error";
      state.error = (err as Error).message || "Scrape encountered an error";
      broadcast({ type: "error", message: state.error });
    } finally {
      globalThis.__webeta_scrape_children = [];
      if (globalThis.__webeta_scrape_timeout) clearTimeout(globalThis.__webeta_scrape_timeout);
    }
  })();

  return { ok: true, sessionId };
}

/**
 * Stops the active scrape job immediately (called by explicit user action).
 */
export function cancelScrapeJob(): boolean {
  const children = globalThis.__webeta_scrape_children || [];
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch { /* already dead */ }
  }
  globalThis.__webeta_scrape_children = [];

  const state = globalThis.__webeta_scrape_state;
  if (state && state.status === "running") {
    state.status = "cancelled";
    state.statusMsg = "Scrape stopped by user.";
    persistSessionToDisk(state);
    broadcast({ type: "status", message: "Scrape stopped by user." });
    return true;
  }
  return false;
}

