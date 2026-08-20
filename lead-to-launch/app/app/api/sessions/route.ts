import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession } from "@/lib/types";

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

    // Sort newest first
    sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ sessions: [] });
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
