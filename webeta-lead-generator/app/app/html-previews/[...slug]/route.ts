import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import type { RankedLead } from "@/lib/types";

export const maxDuration = 30;

// Preview validity: active for 72 hours (3 days) from first view
const PREVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;
const SESSION_DEBOUNCE_MS = 20 * 60 * 1000; // 20 min debounce between distinct sessions
const VIEWS_FILE = path.join(process.cwd(), "data", "preview-views.json");

interface PreviewMeta {
  firstOpenedAt: number;
  lastOpenedAt: number;
  sessionCount: number;
  lastSessionAt: number;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPreviewMeta(cleanSlug: string): PreviewMeta | null {
  try {
    if (fs.existsSync(VIEWS_FILE)) {
      const data = JSON.parse(fs.readFileSync(VIEWS_FILE, "utf-8"));
      const raw = data[cleanSlug];
      if (!raw) return null;
      if (typeof raw === "number") {
        // Migrate legacy number format
        return {
          firstOpenedAt: Date.now() - 3600000,
          lastOpenedAt: Date.now(),
          sessionCount: raw,
          lastSessionAt: Date.now(),
        };
      }
      return raw;
    }
  } catch {}
  return null;
}

function recordPreviewVisit(cleanSlug: string): { isExpired: boolean; meta: PreviewMeta } {
  try {
    const dir = path.dirname(VIEWS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let data: Record<string, any> = {};
    if (fs.existsSync(VIEWS_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(VIEWS_FILE, "utf-8"));
      } catch {}
    }

    const now = Date.now();
    let meta: PreviewMeta = data[cleanSlug];

    if (!meta || typeof meta === "number") {
      // First visit! Initialize 72-hour window
      meta = {
        firstOpenedAt: now,
        lastOpenedAt: now,
        sessionCount: 1,
        lastSessionAt: now,
      };
    } else {
      meta.lastOpenedAt = now;
      // Only count as a new session if at least 20 minutes have passed since last counted session
      if (now - meta.lastSessionAt > SESSION_DEBOUNCE_MS) {
        meta.sessionCount = (meta.sessionCount || 1) + 1;
        meta.lastSessionAt = now;
      }
    }

    data[cleanSlug] = meta;
    fs.writeFileSync(VIEWS_FILE, JSON.stringify(data, null, 2), "utf-8");

    // Check expiry: expired ONLY if 72 hours have passed since first open OR more than 15 distinct sessions
    const elapsed = now - meta.firstOpenedAt;
    const isExpired = elapsed > PREVIEW_WINDOW_MS || meta.sessionCount > 15;

    return { isExpired, meta };
  } catch (err) {
    console.error("Failed to record preview visit:", err);
    return {
      isExpired: false,
      meta: { firstOpenedAt: Date.now(), lastOpenedAt: Date.now(), sessionCount: 1, lastSessionAt: Date.now() },
    };
  }
}

function extractBusinessName(html: string, fallback: string): string {
  const m = html.match(/<title>([^<|—–]+)/i);
  if (m && m[1].trim()) return m[1].trim();
  return fallback.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function injectTopBanner(html: string, businessName: string): string {
  if (html.includes("id=\"webeta-preview-banner\"")) {
    return html;
  }

  const banner = `
<div id="webeta-preview-banner" class="webeta-preview-banner" style="background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 11px 20px; display: flex; align-items: center; justify-content: space-between; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #f8fafc; border-bottom: 1px solid rgba(255,255,255,0.12); position: sticky; top: 0; z-index: 99999; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
  <div class="webeta-banner-left" style="display: flex; align-items: center; gap: 10px; min-width: 0;">
    <img src="/webeta-logo.jpg" alt="Webeta" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.25); flex-shrink: 0;" />
    <span class="webeta-banner-title" style="letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">⚡ Private Concept for <strong style="color: #fff; font-weight: 700;">${esc(businessName)}</strong> — Crafted by <strong style="color: #38bdf8;">Webeta</strong></span>
  </div>
  <div class="webeta-banner-right" style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
    <span class="webeta-banner-badge" style="font-size: 11px; color: #4ade80; background: rgba(74, 222, 128, 0.1); padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(74, 222, 128, 0.25); white-space: nowrap; display: flex; align-items: center; gap: 5px;">
      <span style="width: 6px; height: 6px; border-radius: 50%; background: #4ade80; display: inline-block;"></span>
      Private Preview Active
    </span>
    <a href="https://webeta.site" target="_blank" rel="noopener noreferrer" class="webeta-banner-link" style="color: #4ade80; text-decoration: none; font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 4px; padding: 4px 11px; background: rgba(74, 222, 128, 0.12); border-radius: 6px; border: 1px solid rgba(74, 222, 128, 0.3); white-space: nowrap;">webeta.site ↗</a>
  </div>
</div>`;

  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1\n${banner}`);
  }
  return banner + "\n" + html;
}

function renderLockedScreen(businessName: string, cleanSlug: string): string {
  const brandSlug = cleanSlug.split("_")[0] || "business";
  const waText = encodeURIComponent(`Hello Webeta, I want to activate the official website for ${businessName}`);
  const waUrl = `https://wa.me/919749883224?text=${waText}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sample Preview Period Expired — ${esc(businessName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 60%, #020617 100%);
      color: #f8fafc;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      max-width: 520px;
      width: 100%;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(56, 189, 248, 0.1);
      animation: fadeIn 0.6s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .logo-wrap {
      width: 88px;
      height: 88px;
      margin: 0 auto 24px;
      position: relative;
    }
    .logo-img {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #38bdf8;
      box-shadow: 0 0 25px rgba(56, 189, 248, 0.4);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      font-size: 13px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 999px;
      margin-bottom: 20px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 12px;
      line-height: 1.25;
    }
    .desc {
      font-size: 15px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .highlight-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 28px;
      font-size: 14px;
      color: #cbd5e1;
      line-height: 1.6;
      text-align: left;
    }
    .btn-wa {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: #ffffff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 700;
      padding: 16px 28px;
      border-radius: 999px;
      box-shadow: 0 10px 25px -5px rgba(34, 197, 94, 0.4);
      transition: all 0.2s ease;
    }
    .btn-wa:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px -5px rgba(34, 197, 94, 0.6);
    }
    .footer-link {
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
    }
    .footer-link a {
      color: #38bdf8;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-wrap">
      <img src="/webeta-logo.jpg" alt="Webeta" class="logo-img" />
    </div>
    <div class="badge">🔒 Sample Preview Period Expired</div>
    <h1>Launch Your Official Website</h1>
    <p class="desc">
      This bespoke website concept was custom-built for <strong style="color: #fff;">${esc(businessName)}</strong> by <strong style="color: #38bdf8;">Webeta</strong>.
    </p>
    <div class="highlight-box">
      To activate this live website on your official custom domain (e.g. <em>www.${esc(brandSlug)}.in</em>), connect direct WhatsApp ordering, and rank on Google Maps & Search, tap below to contact the Webeta team.
    </div>
    <a href="${waUrl}" target="_blank" class="btn-wa">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.121 1.523 5.854L.055 23.454a.5.5 0 0 0 .491.601l5.797-1.45A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.514-5.246-1.408l-.376-.218-3.897.975.999-3.794-.24-.386A9.945 9.945 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
      Chat on WhatsApp to Launch Site
    </a>
    <div class="footer-link">
      Official WhatsApp: <strong>+91 9749883224</strong> • <a href="https://webeta.site" target="_blank">webeta.site</a>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const filename = slug.join("/");
    const dataFilePath = path.join(process.cwd(), "data", "html-previews", filename);
    const publicFilePath = path.join(process.cwd(), "public", "html-previews", filename);
    const filePath = fs.existsSync(dataFilePath) ? dataFilePath : publicFilePath;
    const cleanSlug = filename.replace(/\.html$/i, "").toLowerCase();

    const url = new URL(req.url);
    const isAdmin =
      url.searchParams.get("admin") === "true" ||
      url.searchParams.get("unlock") === "true" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1";
    const ua = req.headers.get("user-agent") || "";
    const isBot = /bot|crawler|spider|facebookexternalhit|whatsapp|microlink|headlesschrome|puppeteer/i.test(ua);

    // Track views for real human visitors with 72-hour window and session deduplication
    let isExpired = false;
    if (!isAdmin && !isBot) {
      const visit = recordPreviewVisit(cleanSlug);
      isExpired = visit.isExpired;
    }

    // Check existing compiled file (in data/html-previews or public/html-previews)
    if (fs.existsSync(filePath)) {
      const rawContent = fs.readFileSync(filePath, "utf-8");
      const businessName = extractBusinessName(rawContent, cleanSlug);

      // If 72-hour preview window has expired, show locked activation screen
      if (!isAdmin && !isBot && isExpired) {
        return new Response(renderLockedScreen(businessName, cleanSlug), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      // Preview is ACTIVE: inject branding banner
      const content = injectTopBanner(rawContent, businessName);
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // Fallback: If requested preview HTML isn't compiled yet, find lead across sessions and compile dynamically
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
      const rawHtml = result.html || `<h1>${esc(targetLead.name)}</h1>`;

      const previewsDir = path.join(process.cwd(), "data", "html-previews");
      if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });
      fs.writeFileSync(dataFilePath, rawHtml, "utf-8");
      const businessName = targetLead.name || extractBusinessName(rawHtml, cleanSlug);

      if (!isAdmin && !isBot && isExpired) {
        return new Response(renderLockedScreen(businessName, cleanSlug), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        });
      }

      const html = injectTopBanner(rawHtml, businessName);
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
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

