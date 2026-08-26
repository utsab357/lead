import { spawn } from "node:child_process";
import path from "node:path";
import type { Lead } from "@/lib/types";

/**
 * POST /api/scrape-single
 * Body: { input: string }  — Google Maps URL, Zomato URL, any URL, or business name
 * Response: { lead: Lead } | { error: string }
 */

export const maxDuration = 120; // 2 minutes

const SINGLE_SCRAPER = path.join(process.cwd(), "scripts", "single-scraper.mjs");

export async function POST(req: Request) {
  const { input } = (await req.json()) as { input: string };

  if (!input?.trim()) {
    return Response.json({ error: "Input is required" }, { status: 400 });
  }

  return new Promise<Response>((resolve) => {
    const sessionId = `manual-${Date.now()}`;
    let lead: Lead | null = null;
    let error: string | null = null;

    const child = spawn("node", [SINGLE_SCRAPER, input.trim(), sessionId], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";

    child.stdout.on("data", (d: Buffer) => {
      buffer += d.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "lead") lead = msg.lead as Lead;
          if (msg.type === "error") error = msg.message;
        } catch { /* non-JSON */ }
      }
    });

    child.stderr.on("data", (d: Buffer) => {
      const t = d.toString();
      if (t.includes("Error")) error = error ?? t.slice(0, 200);
    });

    child.on("close", () => {
      if (lead) {
        resolve(Response.json({ lead }));
      } else {
        resolve(Response.json(
          { error: error ?? "Could not extract business data from the provided input." },
          { status: 422 }
        ));
      }
    });

    child.on("error", (e) => {
      resolve(Response.json({ error: e.message }, { status: 500 }));
    });
  });
}
