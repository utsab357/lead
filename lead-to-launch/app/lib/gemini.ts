import { GoogleGenerativeAI, type GenerateContentResult } from "@google/generative-ai";
import { runGroqJSON } from "./groq";

/**
 * Gemini AI client.
 * Uses the FREE Gemini API from Google AI Studio (1500 req/day).
 * Tries multiple models with retry on 503 overload.
 * Auto-falls back to Groq when Gemini is rate-limited (429) or overloaded (503).
 */

export type GeminiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const GEMINI_KEY = process.env.GEMINI_API_KEY;

function getClient() {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set in .env.local");
  return new GoogleGenerativeAI(GEMINI_KEY);
}

/** Pull the first JSON object/array out of a possibly fenced/prefixed string. */
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

// Models tried in order
const GEMINI_JSON_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.0-flash-exp",
];

/**
 * Run a Gemini prompt and parse the result as JSON.
 * Tries multiple models, retries up to 5x on 503 overload with backoff.
 * Auto-falls back to Groq if Gemini is rate-limited or overloaded.
 */
export async function runGeminiJSON<T>(
  prompt: string,
  opts: { model?: string; temperature?: number } = {},
): Promise<GeminiResult<T>> {
  if (!GEMINI_KEY) {
    return { ok: false, error: "GEMINI_API_KEY not set. Add it to app/.env.local" };
  }

  const client      = getClient();
  const models      = opts.model ? [opts.model] : GEMINI_JSON_MODELS;
  const MAX_RETRIES = 5;

  // Track whether we should fall back to Groq (rate limit / overload)
  let canFallback = false;

  for (const modelName of models) {
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        responseMimeType: "application/json",
      },
    });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result: GenerateContentResult = await model.generateContent(prompt);
        const text = result.response.text();

        if (!text || text.trim().length === 0) {
          return { ok: false, error: "Gemini returned empty response." };
        }

        try {
          return { ok: true, data: JSON.parse(text) as T };
        } catch {
          const data = extractJSON<T>(text);
          if (data === null) {
            return { ok: false, error: `Gemini did not return valid JSON. Raw: ${text.slice(0, 300)}` };
          }
          return { ok: true, data };
        }
      } catch (e) {
        const msg = (e as Error).message || "Unknown Gemini error";

        if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
          // Rate limited — only retry TWICE with short waits, then fall back to Groq fast
          // (5 retries × growing waits = 40s of pointless waiting when Gemini is quota-exhausted)
          if (attempt <= 2) {
            await new Promise(r => setTimeout(r, attempt * 2000));
            continue;
          }
          canFallback = true;
          break; // go straight to Groq
        }

        // 503 overload — retry with increasing delay (3s, 6s, 9s, 12s, 15s)
        if (msg.includes("503") || msg.toLowerCase().includes("high demand")) {
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, attempt * 3000));
            continue;
          }
          canFallback = true;
          break; // all retries on this model exhausted — try next model
        }

        // 404 model not found — try next model immediately
        if (msg.includes("404")) break;

        return { ok: false, error: msg.slice(0, 400) };
      }
    }
  }

  // ── Groq fallback ───────────────────────────────────────────────────────────
  // Gemini was rate-limited or overloaded — silently switch to Groq
  if (canFallback) {
    const groqResult = await runGroqJSON<T>(prompt, { temperature: opts.temperature });
    if (groqResult.ok) return { ok: true, data: groqResult.data };
    // Groq also failed — return a clear combined error
    return { ok: false, error: `Gemini rate-limited & Groq also failed: ${groqResult.error}` };
  }

  return { ok: false, error: "Gemini unavailable after retries. All models overloaded — try again in a minute." };
}

/**
 * Run a Gemini prompt and return raw text (not JSON).
 * Auto-falls back to Groq on rate limit / overload.
 */
export async function runGeminiText(
  prompt: string,
  opts: { model?: string; temperature?: number } = {},
): Promise<GeminiResult<string>> {
  if (!GEMINI_KEY) {
    return { ok: false, error: "GEMINI_API_KEY not set. Add it to app/.env.local" };
  }

  const client = getClient();
  const model  = client.getGenerativeModel({
    model: opts.model ?? "gemini-3.6-flash",
    generationConfig: { temperature: opts.temperature ?? 0.5 },
  });

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text();
    if (!text) return { ok: false, error: "Gemini returned empty response." };
    return { ok: true, data: text };
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";

    // Rate limit or overload — fall back to Groq for text
    if (msg.includes("429") || msg.includes("503") ||
        msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("high demand")) {
      const groqResult = await runGroqJSON<{ text: string }>(
        `${prompt}\n\nReturn your response as JSON: { "text": "<your full response here>" }`,
        { temperature: opts.temperature },
      );
      if (groqResult.ok && groqResult.data?.text) {
        return { ok: true, data: groqResult.data.text };
      }
      return { ok: false, error: "Gemini rate-limited, Groq fallback also failed." };
    }

    return { ok: false, error: msg.slice(0, 400) };
  }
}

/** Quick health check — is the API key valid and reachable? */
export async function geminiConnected(): Promise<boolean> {
  if (!GEMINI_KEY) return false;
  try {
    const result = await runGeminiJSON<{ status: string }>(
      'Return this exact JSON: {"status": "ok"}',
      { temperature: 0 },
    );
    // ok = true means success
    // rate limit (429) also means key is valid — treat as connected
    if (result.ok) return true;
    if (result.error?.includes("rate limit") || result.error?.includes("429")) return true;
    return false;
  } catch {
    return false;
  }
}
