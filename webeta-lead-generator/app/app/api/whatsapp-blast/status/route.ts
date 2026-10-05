/**
 * /api/whatsapp-blast/status - GET
 * Returns current blast state (progress, logs, etc.)
 */

import { NextResponse } from "next/server";
import { readBlastState } from "../send/route";

export async function GET() {
  const state = readBlastState();
  return NextResponse.json(state);
}
