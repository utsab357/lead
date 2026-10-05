/**
 * /api/whatsapp-blast/control - POST
 * Controls an active blast: pause | resume | stop
 *
 * Body: { action: "pause" | "resume" | "stop" }
 */

import { NextResponse } from "next/server";
import { readBlastState, writeBlastState } from "../send/route";

export async function POST(req: Request) {
  const { action } = await req.json() as { action: "pause" | "resume" | "stop" };
  const state = readBlastState();

  if (action === "pause" && state.status === "running") {
    state.status = "paused";
    state.updatedAt = Date.now();
    writeBlastState(state);
    return NextResponse.json({ ok: true, status: "paused" });
  }

  if (action === "resume" && state.status === "paused") {
    state.status = "running";
    state.updatedAt = Date.now();
    writeBlastState(state);
    return NextResponse.json({ ok: true, status: "running" });
  }

  if (action === "stop") {
    state.status = "idle";
    state.currentName = "";
    state.nextSendAt = 0;
    state.updatedAt = Date.now();
    writeBlastState(state);
    return NextResponse.json({ ok: true, status: "idle" });
  }

  return NextResponse.json({ ok: false, error: `Cannot ${action} when status is ${state.status}` }, { status: 400 });
}
