import { NextResponse } from "next/server";
import { readConfig } from "../settings/route";

export const maxDuration = 15;

export async function GET() {
  const config = readConfig();
  if (!config.evolutionApiUrl) {
    return NextResponse.json({ ok: false, error: "Evolution API URL not configured" });
  }

  try {
    const res = await fetch(config.evolutionApiUrl, {
      method: "GET",
      headers: config.evolutionApiKey ? { apikey: config.evolutionApiKey } : {},
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `Render returned HTTP ${res.status}`,
        url: config.evolutionApiUrl,
      });
    }

    const data = await res.json().catch(() => null);

    // Also check instance connection state if instanceName is provided
    let instanceState: string = "unknown";
    if (config.instanceName && config.evolutionApiKey) {
      try {
        const instRes = await fetch(
          `${config.evolutionApiUrl}/instance/connectionState/${config.instanceName}`,
          {
            headers: { apikey: config.evolutionApiKey },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (instRes.ok) {
          const instData = await instRes.json();
          instanceState = instData?.instance?.state || instData?.state || "unknown";
        }
      } catch {
        /* ignore instance check fail */
      }
    }

    return NextResponse.json({
      ok: true,
      url: config.evolutionApiUrl,
      serverMessage: data?.message || "Running",
      version: data?.version,
      instanceState,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: (e as Error).message,
      url: config.evolutionApiUrl,
    });
  }
}
