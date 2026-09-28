/**
 * /api/generate-preview — POST
 * Generates a website HTML preview for a business lead using Gemini (primary)
 * or Groq (fallback), renders it in headless Playwright Chromium,
 * and saves full-page screenshots to /public/previews/.
 *
 * Uses Tailwind CDN in the generated HTML for consistent, high-quality styling.
 * Gemini is used first because it powers Google Stitch and is best at web UI.
 */

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { buildPreviewHtmlPrompt } from "@/lib/previewHtml";
import type { RankedLead } from "@/lib/types";

export const maxDuration = 120; // 2 min per call

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/**
 * Inject Tailwind CDN + play CDN config into generated HTML if not already present.
 * This ensures the model's Tailwind classes actually render correctly.
 */
function injectTailwind(html: string): string {
  if (html.includes("cdn.tailwindcss.com") || html.includes("tailwindcss")) return html;
  const tailwindScript = `
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            serif: ['Playfair Display', 'Georgia', 'serif'],
            display: ['Plus Jakarta Sans', 'sans-serif'],
          },
        },
      },
    }
  </script>`;
  // Insert right after <head>
  return html.replace(/(<head[^>]*>)/i, `$1${tailwindScript}`);
}

/**
 * Try Gemini first (powers Google Stitch — best at web UI generation),
 * then fall back to Groq models.
 */
async function generateHtml(lead: RankedLead): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const prompt = buildPreviewHtmlPrompt(lead);
  const systemInstruction = "You are a world-class web designer in 2026. Output ONLY complete, valid HTML. No markdown code fences, no explanation. Start immediately with <!DOCTYPE html>.";

  // ── 1. Try Gemini first (same model as Google Stitch) ──────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const res = await fetch(`${GEMINI_API_URL}?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 8192,
            responseMimeType: "text/plain",
          },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        let html: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        if (html.startsWith("<!") || html.startsWith("<html")) {
          return { ok: true, html: injectTailwind(html) };
        }
        // Try to find start of HTML
        const idx = html.indexOf("<!DOCTYPE");
        const idx2 = html.indexOf("<html");
        const start = idx !== -1 ? idx : idx2;
        if (start >= 0) return { ok: true, html: injectTailwind(html.slice(start)) };
      }
    } catch { /* fall through to Groq */ }
  }

  // ── 2. Fall back to Groq ───────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return { ok: false, error: "No GEMINI_API_KEY or GROQ_API_KEY configured in .env.local" };

  const models = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
  ];

  for (const model of models) {
    try {
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          max_tokens: 8192,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.status === 401) return { ok: false, error: "Invalid Groq API key" };
      if (res.status === 404) continue;
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 20000)); continue; }
      if (!res.ok) continue;

      const json = await res.json();
      let html: string = json?.choices?.[0]?.message?.content ?? "";
      if (!html.trim()) continue;

      html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      if (!html.startsWith("<!") && !html.startsWith("<html")) {
        const idx = html.indexOf("<!DOCTYPE");
        const idx2 = html.indexOf("<html");
        const start = idx !== -1 ? idx : idx2;
        if (start > 0) html = html.slice(start);
      }

      return { ok: true, html: injectTailwind(html) };
    } catch { continue; }
  }

  return { ok: false, error: "All AI models failed — try again later." };
}

/**
 * Takes a full-page screenshot of the HTML using Playwright Chromium.
 * Desktop: 1280px wide. Mobile: 390px wide (iPhone 14).
 * Both captures are fullPage — entire rendered page, not just the viewport.
 */
async function screenshotHtml(
  html: string,
  leadId: string,
): Promise<{ ok: true; filePath: string; publicUrl: string } | { ok: false; error: string }> {
  try {
    const { chromium } = await import("playwright");

    const previewsDir = path.join(process.cwd(), "public", "previews");
    if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });

    const fileName = `${leadId}.png`;
    const filePath = path.join(previewsDir, fileName);
    const thumbPath = path.join(previewsDir, `${leadId}-thumb.png`);

    const browser = await chromium.launch({ headless: true });

    // ── Desktop full-page screenshot (1280px wide) ──────────────────────────
    const desktopCtx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1.5,
    });
    const desktopPage = await desktopCtx.newPage();
    await desktopPage.setContent(html, { waitUntil: "networkidle", timeout: 45000 });
    await desktopPage.waitForTimeout(3000); // let Google Fonts + AOS settle
    await desktopPage.screenshot({
      path: filePath,
      fullPage: true,  // entire page — not clipped to viewport
      type: "png",
    });
    await desktopCtx.close();

    // ── Mobile full-page screenshot (390px wide — iPhone 14 Pro) ────────────
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.setContent(html, { waitUntil: "networkidle", timeout: 45000 });
    await mobilePage.waitForTimeout(2500);
    await mobilePage.screenshot({
      path: thumbPath,
      fullPage: true,  // entire mobile page — not clipped
      type: "png",
    });
    await mobileCtx.close();

    await browser.close();

    return {
      ok: true,
      filePath,
      publicUrl: `/previews/${fileName}`,
    };
  } catch (e) {
    return { ok: false, error: `Screenshot failed: ${(e as Error).message}` };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { lead: RankedLead };
    const { lead } = body;

    if (!lead?.id) {
      return NextResponse.json({ error: "No lead provided" }, { status: 400 });
    }

    // Check if preview already exists
    const previewsDir = path.join(process.cwd(), "public", "previews");
    const existingPath = path.join(previewsDir, `${lead.id}.png`);
    if (fs.existsSync(existingPath)) {
      return NextResponse.json({
        ok: true,
        cached: true,
        desktopUrl: `/previews/${lead.id}.png`,
        mobileUrl: `/previews/${lead.id}-thumb.png`,
        message: "Loaded from cache",
      });
    }

    // Step 1: Generate HTML via Groq
    const htmlResult = await generateHtml(lead);
    if (!htmlResult.ok) {
      return NextResponse.json({ error: htmlResult.error }, { status: 500 });
    }

    // Step 2: Screenshot via Playwright
    const shotResult = await screenshotHtml(htmlResult.html, lead.id);
    if (!shotResult.ok) {
      return NextResponse.json({ error: shotResult.error }, { status: 500 });
    }

    // Step 3: Save the generated HTML too (for re-use / editing)
    const htmlPath = path.join(previewsDir, `${lead.id}.html`);
    fs.writeFileSync(htmlPath, htmlResult.html, "utf-8");

    return NextResponse.json({
      ok: true,
      cached: false,
      desktopUrl: `/previews/${lead.id}.png`,
      mobileUrl: `/previews/${lead.id}-thumb.png`,
      htmlUrl: `/previews/${lead.id}.html`,
      message: "Preview generated successfully",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Server error: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

/** GET /api/generate-preview?leadId=xxx — check if a preview exists */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ exists: false });

  const previewsDir = path.join(process.cwd(), "public", "previews");
  const pngPath = path.join(previewsDir, `${leadId}.png`);
  const thumbPath = path.join(previewsDir, `${leadId}-thumb.png`);
  const htmlPath = path.join(previewsDir, `${leadId}.html`);

  const exists = fs.existsSync(pngPath);
  return NextResponse.json({
    exists,
    desktopUrl: exists ? `/previews/${leadId}.png` : null,
    mobileUrl: fs.existsSync(thumbPath) ? `/previews/${leadId}-thumb.png` : null,
    htmlUrl: fs.existsSync(htmlPath) ? `/previews/${leadId}.html` : null,
  });
}
