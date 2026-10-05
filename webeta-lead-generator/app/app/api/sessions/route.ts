import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession, Lead } from "@/lib/types";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

async function ensureDir() {
  try { await fs.mkdir(SESSIONS_DIR, { recursive: true }); } catch { /* ok */ }
}

/** GET — list all saved sessions (metadata only, no leads array for speed) */
export async function GET() {
  await ensureDir();
  try {
    const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));
    const sessions: Omit<ScrapeSession, "leads">[] = [];

    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
        const s: ScrapeSession = JSON.parse(raw);
        if (!s.id || !s.niche || !s.leadsCount) continue;
        // Return metadata only (no leads array) to keep response small
        sessions.push({
          id: s.id,
          niche: s.niche,
          city: s.city,
          timestamp: s.timestamp,
          leadsCount: s.leadsCount,
          noWebsiteCount: s.noWebsiteCount,
          withPhoneCount: s.withPhoneCount,
          expandedTerms: s.expandedTerms,
        });
      } catch { /* skip corrupt files */ }
    }

    // Sort newest first — safe against missing timestamps
    sessions.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
    return NextResponse.json({ sessions });
  } catch (e) {
    console.error("[sessions GET] error:", e);
    return NextResponse.json({ sessions: [] });
  }
}

/** POST — create a new session (for manually added leads) */
export async function POST(req: Request) {
  await ensureDir();
  try {
    const body = (await req.json()) as { leads: Lead[]; niche?: string; city?: string };
    const leads = body.leads ?? [];
    const niche = body.niche ?? "manual";
    const city  = body.city  ?? leads[0]?.city ?? "mixed";

    const id = `session-${Date.now()}`;
    const session: ScrapeSession = {
      id,
      niche,
      city,
      timestamp:       new Date().toISOString(),
      leadsCount:      leads.length,
      noWebsiteCount:  leads.filter((l) => !l.website).length,
      withPhoneCount:  leads.filter((l) => !!l.phone).length,
      expandedTerms:   [],
      leads,
    };

    await fs.writeFile(
      path.join(SESSIONS_DIR, `${id}.json`),
      JSON.stringify(session, null, 2),
    );
    return NextResponse.json({ sessionId: id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE — remove a session by ID */
export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await fs.unlink(path.join(SESSIONS_DIR, `${id}.json`));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}
