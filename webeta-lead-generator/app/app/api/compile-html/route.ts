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
import { buildMultiPageHTML, type PageType } from "@/lib/multiPageTemplates";
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
  page?: PageType; // "home" (default) | "menu" | "gallery" | "services" | "rooms" | "programs" | "portfolio" | "products"
}

// ── POST: Compile HTML for a lead ──────────────────────────────────────────────
export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const body = (await req.json()) as CompileHtmlRequest;
    const { lead, strategy, force = false, page = "home" } = body;

    if (!lead?.id || !lead?.name) {
      return NextResponse.json({ ok: false, error: "No valid lead provided" }, { status: 400 });
    }

    const previewsDir = path.join(process.cwd(), "data", "html-previews");
    if (!fs.existsSync(previewsDir)) {
      fs.mkdirSync(previewsDir, { recursive: true });
    }

    const { fileSlug, relativePath } = generateHtmlSlug(lead);
    const pageSuffix = page !== "home" ? `_${page}` : "";
    const diskPath = path.join(previewsDir, `${fileSlug}${pageSuffix}.html`);
    const relPath = `/html-previews/${fileSlug}${pageSuffix}.html`;

    // Cache check — but reject old tiny files (< 20KB = broken skeleton)
    if (!force && fs.existsSync(diskPath)) {
      const existing = fs.readFileSync(diskPath, "utf-8");
      if (existing.length >= 20000) {
        return NextResponse.json({
          ok: true,
          cached: true,
          htmlUrl: relPath,
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

    // ── Compile HTML — home page or multi-page ────────────────────────────────
    let html = "";
    let provider = "template-engine";

    if (page === "home") {
      const result = await buildTemplateHTML(lead, strategy);
      if (!result.ok || !result.html) {
        return NextResponse.json({
          ok: false, error: result.error || "Template engine failed",
          leadId: lead.id, provider: result.provider,
        }, { status: 500 });
      }
      html = result.html;
      provider = result.provider;
    } else {
      const result = await buildMultiPageHTML(lead, page as PageType, strategy);
      if (!result.ok || !result.html) {
        return NextResponse.json({
          ok: false, error: result.error || `Multi-page template failed for ${page}`,
          leadId: lead.id, provider: "multi-page-template",
        }, { status: 500 });
      }
      html = result.html;
      provider = "multi-page-template";
    }

    // Save HTML to disk
    fs.writeFileSync(diskPath, html, "utf-8");

    const compilationTimeMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true, cached: false,
      htmlUrl: relPath,
      fileSlug, leadId: lead.id,
      provider, model: `typescript-${page}-template-v1`,
      htmlLength: html.length, compilationTimeMs, page,
      message: `${page} page generated via ${provider} in ${(compilationTimeMs / 1000).toFixed(2)}s`,
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

  const dataDir = path.join(process.cwd(), "data", "html-previews");
  const publicDir = path.join(process.cwd(), "public", "html-previews");
  const dirs = [dataDir, publicDir].filter((d) => fs.existsSync(d));
  if (dirs.length === 0) {
    return NextResponse.json(isList ? { exists: false, files: [] } : { exists: false });
  }

  const findFilePath = (filename: string): string | null => {
    for (const d of dirs) {
      const p = path.join(d, filename);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };

  const getAllFiles = (): string[] => {
    const fileSet = new Set<string>();
    for (const d of dirs) {
      try {
        const files = fs.readdirSync(d);
        for (const f of files) fileSet.add(f);
      } catch {}
    }
    return Array.from(fileSet);
  };

  if (isList || (!leadId && !name)) {
    const allFiles = getAllFiles().filter((f) => f.endsWith(".html"));
    // Filter out skeleton files (< 20KB)
    const goodFiles = allFiles.filter((f) => {
      const p = findFilePath(f);
      if (!p) return false;
      try {
        const stat = fs.statSync(p);
        return stat.size >= 20000;
      } catch { return false; }
    });
    return NextResponse.json({ exists: goodFiles.length > 0, files: goodFiles, count: goodFiles.length });
  }

  if (leadId && name) {
    const { fileSlug, relativePath } = generateHtmlSlug({ id: leadId, name, city });
    const targetPath = findFilePath(`${fileSlug}.html`);
    if (targetPath && fs.statSync(targetPath).size >= 20000) {
      return NextResponse.json({ exists: true, htmlUrl: relativePath, fileSlug, leadId });
    }
  }

  if (leadId) {
    const allFiles = getAllFiles();
    const match = allFiles.find((f) => f.includes(leadId));
    if (match) {
      const matchPath = findFilePath(match);
      if (matchPath && fs.statSync(matchPath).size >= 20000) {
        return NextResponse.json({ exists: true, htmlUrl: `/html-previews/${match}`, fileSlug: match.replace(/\.html$/, ""), leadId });
      }
    }
  }

  return NextResponse.json({ exists: false });
}
