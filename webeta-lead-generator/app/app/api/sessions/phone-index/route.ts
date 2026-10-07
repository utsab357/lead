import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession } from "@/lib/types";
import { normalizePhone10 } from "@/lib/phoneUtils";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

export type PhoneIndexEntry = {
  phone: string;
  sessionId: string;
  niche: string;
  city: string;
  timestamp: string;
  leadName: string;
  status?: string;
  notes?: string;
};

/**
 * GET /api/sessions/phone-index
 * Returns a flat list of { phone, sessionId, niche, city, timestamp, leadName }
 * for ALL leads across ALL sessions. Used to detect duplicates.
 *
 * Optional query param: ?exclude=<sessionId> to skip one session (the current one).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const exclude = searchParams.get("exclude") ?? "";

  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));

    const index: PhoneIndexEntry[] = [];

    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
        const session: ScrapeSession = JSON.parse(raw);

        // Skip the currently open session
        if (session.id === exclude) continue;

        for (const lead of session.leads ?? []) {
          const raw_phone = lead.phone ?? lead.whatsapp ?? "";
          if (!raw_phone) continue;

          const normalized = normalizePhone10(raw_phone);
          if (!normalized) continue;

          index.push({
            phone: normalized,
            sessionId: session.id,
            niche: session.niche,
            city: session.city,
            timestamp: session.timestamp,
            leadName: lead.name,
            status: session.leadStatuses?.[lead.id],
            notes:  session.leadNotes?.[lead.id],
          });
        }
      } catch { /* skip corrupt files */ }
    }

    return NextResponse.json({ index });
  } catch {
    return NextResponse.json({ index: [] });
  }
}
