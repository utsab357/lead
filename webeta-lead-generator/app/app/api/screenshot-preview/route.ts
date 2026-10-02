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
    const { htmlUrl, leadId, businessName, force = false } = body;

    if (!htmlUrl || !leadId || !businessName) {
      return NextResponse.json({ ok: false, error: "Missing htmlUrl, leadId or businessName" }, { status: 400 });
    }

    const slug = makeSlug(businessName, leadId);
    const previewsDir = path.join(process.cwd(), "public", "previews");
    if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });

    const pngPath = path.join(previewsDir, `${slug}.png`);
    const pngUrl = `/previews/${slug}.png`;

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

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });

    // Try URL first, fallback to injecting HTML content directly
    let loaded = false;
    try {
      await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      loaded = true;
    } catch {
      // If URL fails, load HTML file directly
      if (fs.existsSync(htmlFilePath)) {
        const htmlContent = fs.readFileSync(htmlFilePath, "utf-8");
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 15000 });
        loaded = true;
      }
    }

    if (!loaded) {
      await browser.close();
      return NextResponse.json({ ok: false, error: "Could not load HTML for screenshot" }, { status: 500 });
    }

    // Wait 3s for fonts and images to settle
    await page.waitForTimeout(3000);

    // Take full-page screenshot
    const buffer = await page.screenshot({
      fullPage: true,
      type: "png",
      animations: "disabled",
    });

    await browser.close();

    // Save the PNG
    fs.writeFileSync(pngPath, buffer);

    return NextResponse.json({
      ok: true,
      cached: false,
      previewUrl: pngUrl,
      message: `Screenshot saved for ${businessName}`,
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
    if (fs.existsSync(pngPath)) {
      return NextResponse.json({ exists: true, previewUrl: `/previews/${slug}.png` });
    }
    // Fallback scan by leadId hash
    const files = fs.readdirSync(previewsDir);
    const match = files.find((f) => f.includes(leadId.slice(-8)));
    if (match) {
      return NextResponse.json({ exists: true, previewUrl: `/previews/${match}` });
    }
  }

  return NextResponse.json({ exists: false });
}
