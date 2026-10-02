/**
 * Shared AI runner with full 4-provider fallback chain.
 * Chain: Groq → Gemini → OpenRouter → Cloudflare Workers AI (5 accounts)
 *
 * Import this in ALL API routes instead of calling providers directly.
 * Adding a new provider here automatically applies to every phase.
 */

import { runGroqJSON }        from "./groq";
import { runGeminiJSON }      from "./gemini";
import { runOpenRouterJSON }  from "./openrouter";
import { runCloudflareJSON }  from "./cloudflareAi";

export type AIResult<T> =
  | { ok: true;  data: T; source: string }
  | { ok: false; error: string };

/**
 * Run a JSON prompt through the full AI fallback chain.
 * Tries each provider in order, returns the first success.
 * On total failure, returns a detailed error message naming each provider's failure reason.
 */
export async function runAI<T>(
  prompt: string,
  opts: { temperature?: number } = {},
): Promise<AIResult<T>> {
  // ── 1. Groq (fastest, highest limits) ────────────────────────────────────
  const groqResult = await runGroqJSON<T>(prompt, opts);
  if (groqResult.ok) return { ...groqResult, source: "groq" };

  // ── 2. Gemini (primary Google model) ─────────────────────────────────────
  const geminiResult = await runGeminiJSON<T>(prompt, opts);
  if (geminiResult.ok) return { ...geminiResult, source: "gemini" };

  // ── 3. OpenRouter (free models as fallback) ──────────────────────────────
  const orResult = await runOpenRouterJSON<T>(prompt, opts);
  if (orResult.ok) return { ...orResult, source: "openrouter" };

  // ── 4. Cloudflare Workers AI (5 accounts × 3 models = 15 attempts) ──────
  const cfResult = await runCloudflareJSON<T>(prompt, opts);
  if (cfResult.ok) return { ...cfResult, source: "cloudflare" };

  // ── All failed — return a clear, actionable combined error ─────────────────
  const lines = [
    `❌ All 4 AI providers failed:`,
    `  • Groq: ${groqResult.error}`,
    `  • Gemini: ${geminiResult.error}`,
    `  • OpenRouter: ${orResult.error}`,
    `  • Cloudflare: ${cfResult.error}`,
    ``,
    `What to do:`,
    `  1. If Groq key is invalid → get a new key at console.groq.com/keys`,
    `  2. If Gemini quota hit → wait until midnight PST (resets daily)`,
    `  3. If all rate limited → wait 1–2 minutes and retry`,
  ];
  return { ok: false, error: lines.join("\n") };
}
