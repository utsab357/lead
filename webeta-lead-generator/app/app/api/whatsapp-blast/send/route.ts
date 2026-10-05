/**
 * /api/whatsapp-blast/send  - POST
 *
 * Starts the WhatsApp blast queue.
 * For each lead (that has a whatsapp number + outreach message):
 *   1. Sends the website preview image (if available)
 *   2. Waits 3 seconds
 *   3. Sends the personalized text message
 *   4. Waits random delay (delayMinMs - delayMaxMs) before next lead
 *
 * Blast runs asynchronously in the background.
 * Progress is written to .whatsapp-blast-state.json so the /status route can read it.
 */

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { readConfig } from "../settings/route";

export const maxDuration = 60; // 60s per HTTP req � blast runs as background async

// -- Blast state file ---------------------------------------------------------
const STATE_PATH = path.join(process.cwd(), ".whatsapp-blast-state.json");

export interface BlastLead {
  id: string;
  name: string;
  phone: string;        // cleaned E.164 number e.g. "919876543210"
  message: string;      // personalized first message
  imageUrl?: string;    // absolute URL to preview PNG
}

export type BlastStatus = "idle" | "running" | "paused" | "done" | "error";

export interface BlastState {
  status: BlastStatus;
  total: number;
  done: number;
  failed: number;
  currentName: string;
  nextSendAt: number;   // epoch ms - when next msg fires
  log: { name: string; phone: string; result: "sent" | "failed"; error?: string; ts: number }[];
  startedAt: number;
  updatedAt: number;
}

export function readBlastState(): BlastState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as BlastState;
    }
  } catch { /* ignore */ }
  return {
    status: "idle",
    total: 0,
    done: 0,
    failed: 0,
    currentName: "",
    nextSendAt: 0,
    log: [],
    startedAt: 0,
    updatedAt: Date.now(),
  };
}

export function writeBlastState(state: BlastState) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

// -- Evolution API helpers -----------------------------------------------------
async function sendEvolutionText(
  apiUrl: string,
  apiKey: string,
  instance: string,
  phone: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendEvolutionImage(
  apiUrl: string,
  apiKey: string,
  instance: string,
  phone: string,
  imageUrl: string,
  caption: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${apiUrl}/message/sendMedia/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: phone,
        mediatype: "image",
        mimetype: "image/png",
        caption,
        media: imageUrl,
        fileName: "website-preview.png",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendEvolutionPresence(
  apiUrl: string,
  apiKey: string,
  instance: string,
  phone: string
): Promise<void> {
  try {
    await fetch(`${apiUrl}/chat/sendPresence/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: phone,
        delay: 2500,
        presence: "composing",
      }),
    });
  } catch {
    /* ignore presence errors */
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// -- Background blast runner ---------------------------------------------------
async function runBlast(leads: BlastLead[], appBaseUrl: string) {
  const config = readConfig();
  const { evolutionApiUrl, evolutionApiKey, instanceName, delayMinMs, delayMaxMs } = config;

  const state = readBlastState();
  state.status = "running";
  state.total = leads.length;
  state.done = 0;
  state.failed = 0;
  state.log = [];
  state.startedAt = Date.now();
  state.updatedAt = Date.now();
  writeBlastState(state);

  for (let i = 0; i < leads.length; i++) {
    // Check if paused/stopped mid-blast
    const currentState = readBlastState();
    if (currentState.status === "paused") {
      // Wait until resumed or stopped
      while (true) {
        await sleep(5000);
        const s = readBlastState();
        if (s.status === "running") break;
        if (s.status === "idle" || s.status === "done") return;
      }
    }
    if (currentState.status === "idle") return; // stopped

    const lead = leads[i];

    // Update state: show who we are currently sending to
    const s = readBlastState();
    s.currentName = lead.name;
    s.updatedAt = Date.now();
    writeBlastState(s);

    let success = false;
    let errorMsg: string | undefined;

    try {
      // Step 1: Send image (if preview exists)
      if (lead.imageUrl) {
        // Make absolute URL for Evolution API to fetch from
        const absoluteImageUrl = lead.imageUrl.startsWith("http")
          ? lead.imageUrl
          : `${appBaseUrl}${lead.imageUrl}`;

        const imgResult = await sendEvolutionImage(
          evolutionApiUrl,
          evolutionApiKey,
          instanceName,
          lead.phone,
          absoluteImageUrl,
          "" // no caption � text message comes separately
        );

        if (!imgResult.ok) {
          // Log image failure but still try text
          console.warn(`[WhatsApp Blast] Image send failed for ${lead.name}: ${imgResult.error}`);
        }
        // Wait 3 seconds between image and text
        await sleep(3000);
      }

      // Step 2: Simulate human "typing..." presence for 2.5 seconds
      await sendEvolutionPresence(evolutionApiUrl, evolutionApiKey, instanceName, lead.phone);
      await sleep(2500);

      // Step 3: Send text message
      const textResult = await sendEvolutionText(
        evolutionApiUrl,
        evolutionApiKey,
        instanceName,
        lead.phone,
        lead.message
      );

      if (textResult.ok) {
        success = true;
      } else {
        errorMsg = textResult.error;
      }
    } catch (e) {
      errorMsg = (e as Error).message;
    }

    // Update state with result
    const updatedState = readBlastState();
    updatedState.done++;
    if (!success) updatedState.failed++;
    updatedState.log.push({
      name: lead.name,
      phone: lead.phone,
      result: success ? "sent" : "failed",
      error: errorMsg,
      ts: Date.now(),
    });

    // If more leads remain, calculate next send time
    if (i < leads.length - 1) {
      const delay = randomDelay(delayMinMs, delayMaxMs);
      updatedState.nextSendAt = Date.now() + delay;
      updatedState.updatedAt = Date.now();
      writeBlastState(updatedState);
      await sleep(delay);
    } else {
      updatedState.status = "done";
      updatedState.nextSendAt = 0;
      updatedState.currentName = "";
      updatedState.updatedAt = Date.now();
      writeBlastState(updatedState);
    }
  }
}

// -- POST handler --------------------------------------------------------------
export async function POST(req: Request) {
  const config = readConfig();
  if (!config.evolutionApiUrl || !config.evolutionApiKey) {
    return NextResponse.json(
      { ok: false, error: "Evolution API not configured. Please add your VPS URL and API key in WhatsApp Settings." },
      { status: 400 }
    );
  }

  const currentState = readBlastState();
  if (currentState.status === "running") {
    return NextResponse.json({ ok: false, error: "A blast is already running." }, { status: 409 });
  }

  const { leads, appBaseUrl } = await req.json() as { leads: BlastLead[]; appBaseUrl: string };
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: false, error: "No leads to send." }, { status: 400 });
  }

  // Start async � do NOT await, return immediately
  runBlast(leads, appBaseUrl || "").catch((e) => {
    const s = readBlastState();
    s.status = "error";
    s.updatedAt = Date.now();
    writeBlastState(s);
    console.error("[WhatsApp Blast] Fatal error:", e);
  });

  return NextResponse.json({ ok: true, queued: leads.length });
}
