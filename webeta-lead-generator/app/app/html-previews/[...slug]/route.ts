import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import type { RankedLead } from "@/lib/types";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const filename = slug.join("/");
    const filePath = path.join(process.cwd(), "public", "html-previews", filename);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Fallback: If requested preview HTML isn't compiled yet, find the lead across active sessions and compile on the fly!
    const cleanSlug = filename.replace(/\.html$/i, "").toLowerCase();
    const sessionsDir = path.join(process.cwd(), "data", "sessions");
    let targetLead: any = null;

    if (fs.existsSync(sessionsDir)) {
      const sessionFiles = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
      for (const file of sessionFiles) {
        try {
          const sess = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), "utf-8"));
          const found = sess.leads?.find((l: any) => {
            const leadSlug = (l.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
            return l.id === cleanSlug || leadSlug.includes(cleanSlug) || cleanSlug.includes(leadSlug);
          });
          if (found) {
            targetLead = found;
            break;
          }
        } catch {
          // ignore corrupted files
        }
      }
    }

    if (targetLead) {
      const { buildTemplateHTML } = await import("@/lib/htmlTemplate");
      const rankedLead = {
        ...targetLead,
        score: targetLead.score || 95,
        scoreReasoning: targetLead.scoreReasoning || "High-potential local business with strong demand and no modern website.",
        audit: targetLead.audit || {
          leadId: targetLead.id,
          pageSpeedScore: 0,
          hasWebsite: false,
          mobileFriendly: false,
          https: false,
          hasSchema: false,
          loadTimeMs: 0,
          gaps: ["No direct booking", "No mobile landing page"],
          biggestGap: "Losing local customer search traffic to online competitors",
          estLostRevenuePerMonth: 30000,
        },
      } as unknown as RankedLead;

      const result = await buildTemplateHTML(rankedLead);
      const html = result.html || `<h1>${targetLead.name}</h1>`;

      const previewsDir = path.join(process.cwd(), "public", "html-previews");
      if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });
      fs.writeFileSync(filePath, html, "utf-8");

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return new Response("Preview not found. Please click 'Compile' in the app first.", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    return new Response(`Error loading preview: ${(e as Error).message}`, { status: 500 });
  }
}
