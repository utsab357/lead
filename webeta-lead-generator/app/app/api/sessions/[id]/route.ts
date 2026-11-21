import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession, AuditResult, RankedLead, ConversionPoints, OutreachResult, BuildPromptResult, LeadStatus, ClientDetail } from "@/lib/types";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

/** GET /api/sessions/[id] — load a session's full leads */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const session: ScrapeSession = JSON.parse(raw);
      return NextResponse.json({ session });
    } catch {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
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
      leads?:          import("@/lib/types").Lead[];
      audits?:         Record<string, AuditResult>;
      ranked?:         RankedLead[];
      selectedId?:     string | null;
      conversions?:    Record<string, ConversionPoints>;
      outreachResults?: Record<string, OutreachResult>;
      buildPrompts?:   Record<string, BuildPromptResult>;
      leadStatuses?:   Record<string, LeadStatus>;
      leadNotes?:      Record<string, string>;
      clientDetails?:  Record<string, ClientDetail>;
      visualPreviews?: Record<string, import("@/lib/types").LeadVisualPreviewSet>;
    };

    if (body.leads           !== undefined) session.leads           = body.leads;
    if (body.audits          !== undefined) session.audits          = body.audits;
    if (body.ranked          !== undefined) session.ranked          = body.ranked;
    if (body.selectedId      !== undefined) session.selectedId      = body.selectedId;
    if (body.conversions     !== undefined) session.conversions     = body.conversions;
    if (body.outreachResults !== undefined) session.outreachResults = body.outreachResults;
    if (body.buildPrompts    !== undefined) session.buildPrompts    = body.buildPrompts;
    if (body.leadStatuses    !== undefined) session.leadStatuses    = body.leadStatuses;
    if (body.leadNotes       !== undefined) session.leadNotes       = body.leadNotes;
    if (body.clientDetails   !== undefined) session.clientDetails   = body.clientDetails;
    if (body.visualPreviews  !== undefined) session.visualPreviews  = body.visualPreviews;

    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

/** DELETE /api/sessions/[id] — remove a session file */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

