import { NextResponse } from "next/server";
import {
  startScrapeJob,
  cancelScrapeJob,
  getJobState,
  isJobRunning,
  subscribeToJob,
} from "@/lib/scrapeJobManager";
import type { ScrapeInput } from "@/lib/types";

export const maxDuration = 900; // 15 minutes max duration

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function createSSEStream(): Response {
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = (data: object) => {
        try {
          controller.enqueue(new TextEncoder().encode(sseEvent(data)));
        } catch {
          // stream closed
        }
      };

      // Subscribe to single-job manager events
      unsubscribe = subscribeToJob((data: object) => {
        enc(data);
      });
    },
    cancel() {
      // Tab closed or user navigated away:
      // Unsubscribe from events ONLY. Do NOT kill the background scraper!
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── GET: Check background job status OR attach to live SSE stream ───────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wantsStatus = searchParams.get("status") === "true";

  if (wantsStatus) {
    const job = getJobState();
    return NextResponse.json({
      ok: true,
      running: isJobRunning(),
      job,
    });
  }

  // Live SSE stream reconnection
  return createSSEStream();
}

// ── POST: Start new scrape OR stop active scrape ──────────────────────────────
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const isCancel = searchParams.get("cancel") === "true";

  if (isCancel) {
    const cancelled = cancelScrapeJob();
    return NextResponse.json({ ok: true, cancelled });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "cancel") {
    const cancelled = cancelScrapeJob();
    return NextResponse.json({ ok: true, cancelled });
  }

  const input = body as ScrapeInput;
  if (!input.niche?.trim() || !input.city?.trim()) {
    return NextResponse.json({ error: "Niche and city are required." }, { status: 400 });
  }

  // Start background job (enforces 1-at-a-time concurrency)
  const result = await startScrapeJob(input);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        alreadyRunning: true,
        error: result.error,
        sessionId: result.sessionId,
      },
      { status: 409 }
    );
  }

  // Return the live SSE stream immediately so the UI receives real-time updates
  return createSSEStream();
}
