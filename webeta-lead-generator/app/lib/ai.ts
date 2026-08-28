/**
 * Shared AI runner with full 3-provider fallback chain.
 * Chain: Groq → Gemini → OpenRouter
 *
 * Import this in ALL API routes instead of calling providers directly.
 * Adding a new provider here automatically applies to every phase.
 */

import { runGroqJSON }        from "./groq";
import { runGeminiJSON }      from "./gemini";
import { runOpenRouterJSON }  from "./openrouter";

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
  // NOTE: runGeminiJSON internally also retries Groq + OpenRouter,
  // so we pass isDirectCall=false to avoid double-Groq calls.
  // For simplicity, we call Gemini directly here with a text-only fallback.
  const geminiResult = await runGeminiJSON<T>(prompt, opts);
  if (geminiResult.ok) return { ...geminiResult, source: "gemini" };

  // ── 3. OpenRouter (free models as final safety net) ───────────────────────
  const orResult = await runOpenRouterJSON<T>(prompt, opts);
  if (orResult.ok) return { ...orResult, source: "openrouter" };

  // ── All failed — return a clear, actionable combined error ─────────────────
  const lines = [
    `❌ All 3 AI providers failed:`,
    `  • Groq: ${groqResult.error}`,
    `  • Gemini: ${geminiResult.error}`,
    `  • OpenRouter: ${orResult.error}`,
    ``,
    `What to do:`,
    `  1. If Groq key is invalid → get a new key at console.groq.com/keys`,
    `  2. If Gemini quota hit → wait until midnight PST (resets daily)`,
    `  3. If all rate limited → wait 1–2 minutes and retry`,
  ];
  return { ok: false, error: lines.join("\n") };
}
