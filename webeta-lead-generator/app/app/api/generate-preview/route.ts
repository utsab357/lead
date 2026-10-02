/**
 * /api/generate-preview — POST & GET
 *
 * Direct AI Website Preview Mockup Generator
 * Powered by Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)
 * with multi-account rotation and Pollinations.ai FLUX fallback.
 *
 * Collision-proof storage: public/previews/{businessSlug}_{citySlug}_{uniqueHash}_{page}.png
 */

import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { generateWebsitePreviewImage } from "@/lib/cloudflareAi";
import {
  buildWebsiteConceptMockupPrompt,
  generateCollisionProofSlug,
} from "@/lib/imagePromptWrapper";
import type { RankedLead, PreviewGenerationMethod } from "@/lib/types";

export const maxDuration = 120;

export interface GeneratePreviewParams {
  lead: RankedLead;
  mode?: "desktop" | "mobile" | "both";
  force?: boolean;
  buildPrompt?: string;
  pageType?: string;
  aspectRatio?: "vertical" | "widescreen" | "square";
  provider?: "cloudflare" | "pollinations" | "auto";
}

export interface GeneratePreviewResult {
  ok: boolean;
  cached?: boolean;
  generationMethod?: PreviewGenerationMethod;
  fallbackReason?: string;
  provider?: string;
  accountUsed?: string;
  model?: string;
  mode?: string;
  desktopUrl?: string;
  mobileUrl?: string;
  previewUrl?: string;
  fileSlug?: string;
  leadId?: string;
  pageType?: string;
  htmlUrl?: string;
  fromBuildPrompt?: boolean;
  prompt?: string;
  originalPrompt?: string;
  executionPrompt?: string;
  message?: string;
  error?: string;
}

export async function executeGeneratePreview(
  params: GeneratePreviewParams
): Promise<GeneratePreviewResult> {
  const { lead, pageType = "home", aspectRatio = "vertical", force = false } = params;
  const mode = params.mode ?? "desktop";

  if (!lead?.id || !lead?.name) {
    return { ok: false, error: "No valid lead provided" };
  }

  const { fileSlug, relativePngPath } = generateCollisionProofSlug(lead, pageType);
  const previewsDir = path.join(process.cwd(), "public", "previews");
  if (!fs.existsSync(previewsDir)) {
    fs.mkdirSync(previewsDir, { recursive: true });
  }

  const targetDiskPath = path.join(previewsDir, `${fileSlug}.png`);

  // Force regeneration: delete any existing previews for this lead
  if (force) {
    if (fs.existsSync(targetDiskPath)) fs.unlinkSync(targetDiskPath);
    if (fs.existsSync(previewsDir)) {
      const existing = fs.readdirSync(previewsDir);
      for (const f of existing) {
        if (f.startsWith(`${lead.id}.`) || f.startsWith(`${lead.id}-`) || f.includes(fileSlug)) {
          try { fs.unlinkSync(path.join(previewsDir, f)); } catch {}
        }
      }
    }
  }

  // Cache check (if not forced)
  if (!force) {
    if (fs.existsSync(targetDiskPath)) {
      return {
        ok: true,
        cached: true,
        generationMethod: "direct-image",
        provider: "cache",
        desktopUrl: relativePngPath,
        mobileUrl: relativePngPath,
        previewUrl: relativePngPath,
        fileSlug,
        leadId: lead.id,
        pageType,
        message: "Loaded from cache",
      };
    }
  }

  // Build the 2027 Visual Mockup Prompt with Image 2 guardrails
  const fullPrompt = params.buildPrompt || buildWebsiteConceptMockupPrompt(lead, {
    pageType,
    aspectRatio,
  });

  // Call the Cloudflare multi-account image generator (with Pollinations fallback)
  const imgRes = await generateWebsitePreviewImage(fullPrompt, {
    aspectRatio,
    provider: params.provider,
    timeoutMs: 50000,
  });

  if (!imgRes.ok || !imgRes.imageBuffer) {
    return {
      ok: false,
      leadId: lead.id,
      fileSlug,
      error: imgRes.error || "Failed to generate website preview image",
    };
  }

  // Save the verified image buffer to disk under collision-proof slug
  try {
    fs.writeFileSync(targetDiskPath, imgRes.imageBuffer);
  } catch (err: unknown) {
    return {
      ok: false,
      leadId: lead.id,
      error: `Failed to write preview image to disk: ${(err as Error).message}`,
    };
  }

  return {
    ok: true,
    cached: false,
    generationMethod: "direct-image",
    provider: imgRes.provider,
    accountUsed: imgRes.accountUsed,
    model: imgRes.modelUsed,
    mode,
    desktopUrl: relativePngPath,
    mobileUrl: relativePngPath,
    previewUrl: relativePngPath,
    fileSlug,
    leadId: lead.id,
    pageType,
    prompt: fullPrompt,
    message: `Preview generated successfully via ${imgRes.provider} (${imgRes.modelUsed}${
      imgRes.accountUsed ? ` - ${imgRes.accountUsed}` : ""
    })`,
  };
}

// ── POST: Generate preview ───────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GeneratePreviewParams;
    const result = await executeGeneratePreview(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, leadId: result.leadId }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: `Server error: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

// ── GET: Check preview cache status ──────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isList = searchParams.get("list") === "true";
  const leadId = searchParams.get("leadId");
  const fileSlugParam = searchParams.get("fileSlug");
  const name = searchParams.get("name");
  const city = searchParams.get("city") || "";

  const previewsDir = path.join(process.cwd(), "public", "previews");
  if (!fs.existsSync(previewsDir)) {
    return NextResponse.json(isList ? { exists: false, files: [] } : { exists: false });
  }

  // Batch query: return all existing preview filenames in ONE single call
  if (isList || (!leadId && !fileSlugParam && !name)) {
    const allFiles = fs.readdirSync(previewsDir).filter((f) => f.endsWith(".png"));
    return NextResponse.json({
      exists: allFiles.length > 0,
      files: allFiles,
      count: allFiles.length,
    });
  }

  // 1. Check specific fileSlug if provided
  if (fileSlugParam) {
    const slugPath = path.join(previewsDir, `${fileSlugParam}.png`);
    if (fs.existsSync(slugPath)) {
      return NextResponse.json({
        exists: true,
        previewUrl: `/previews/${fileSlugParam}.png`,
        desktopUrl: `/previews/${fileSlugParam}.png`,
        fileSlug: fileSlugParam,
      });
    }
  }

  // 2. Check collision-proof slug using lead info
  if (leadId && name) {
    const { fileSlug, relativePngPath } = generateCollisionProofSlug({ id: leadId, name, city }, "home");
    const targetPath = path.join(previewsDir, `${fileSlug}.png`);
    if (fs.existsSync(targetPath)) {
      return NextResponse.json({
        exists: true,
        previewUrl: relativePngPath,
        desktopUrl: relativePngPath,
        fileSlug,
        leadId,
      });
    }
  }

  // 3. Fallback scan for any file containing leadId or matching slug prefix
  if (leadId) {
    const files = fs.readdirSync(previewsDir);
    const match = files.find((f) => f.startsWith(`${leadId}.png`) || f.includes(leadId));
    if (match) {
      return NextResponse.json({
        exists: true,
        previewUrl: `/previews/${match}`,
        desktopUrl: `/previews/${match}`,
        fileSlug: match.replace(/\.png$/, ""),
        leadId,
      });
    }
  }

  return NextResponse.json({ exists: false });
}
