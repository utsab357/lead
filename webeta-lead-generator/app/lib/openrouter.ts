/**
 * OpenRouter AI client — OpenAI-compatible API.
 * Used as TERTIARY fallback: Gemini → Groq → OpenRouter.
 * Free tier: free models with daily limits per model.
 * Sign up at openrouter.ai and add OPENROUTER_API_KEY to .env.local
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free models tried in order (":free" suffix = no credits needed)
// Ordered by context window size — large prompts need larger context
const OPENROUTER_MODELS = [
  "meta-llama/llama-3.1-8b-instruct:free",   // 128k context, reliable
  "google/gemma-2-9b-it:free",                // 8k context, fast
  "microsoft/phi-3-mini-128k-instruct:free",  // 128k context, good JSON
  "qwen/qwen-2-7b-instruct:free",             // 32k context, last resort
];

export type OpenRouterResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

/** Pull the first JSON object/array out of a possibly fenced string. */
function extractJSON<T>(text: string): T | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  if (firstObj === -1)      start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else                      start = Math.min(firstObj, firstArr);
  if (start === -1) return null;
  const open  = s[start];
  const close = open === "{" ? "}" : "]";
  const end   = s.lastIndexOf(close);
  if (end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)) as T; } catch { return null; }
}

/**
 * Run a prompt through OpenRouter and parse the result as JSON.
 * Tries each free model in order. If a model is unavailable or returns bad JSON,
 * moves to the next one automatically.
 */
export async function runOpenRouterJSON<T>(
  prompt: string,
  opts: { temperature?: number } = {},
): Promise<OpenRouterResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, error: "OPENROUTER_API_KEY not set in .env.local" };

  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${key}`,
          "HTTP-Referer":  "https://webeta.app",   // required by OpenRouter
          "X-Title":       "Webeta Lead Generator", // shown in their dashboard
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.3,
          max_tokens:  2048,
          messages: [
            {
              role:    "system",
              content: "You are a precise JSON-only assistant. Always respond with valid JSON only — no markdown, no prose, no explanations. Start your response directly with [ or {.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      // Model not available on free tier or not found — try next
      if (res.status === 404 || res.status === 402) continue;

      if (!res.ok) {
        // Rate limited — try next model
        if (res.status === 429) { continue; }
        // Other 4xx — try next model
        if (res.status >= 400 && res.status < 500) continue;
        // 5xx — try next model
        continue;
      }

      const json    = await res.json();
      const rawText: string = json?.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) continue; // empty — try next model

      try {
        return { ok: true, data: JSON.parse(rawText) as T };
      } catch {
        const data = extractJSON<T>(rawText);
        if (data !== null) return { ok: true, data };
        continue; // bad JSON — try next model
      }
    } catch {
      // Network error — try next model
      continue;
    }
  }

  return { ok: false, error: "OpenRouter: all free models failed or unavailable." };
}
