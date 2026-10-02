/**
 * HTML Website Compiler — AI-Powered HTML Generation Engine
 *
 * Takes a RankedLead and produces a complete, self-contained HTML5 website using AI.
 *
 * Fallback chain: Gemini 2.5 Flash → Groq (llama-3.3-70b) → OpenRouter → Cloudflare Workers AI (5 accounts)
 *
 * Key design principles:
 *   - Every business gets a UNIQUE color palette, font, and layout based on its category
 *   - The prompt explicitly bans generic blue templates
 *   - Real business photos from Google Maps are injected
 *   - Output is a full rich site (target 30-80KB HTML), not a skeleton
 *   - After HTML is compiled, a Playwright screenshot captures a full-page PNG
 */

import type { RankedLead, BusinessStrategy } from "./types";
import { buildWebsiteSpec, specToCompilerMarkdown, getCategoryGalleryPhotos } from "./websiteSpec";
import { extractBusinessStrategyWithGroq } from "./businessStrategy";
import { getCloudflareAccounts } from "./cloudflareAi";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

export interface HtmlCompileResult {
  ok: boolean;
  html?: string;
  provider?: string;
  model?: string;
  tokensUsed?: number;
  compilationTimeMs?: number;
  error?: string;
}

/**
 * Extract clean HTML from AI response text.
 */
function extractHTML(rawText: string): string | null {
  if (!rawText || rawText.trim().length === 0) return null;

  let text = rawText.trim();

  // Remove markdown fences
  const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Find HTML start
  const doctypeIdx = text.indexOf("<!DOCTYPE");
  const htmlIdx = text.indexOf("<html");
  const startIdx = doctypeIdx >= 0 ? doctypeIdx : htmlIdx;
  if (startIdx < 0) return null;

  // Find HTML end
  const endIdx = text.lastIndexOf("</html>");
  text = endIdx >= 0 ? text.slice(startIdx, endIdx + 7) : text.slice(startIdx);

  // Basic validation
  if (!text.includes("<head") || !text.includes("<body")) return null;

  // Must be substantial — reject skeleton outputs
  if (text.length < 5000) return null;

  return text;
}

/**
 * Build the AI prompt for a specific lead.
 * This injects all unique business data, the mandatory color palette,
 * real photos, and strongly instructs the AI to produce a full, unique site.
 */
function buildCompilerPrompt(lead: RankedLead, bizStrategy: BusinessStrategy): string {
  const spec = buildWebsiteSpec(lead, "ai-decides", bizStrategy);
  return specToCompilerMarkdown(spec);
}

// ── Provider implementations ──────────────────────────────────────────────────

async function compileWithGemini(prompt: string): Promise<HtmlCompileResult> {
  if (!GEMINI_KEY) return { ok: false, error: "GEMINI_API_KEY not configured", provider: "gemini" };

  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 65536 },
        }),
      });

      if (res.status === 429 || res.status === 503) continue;
      if (res.status === 404) continue;
      if (!res.ok) {
        const e = await res.text().catch(() => "");
        return { ok: false, error: `Gemini ${model} HTTP ${res.status}: ${e.slice(0, 200)}`, provider: "gemini", model };
      }

      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const html = extractHTML(rawText);
      if (!html) continue;

      return { ok: true, html, provider: "gemini", model, tokensUsed: json?.usageMetadata?.totalTokenCount };
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg.includes("429") || msg.includes("quota") || msg.includes("503")) continue;
      return { ok: false, error: `Gemini error: ${msg.slice(0, 200)}`, provider: "gemini", model };
    }
  }

  return { ok: false, error: "Gemini: all models failed or rate limited", provider: "gemini" };
}

async function compileWithGroq(prompt: string): Promise<HtmlCompileResult> {
  if (!GROQ_KEY) return { ok: false, error: "GROQ_API_KEY not configured", provider: "groq" };

  const models = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
  ];

  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 32768,
          messages: [
            {
              role: "system",
              content: "You are an elite frontend web developer. Output ONLY complete, valid HTML5 code. Start with <!DOCTYPE html>. No markdown fences, no explanations. Write full, rich websites with all sections completely filled out — minimum 8 sections.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (res.status === 429 || res.status === 404) continue;
      if (!res.ok) {
        const e = await res.text().catch(() => "");
        return { ok: false, error: `Groq ${model} HTTP ${res.status}: ${e.slice(0, 200)}`, provider: "groq", model };
      }

      const json = await res.json();
      const rawText: string = json?.choices?.[0]?.message?.content ?? "";
      const cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!cleanText) continue;

      const html = extractHTML(cleanText);
      if (!html) continue;

      return { ok: true, html, provider: "groq", model, tokensUsed: json?.usage?.total_tokens };
    } catch { continue; }
  }

  return { ok: false, error: "Groq: all models failed or rate limited", provider: "groq" };
}

async function compileWithOpenRouter(prompt: string): Promise<HtmlCompileResult> {
  if (!OPENROUTER_KEY) return { ok: false, error: "OPENROUTER_API_KEY not configured", provider: "openrouter" };

  const models = [
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-2-9b-it:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
  ];

  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "HTTP-Referer": "https://webeta.app",
          "X-Title": "Webeta Lead Generator",
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 16384,
          messages: [
            {
              role: "system",
              content: "You are an elite frontend web developer. Output ONLY complete, valid HTML5 code. Start with <!DOCTYPE html>. No markdown fences, no explanations. Write full rich websites.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!res.ok) continue;

      const json = await res.json();
      const rawText: string = json?.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) continue;

      const html = extractHTML(rawText);
      if (!html) continue;

      return { ok: true, html, provider: "openrouter", model, tokensUsed: json?.usage?.total_tokens };
    } catch { continue; }
  }

  return { ok: false, error: "OpenRouter: all free models failed", provider: "openrouter" };
}

async function compileWithCloudflare(prompt: string): Promise<HtmlCompileResult> {
  const accounts = getCloudflareAccounts();
  if (accounts.length === 0) return { ok: false, error: "No Cloudflare accounts configured", provider: "cloudflare-text" };

  const textModels = [
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/meta/llama-3-8b-instruct",
    "@cf/mistral/mistral-7b-instruct-v0.2",
  ];

  // Truncate prompt for Cloudflare's smaller context
  const safePrompt = prompt.length > 6000
    ? prompt.slice(0, 5900) + "\n\nWrite the complete HTML now starting with <!DOCTYPE html>:"
    : prompt;

  const errors: string[] = [];

  for (const account of accounts) {
    for (const model of textModels) {
      try {
        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${model}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${account.apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "You are an elite frontend web developer. Output ONLY complete HTML5 code starting with <!DOCTYPE html>. Write full rich websites with all sections. No markdown, no explanations.",
              },
              { role: "user", content: safePrompt },
            ],
            max_tokens: 4096,
            temperature: 0.4,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.status === 429 || res.status === 402 || res.status === 403) {
          errors.push(`${account.label} rate limited`);
          break;
        }
        if (res.status === 404) continue;
        if (!res.ok) { errors.push(`${account.label} HTTP ${res.status}`); continue; }

        const json = await res.json();
        const rawText: string = json?.result?.response ?? "";
        if (!rawText.trim()) { errors.push(`${account.label} ${model}: empty`); continue; }

        const html = extractHTML(rawText);
        if (!html) { errors.push(`${account.label} ${model}: no valid HTML`); continue; }

        return { ok: true, html, provider: "cloudflare-text", model: `${model} (${account.label})` };
      } catch (err) {
        errors.push(`${account.label}: ${(err as Error).message?.slice(0, 60)}`);
        continue;
      }
    }
  }

  return {
    ok: false,
    error: `Cloudflare: all accounts/models failed — ${errors.slice(0, 3).join("; ")}`,
    provider: "cloudflare-text",
  };
}

// ── Master compiler ───────────────────────────────────────────────────────────

/**
 * Master HTML Compiler
 * Fallback chain: Gemini → Groq → OpenRouter → Cloudflare (5 accounts)
 */
export async function compileLeadToHTML(
  lead: RankedLead,
  style: string = "ai-decides",
  strategy?: BusinessStrategy
): Promise<HtmlCompileResult> {
  const startTime = Date.now();

  // 1. Build business strategy
  const bizStrategy = strategy || await extractBusinessStrategyWithGroq(lead);

  // 2. Build the prompt with all unique business data
  const prompt = buildCompilerPrompt(lead, bizStrategy);

  // 3. Try providers in order
  const geminiResult = await compileWithGemini(prompt);
  if (geminiResult.ok) return { ...geminiResult, compilationTimeMs: Date.now() - startTime };

  const groqResult = await compileWithGroq(prompt);
  if (groqResult.ok) return { ...groqResult, compilationTimeMs: Date.now() - startTime };

  const orResult = await compileWithOpenRouter(prompt);
  if (orResult.ok) return { ...orResult, compilationTimeMs: Date.now() - startTime };

  const cfResult = await compileWithCloudflare(prompt);
  if (cfResult.ok) return { ...cfResult, compilationTimeMs: Date.now() - startTime };

  return {
    ok: false,
    error: [
      `Gemini: ${geminiResult.error}`,
      `Groq: ${groqResult.error}`,
      `OpenRouter: ${orResult.error}`,
      `Cloudflare: ${cfResult.error}`,
    ].join(" | "),
    compilationTimeMs: Date.now() - startTime,
  };
}
