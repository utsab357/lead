/**
 * /api/screenshot-preview — POST
 *
 * Takes a full-page screenshot of a compiled HTML preview using Playwright.
 * Input: { htmlUrl: string, leadId: string, businessName: string }
 * Output: saves PNG to public/previews/{slug}.png, returns { ok, previewUrl }
 *
 * This is how we generate shareable images — by rendering the real HTML site
 * in a headless browser and capturing a full-page screenshot.
 */

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

export const maxDuration = 120;

interface ScreenshotRequest {
  htmlUrl: string;       // e.g. /html-previews/forest_brew_barasat_abc12345.html
  leadId: string;
  businessName: string;
  force?: boolean;
  page?: string;         // "home" | "menu" | "gallery" | etc. — used for filename suffix
  device?: "desktop" | "mobile"; // screenshot viewport
  lead?: unknown;        // full lead for verification
  category?: string;
  city?: string;
  phone?: string;
}

function makeSlug(name: string, leadId: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) +
    "_" +
    leadId.slice(-8)
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScreenshotRequest;
    const { htmlUrl, leadId, businessName, force = false, page = "home", device = "desktop" } = body;

    if (!htmlUrl || !leadId || !businessName) {
      return NextResponse.json({ ok: false, error: "Missing htmlUrl, leadId or businessName" }, { status: 400 });
    }

    const slug = makeSlug(businessName, leadId);
    const pageSuffix = page !== "home" ? `_${page}` : "";
    const deviceSuffix = device === "mobile" ? "_mobile" : "";
    const previewsDir = path.join(process.cwd(), "public", "previews");
    if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });

    const pngPath = path.join(previewsDir, `${slug}${pageSuffix}${deviceSuffix}.png`);
    const pngUrl = `/previews/${slug}${pageSuffix}${deviceSuffix}.png`;

    // Cache check
    if (!force && fs.existsSync(pngPath)) {
      return NextResponse.json({ ok: true, cached: true, previewUrl: pngUrl });
    }

    // Build the full absolute URL to the HTML file
    const port = process.env.PORT || "3000";
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${port}`;
    const fullUrl = `${baseUrl}${htmlUrl}`;

    // Also get the file path directly as fallback
    const htmlFilePath = path.join(process.cwd(), "public", htmlUrl.replace(/^\//, ""));

    // Dynamically import Playwright to avoid SSR issues
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none",
      ],
    });

    const context = await browser.newContext({
      viewport: device === "mobile"
        ? { width: 390, height: 844 }   // iPhone 14 Pro
        : { width: 1280, height: 900 },
      deviceScaleFactor: 2,   // 2x retina — crisp text & images
      isMobile: device === "mobile",
      hasTouch: device === "mobile",
    });
    const pwPage = await context.newPage();

    // Try URL first, fallback to injecting HTML content directly
    let loaded = false;
    try {
      await pwPage.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      loaded = true;
    } catch {
      // If URL fails, load HTML file directly
      if (fs.existsSync(htmlFilePath)) {
        const htmlContent = fs.readFileSync(htmlFilePath, "utf-8");
        await pwPage.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 15000 });
        loaded = true;
      }
    }

    if (!loaded) {
      await browser.close();
      return NextResponse.json({ ok: false, error: "Could not load HTML for screenshot" }, { status: 500 });
    }

    // Wait 3s for fonts and images to settle
    await pwPage.waitForTimeout(3000);

    // Take full-page screenshot — 2x retina = crisp, professional quality
    const buffer = await pwPage.screenshot({
      fullPage: true,
      type: "png",
      animations: "disabled",
    });

    await context.close();
    await browser.close();

    // Save the PNG
    fs.writeFileSync(pngPath, buffer);

    // ── Run 3-layer safety verification ────────────────────────────────────
    const { runFullVerification } = await import("../../../lib/verifyGenerated");

    // Read the HTML for code checks
    let htmlContent = "";
    if (fs.existsSync(htmlFilePath)) {
      htmlContent = fs.readFileSync(htmlFilePath, "utf-8");
    }

    // Build a minimal lead object from request data for verification
    // Full lead data is passed via the body if available
    const leadForVerify = (body as any).lead || {
      id: leadId,
      name: businessName,
      category: (body as any).category || "",
      city: (body as any).city || "",
      phone: (body as any).phone || "",
    };

    // Run verification (AI check only if Gemini key available — costs 1 API call)
    const useAI = !!process.env.GEMINI_API_KEY && buffer.length < 10 * 1024 * 1024; // skip AI if PNG > 10MB
    const pngBase64 = useAI ? buffer.toString("base64") : undefined;

    const verification = await runFullVerification(htmlContent, buffer.length, leadForVerify, {
      pngBase64,
      geminiApiKey: process.env.GEMINI_API_KEY,
      skipAI: !useAI,
    });

    // Save verification result as sidecar JSON (same name, .verify.json)
    const verifyPath = pngPath.replace(/\.png$/, ".verify.json");
    fs.writeFileSync(verifyPath, JSON.stringify({
      ...verification,
      generatedAt: new Date().toISOString(),
      pngSize: buffer.length,
      htmlSize: htmlContent.length,
      businessName,
      leadId,
    }, null, 2));

    // ── Delete HTML after screenshot to save disk space ──────────────────────
    // PNG is the final artifact. HTML is only needed for rendering.
    if (fs.existsSync(htmlFilePath)) {
      try {
        fs.unlinkSync(htmlFilePath);
      } catch {
        // Non-fatal — HTML deletion failure doesn't block the response
      }
    }

    return NextResponse.json({
      ok: true,
      cached: false,
      previewUrl: pngUrl,
      message: `Screenshot saved for ${businessName}`,
      verification: {
        pass: verification.pass,
        score: verification.score,
        issues: verification.issues,
        layers: verification.layers,
      },
    });

  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("[screenshot-preview]", msg);
    return NextResponse.json(
      { ok: false, error: `Screenshot failed: ${msg.slice(0, 300)}` },
      { status: 500 }
    );
  }
}

// GET: check if screenshot exists for a lead
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  const businessName = searchParams.get("name") || "";
  const isList = searchParams.get("list") === "true";

  const previewsDir = path.join(process.cwd(), "public", "previews");
  if (!fs.existsSync(previewsDir)) {
    return NextResponse.json(isList ? { exists: false, files: [] } : { exists: false });
  }

  if (isList) {
    const files = fs.readdirSync(previewsDir).filter((f) => f.endsWith(".png"));
    return NextResponse.json({ exists: files.length > 0, files, count: files.length });
  }

  if (leadId) {
    const slug = makeSlug(businessName, leadId);
    const pngPath = path.join(previewsDir, `${slug}.png`);

    function readVerify(p: string) {
      try {
        const vp = p.replace(/\.png$/, ".verify.json");
        if (fs.existsSync(vp)) return JSON.parse(fs.readFileSync(vp, "utf-8"));
      } catch {}
      return null;
    }

    if (fs.existsSync(pngPath)) {
      return NextResponse.json({ exists: true, previewUrl: `/previews/${slug}.png`, verification: readVerify(pngPath) });
    }
    // Fallback scan by leadId hash
    const files = fs.readdirSync(previewsDir);
    const match = files.find((f) => f.endsWith(".png") && f.includes(leadId.slice(-8)));
    if (match) {
      const mp = path.join(previewsDir, match);
      return NextResponse.json({ exists: true, previewUrl: `/previews/${match}`, verification: readVerify(mp) });
    }
  }

  return NextResponse.json({ exists: false });
}
