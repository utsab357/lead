import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Keep Evolution API awake simultaneously
  const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-webeta.onrender.com";
  fetch(evoUrl, { signal: AbortSignal.timeout(5000) }).catch(() => {});

  return NextResponse.json({
    status: "ok",
    service: "webeta-lead-generator",
    timestamp: new Date().toISOString(),
  });
}
