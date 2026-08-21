import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession } from "@/lib/types";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

export type PhoneIndexEntry = {
  phone: string;        // normalized digits only
  sessionId: string;
  niche: string;
  city: string;
  timestamp: string;
  leadName: string;
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

          const digits = raw_phone.replace(/\D/g, "");
          // Normalize: strip leading 91 + optional 0
          let normalized = digits;
          if (normalized.startsWith("910") && normalized.length === 12) normalized = normalized.slice(3);
          else if (normalized.startsWith("91") && normalized.length === 12) normalized = normalized.slice(2);
          else if (normalized.startsWith("0") && normalized.length === 11) normalized = normalized.slice(1);
          // Keep only 10-digit numbers
          if (normalized.length !== 10) continue;

          index.push({
            phone: normalized,
            sessionId: session.id,
            niche: session.niche,
            city: session.city,
            timestamp: session.timestamp,
            leadName: lead.name,
          });
        }
      } catch { /* skip corrupt files */ }
    }

    return NextResponse.json({ index });
  } catch {
    return NextResponse.json({ index: [] });
  }
}
