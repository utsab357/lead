import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeInput, ScrapeSession, Lead } from "@/lib/types";

/**
 * Direct Live Streaming Scrape API
 * Streams results in real-time directly over Server-Sent Events (SSE).
 * If the user stops the scrape or closes the tab, Chrome is immediately terminated.
 */

export const maxDuration = 900; // 15 minutes max execution

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function getScraperPath(name: string): string {
  return path.resolve(process.cwd(), "scripts", `${name}.mjs`);
}

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

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function normalizeName(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, status: "ready" }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const input = body as ScrapeInput;
  if (!input.niche?.trim() || !input.city?.trim()) {
    return new Response(JSON.stringify({ error: "Niche and city are required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = `session-${Date.now()}`;
  const niche = input.niche.trim();
  const city = input.city.trim();

  const childProcesses: ReturnType<typeof spawn>[] = [];
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = (data: object) => {
        try {
          controller.enqueue(new TextEncoder().encode(sseEvent(data)));
        } catch {
          // stream closed
        }
      };

      // Periodic heartbeat keeps SSE connection alive across Render proxy (100s idle timeout)
      pingTimer = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          if (pingTimer) clearInterval(pingTimer);
        }
      }, 15000);

      // Notify client of the active session ID immediately
      enc({ type: "init", sessionId, niche, city });

      const allLeads: Lead[] = [];
      const seenNames = new Set<string>();

      async function persistSessionIncremental() {
        try {
          await fs.mkdir(SESSIONS_DIR, { recursive: true });
          const noSite = allLeads.filter((l) => !l.website);
          const withPhone = allLeads.filter((l) => l.phone);

          const session: ScrapeSession = {
            id: sessionId,
            niche,
            city,
            timestamp: new Date().toISOString(),
            leadsCount: allLeads.length,
            noWebsiteCount: noSite.length,
            withPhoneCount: withPhone.length,
            expandedTerms: [niche],
            leads: allLeads,
          };

          const outPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
          await fs.writeFile(outPath, JSON.stringify(session, null, 2), "utf-8");
        } catch {}
      }

      function runScraper(scriptPath: string, args: string[], sourceLabel: string): Promise<void> {
        return new Promise((resolve) => {
          enc({ type: "status", message: `Starting ${sourceLabel} scrape...` });

          const child = spawn("node", [scriptPath, ...args], {
            cwd: process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || "0",
            },
          });
          childProcesses.push(child);

          let buffer = "";

          child.stdout?.on("data", (d: Buffer) => {
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
                  const normalized = normalizeName(msg.lead.name);
                  const existingIdx = allLeads.findIndex(
                    (l) => normalizeName(l.name) === normalized || (l.mapUrl && l.mapUrl === msg.lead.mapUrl)
                  );

                  if (existingIdx >= 0) {
                    // Update existing lead with enriched fields
                    allLeads[existingIdx] = {
                      ...allLeads[existingIdx],
                      ...msg.lead,
                      whatsapp: msg.lead.whatsapp || msg.lead.phone || allLeads[existingIdx].whatsapp,
                    };
                    enc({
                      type: "lead",
                      lead: allLeads[existingIdx],
                      index: existingIdx + 1,
                      total: msg.total || allLeads.length,
                      source: sourceLabel,
                    });
                  } else {
                    seenNames.add(normalized);
                    const leadIndex = allLeads.length + 1;
                    const lead: Lead = {
                      ...msg.lead,
                      id: `${sessionId}_${String(leadIndex).padStart(3, "0")}`,
                      whatsapp: msg.lead.whatsapp || msg.lead.phone || undefined,
                      mapUrl: msg.lead.mapUrl || generateMapUrl(msg.lead.name, msg.lead.city),
                    };
                    allLeads.push(lead);
                    enc({
                      type: "lead",
                      lead,
                      index: allLeads.length,
                      total: msg.total || allLeads.length,
                      source: sourceLabel,
                    });
                  }

                  // Progressively save every 5 leads to protect data against any interruption
                  if (allLeads.length % 5 === 0) {
                    persistSessionIncremental().catch(() => {});
                  }
                }

                if (msg.type === "source_done") {
                  enc({
                    type: "source_done",
                    source: sourceLabel,
                    total: msg.total,
                    withPhone: msg.withPhone,
                    noSite: msg.noSite,
                    sources: msg.sources,
                  });
                }

                if (msg.type === "error") {
                  enc({ type: "error", message: msg.message });
                }
              } catch {
                // non-JSON line
              }
            }
          });

          child.stderr?.on("data", (d: Buffer) => {
            const errText = d.toString().trim();
            if (errText) {
              console.error(`[${sourceLabel} stderr]:`, errText);
              // Only report fatal messages or unhandled exceptions to UI
              if (errText.includes("Error:") || errText.includes("Unhandled") || errText.includes("Cannot find")) {
                enc({ type: "status", message: `⚠️ ${errText.slice(0, 100)}` });
              }
            }
          });

          child.on("close", (code) => {
            if (code !== 0 && code !== null) {
              console.warn(`[${sourceLabel}] process exited with code ${code}`);
            }
            resolve();
          });

          child.on("error", (err) => {
            console.error(`[${sourceLabel}] spawn error:`, err);
            enc({ type: "error", message: `Failed to spawn ${sourceLabel}: ${err.message}` });
            resolve();
          });
        });
      }

      (async () => {
        // 1. Run Google Maps scraper
        await runScraper(getScraperPath("maps-scraper"), [niche, city, sessionId], "Google Maps");

        // 2. Run Zomato scraper if restaurant/food niche and Maps yielded few results
        if (isFoodNiche(niche) && allLeads.length < 5) {
          try {
            enc({ type: "status", message: "🍽️ Food niche detected — also searching Zomato for more restaurants..." });
            await runScraper(getScraperPath("zomato-scraper"), [niche, city, sessionId + "-zomato"], "Zomato");
          } catch {
            enc({ type: "status", message: "Zomato scrape skipped (error). Maps data saved." });
          }
        }

        // 3. Save completed session to disk
        try {
          await fs.mkdir(SESSIONS_DIR, { recursive: true });
          const noSite = allLeads.filter((l) => !l.website);
          const withPhone = allLeads.filter((l) => l.phone);

          const session: ScrapeSession = {
            id: sessionId,
            niche,
            city,
            timestamp: new Date().toISOString(),
            leadsCount: allLeads.length,
            noWebsiteCount: noSite.length,
            withPhoneCount: withPhone.length,
            expandedTerms: [niche],
            leads: allLeads,
          };

          const outPath = path.join(SESSIONS_DIR, `${sessionId}.json`);
          await fs.writeFile(outPath, JSON.stringify(session, null, 2), "utf-8");
        } catch {
          // disk write fallback
        }

        // 4. Emit final done stats
        enc({
          type: "done",
          total: allLeads.length,
          withPhone: allLeads.filter((l) => l.phone).length,
          noSite: allLeads.filter((l) => !l.website).length,
          sessionId,
          sources: {
            maps: allLeads.filter((l) => l.source === "maps").length,
            zomato: allLeads.filter((l) => l.source === "zomato").length,
          },
        });

        try {
          if (pingTimer) clearInterval(pingTimer);
          controller.close();
        } catch {
          // already closed
        }
      })();
    },
    cancel() {
      // User pressed Stop or closed the tab: immediately terminate running Chrome processes
      if (pingTimer) clearInterval(pingTimer);
      for (const child of childProcesses) {
        try {
          child.kill("SIGTERM");
        } catch {
          // already exited
        }
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
