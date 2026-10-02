/**
 * /api/compile-html — POST & GET
 *
 * Website Compiler API — now uses the TypeScript Template Engine as PRIMARY method.
 * The template engine generates complete, guaranteed-correct HTML in <1ms.
 * AI fallback is available but rarely needed.
 *
 * POST: Compile HTML for a lead
 * GET:  Check if compiled HTML exists / list all
 *
 * Storage: public/html-previews/{slug}.html
 */

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { buildTemplateHTML } from "@/lib/htmlTemplate";
import type { RankedLead, BusinessStrategy } from "@/lib/types";

export const maxDuration = 60;

function generateHtmlSlug(lead: { id: string; name: string; city?: string }): {
  fileSlug: string;
  relativePath: string;
} {
  const namePart = lead.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
  const cityPart = (lead.city || "city")
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 15);
  const hash = lead.id.slice(-8);
  const fileSlug = `${namePart}_${cityPart}_${hash}`;
  return { fileSlug, relativePath: `/html-previews/${fileSlug}.html` };
}

interface CompileHtmlRequest {
  lead: RankedLead;
  style?: string;
  strategy?: BusinessStrategy;
  force?: boolean;
}

// ── POST: Compile HTML for a lead ──────────────────────────────────────────────
export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const body = (await req.json()) as CompileHtmlRequest;
    const { lead, strategy, force = false } = body;

    if (!lead?.id || !lead?.name) {
      return NextResponse.json({ ok: false, error: "No valid lead provided" }, { status: 400 });
    }

    const previewsDir = path.join(process.cwd(), "public", "html-previews");
    if (!fs.existsSync(previewsDir)) {
      fs.mkdirSync(previewsDir, { recursive: true });
    }

    const { fileSlug, relativePath } = generateHtmlSlug(lead);
    const diskPath = path.join(previewsDir, `${fileSlug}.html`);

    // Cache check — but reject old tiny files (< 20KB = broken skeleton)
    if (!force && fs.existsSync(diskPath)) {
      const existing = fs.readFileSync(diskPath, "utf-8");
      if (existing.length >= 20000) {
        return NextResponse.json({
          ok: true,
          cached: true,
          htmlUrl: relativePath,
          fileSlug,
          leadId: lead.id,
          htmlLength: existing.length,
          provider: "template-engine",
          message: "Loaded from cache",
        });
      }
      // Too small — delete and regenerate
      fs.unlinkSync(diskPath);
    }

    if (force && fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }

    // ── PRIMARY: TypeScript Template Engine + AI copy (fast, guaranteed correct) ──
    const result = await buildTemplateHTML(lead, strategy);

    if (!result.ok || !result.html) {
      return NextResponse.json({
        ok: false,
        error: result.error || "Template engine failed",
        leadId: lead.id,
        provider: result.provider,
      }, { status: 500 });
    }

    // Save HTML to disk
    fs.writeFileSync(diskPath, result.html, "utf-8");

    const compilationTimeMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      cached: false,
      htmlUrl: relativePath,
      fileSlug,
      leadId: lead.id,
      provider: result.provider,
      model: "typescript-template-v1",
      htmlLength: result.html.length,
      compilationTimeMs,
      message: `Website generated via ${result.provider} in ${(compilationTimeMs / 1000).toFixed(2)}s`,
    });

  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Server error: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

// ── GET: Check if compiled HTML exists ─────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isList = searchParams.get("list") === "true";
  const leadId = searchParams.get("leadId");
  const name = searchParams.get("name");
  const city = searchParams.get("city") || "";

  const previewsDir = path.join(process.cwd(), "public", "html-previews");
  if (!fs.existsSync(previewsDir)) {
    return NextResponse.json(isList ? { exists: false, files: [] } : { exists: false });
  }

  if (isList || (!leadId && !name)) {
    const allFiles = fs.readdirSync(previewsDir).filter((f) => f.endsWith(".html"));
    // Filter out skeleton files (< 20KB)
    const goodFiles = allFiles.filter((f) => {
      try {
        const stat = fs.statSync(path.join(previewsDir, f));
        return stat.size >= 20000;
      } catch { return false; }
    });
    return NextResponse.json({ exists: goodFiles.length > 0, files: goodFiles, count: goodFiles.length });
  }

  if (leadId && name) {
    const { fileSlug, relativePath } = generateHtmlSlug({ id: leadId, name, city });
    const targetPath = path.join(previewsDir, `${fileSlug}.html`);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size >= 20000) {
      return NextResponse.json({ exists: true, htmlUrl: relativePath, fileSlug, leadId });
    }
  }

  if (leadId) {
    const files = fs.readdirSync(previewsDir);
    const match = files.find((f) => f.includes(leadId.slice(-8)));
    if (match) {
      const matchPath = path.join(previewsDir, match);
      if (fs.statSync(matchPath).size >= 20000) {
        return NextResponse.json({ exists: true, htmlUrl: `/html-previews/${match}`, fileSlug: match.replace(/\.html$/, ""), leadId });
      }
    }
  }

  return NextResponse.json({ exists: false });
}
