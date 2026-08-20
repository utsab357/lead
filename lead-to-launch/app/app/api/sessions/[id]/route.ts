import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession, AuditResult, RankedLead } from "@/lib/types";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

/** GET /api/sessions/[id] — load a session's full leads */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, `${id}.json`), "utf-8");
    const session: ScrapeSession = JSON.parse(raw);
    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

/** PATCH /api/sessions/[id] — persist audit/rank results into an existing session */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const session: ScrapeSession = JSON.parse(raw);

    const body = (await req.json()) as {
      audits?: Record<string, AuditResult>;
      ranked?: RankedLead[];
      selectedId?: string | null;
    };

    if (body.audits   !== undefined) session.audits    = body.audits;
    if (body.ranked   !== undefined) session.ranked    = body.ranked;
    if (body.selectedId !== undefined) session.selectedId = body.selectedId;

    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}
