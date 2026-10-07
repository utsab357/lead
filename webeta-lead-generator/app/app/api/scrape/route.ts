import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeInput, ScrapeSession, Lead } from "@/lib/types";

/**
 * Scrape API — Streams results in real-time using Server-Sent Events (SSE).
 * Runs Google Maps scraper first, then JustDial, merging + deduplicating results.
 * Chrome opens on screen for each source.
 */

export const maxDuration = 900; // 15 minutes (two scrapers)

const SESSIONS_DIR  = path.join(process.cwd(), "data", "sessions");

function getScraperPath(name: string): string {
  return path.resolve(process.cwd(), "scripts", `${name}.mjs`);
}

/** Niche keywords that trigger Zomato scraping */
const FOOD_NICHES = ["restaurant", "food", "cafe", "dhaba", "biryani", "pizza", "hotel",
  "dining", "eatery", "bakery", "sweet", "mithai", "tiffin", "snacks", "bar", "pub",
  "kitchen", "canteen", "mess", "fast food", "burger", "noodles", "chinese", "mughlai"];

function isFoodNiche(niche: string): boolean {
  const n = niche.toLowerCase();
  return FOOD_NICHES.some((k) => n.includes(k));
}

function generateMapUrl(name: string, city: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${city}`)}`;
}

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Normalize a business name for dedup matching */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(req: Request) {
  const input = (await req.json()) as ScrapeInput;

  if (!input.niche?.trim() || !input.city?.trim()) {
    return new Response(JSON.stringify({ error: "Niche and city are required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = `session-${Date.now()}`;
  const niche = input.niche.trim();
  const city  = input.city.trim();

  // Track child processes so we can kill them on cancel
  const childProcesses: ReturnType<typeof spawn>[] = [];

  const stream = new ReadableStream({
    start(controller) {
      const enc = (data: object) => {
        try { controller.enqueue(new TextEncoder().encode(sseEvent(data))); } catch { /* closed */ }
      };

      // Track all leads from both sources for merging
      const allLeads: Lead[] = [];
      const seenNames = new Set<string>();

      // ── Helper: run a scraper child process ──────────────────────────
      function runScraper(
        scriptPath: string,
        args: string[],
        sourceLabel: string,
      ): Promise<void> {
        return new Promise((resolve) => {
          enc({ type: "status", message: `Starting ${sourceLabel} scrape...` });

          const child = spawn("node", [scriptPath, ...args], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
          });
          childProcesses.push(child);

          let buffer = "";
          let stderr  = "";

          child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

          child.stdout.on("data", (d: Buffer) => {
            buffer += d.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const msg = JSON.parse(line);

                if (msg.type === "status") {
                  enc({ type: "status", message: msg.message });
                }

                if (msg.type === "lead") {
                  // Dedup check
                  const normalized = normalizeName(msg.lead.name);
                  if (!seenNames.has(normalized)) {
                    // Apply no-website filter before adding to session
                    const passesFilter = input.noWebsiteOnly ? !msg.lead.website : true;
                    if (passesFilter) {
                      seenNames.add(normalized);
                      const leadIndex = allLeads.length + 1;
                      const lead: Lead = {
                        ...msg.lead,
                        // Assign globally unique, session-scoped ID that never mutates
                        id: `${sessionId}_${String(leadIndex).padStart(3, "0")}`,
                        whatsapp: msg.lead.whatsapp || msg.lead.phone || undefined,
                        mapUrl: msg.lead.mapUrl || generateMapUrl(msg.lead.name, msg.lead.city),
                      };
                      allLeads.push(lead);
                      enc({ type: "lead", lead, index: allLeads.length, total: msg.total, source: sourceLabel });
                    }
                  }
                }

                if (msg.type === "done") {
                  const sources = msg.sources
                ? msg.sources.zomato > 0
                  ? ` (Maps: ${msg.sources.maps}, Zomato: ${msg.sources.zomato})`
                  : ` (Maps: ${msg.sources.maps})`
                : "";
                  enc({ type: "source_done", source: sourceLabel, total: msg.total, withPhone: msg.withPhone, noSite: msg.noSite, sources: msg.sources });
                }

                if (msg.type === "error") {
                  enc({ type: "error", message: msg.message });
                }
              } catch { /* non-JSON */ }
            }
          });

          child.on("close", () => resolve());
          child.on("error", () => resolve());
        });
      }

      // ── Run scrapers sequentially ──────────────────────────────────
      (async () => {
        // 1. Google Maps (always run)
        await runScraper(getScraperPath("maps-scraper"), [niche, city, sessionId], "Google Maps");

        // 2. Zomato — only for food/restaurant niches
        if (isFoodNiche(niche)) {
          try {
            enc({ type: "status", message: "🍽️ Food niche detected — also searching Zomato for more restaurants..." });
            await runScraper(getScraperPath("zomato-scraper"), [niche, city, sessionId + "-zomato"], "Zomato");
          } catch {
            enc({ type: "status", message: "Zomato scrape skipped (error). Maps data saved." });
          }
        }

        // ── Save combined session ──────────────────────────────────
        try {
          await fs.mkdir(SESSIONS_DIR, { recursive: true });
        } catch { /* ok */ }

        // Leads already retain their unique session-scoped IDs from the stream

        const noSite    = allLeads.filter((l) => !l.website);
        const withPhone = allLeads.filter((l) => l.phone);

        const session: ScrapeSession = {
          id:              sessionId,
          niche,
          city,
          timestamp:       new Date().toISOString(),
          leadsCount:      allLeads.length,
          noWebsiteCount:  noSite.length,
          withPhoneCount:  withPhone.length,
          expandedTerms:   [niche],
          leads:           allLeads,
        };

        const outPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
        await fs.writeFile(outPath, JSON.stringify(session, null, 2));

        // Emit final stats
        enc({
          type: "done",
          total: allLeads.length,
          withPhone: withPhone.length,
          noSite: noSite.length,
          sessionId,
          sources: {
            maps:   allLeads.filter((l) => l.source === "maps").length,
            zomato: allLeads.filter((l) => l.source === "zomato").length,
          },
        });

        try { controller.close(); } catch { /* already closed */ }
      })();
    },
    cancel() {
      // User pressed Stop — kill all running Chrome processes
      for (const child of childProcesses) {
        try { child.kill("SIGTERM"); } catch { /* already dead */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
