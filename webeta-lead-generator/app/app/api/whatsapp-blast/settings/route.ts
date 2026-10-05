/**
 * /api/whatsapp-blast/settings
 * GET  - return saved Evolution API config
 * POST - save Evolution API config
 *
 * Stored server-side in .whatsapp-config.json (gitignored)
 */

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

const CONFIG_PATH = path.join(process.cwd(), ".whatsapp-config.json");

export interface WhatsAppConfig {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  instanceName: string;
  delayMinMs: number;
  delayMaxMs: number;
}

export const DEFAULT_CONFIG: WhatsAppConfig = {
  evolutionApiUrl: "",
  evolutionApiKey: "",
  instanceName: "webeta",
  delayMinMs: 8 * 60 * 1000,
  delayMaxMs: 20 * 60 * 1000,
};

export function readConfig(): WhatsAppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export function writeConfig(config: WhatsAppConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export async function GET() {
  const config = readConfig();
  return NextResponse.json({
    ...config,
    evolutionApiKey: config.evolutionApiKey ? "masked" : "",
    hasKey: !!config.evolutionApiKey,
    hasUrl: !!config.evolutionApiUrl,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<WhatsAppConfig>;
    const current = readConfig();

    const updated: WhatsAppConfig = {
      ...current,
      evolutionApiUrl: body.evolutionApiUrl ?? current.evolutionApiUrl,
      instanceName:    body.instanceName    ?? current.instanceName,
      delayMinMs:      body.delayMinMs      ?? current.delayMinMs,
      delayMaxMs:      body.delayMaxMs      ?? current.delayMaxMs,
      evolutionApiKey:
        body.evolutionApiKey && body.evolutionApiKey !== "masked"
          ? body.evolutionApiKey
          : current.evolutionApiKey,
    };

    writeConfig(updated);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
