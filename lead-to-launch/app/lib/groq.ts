/**
 * Groq AI client — OpenAI-compatible API.
 * Free tier: 14,400 requests/day.
 * Used as PRIMARY model (Gemini as fallback if Groq fails).
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Models available on this API key (verified via /v1/models)
const GROQ_MODELS = [
  "qwen/qwen3.6-27b",    // 27B thinking model — best quality
  "openai/gpt-oss-120b", // 120B fallback
  "openai/gpt-oss-20b",  // 20B last resort
];

export type GroqResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

/** Strip <think>...</think> blocks that thinking models prepend before JSON */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

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
 * Run a prompt through Groq and parse the result as JSON.
 * Tries each model in GROQ_MODELS order, skips 404 (not found).
 */
export async function runGroqJSON<T>(
  prompt: string,
  opts: { temperature?: number } = {},
): Promise<GroqResult<T>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, error: "GROQ_API_KEY not set in .env.local" };

  for (const model of GROQ_MODELS) {
    try {
      // Build body — qwen needs thinking disabled explicitly
      const body: Record<string, unknown> = {
        model,
        temperature: opts.temperature ?? 0.3,
        messages: [
          {
            role:    "system",
            content: "You are a precise JSON-only assistant. Always respond with valid JSON only — no markdown, no prose, no explanations. Start your response directly with [ or {.",
          },
          { role: "user", content: prompt },
        ],
      };
      if (model.includes("qwen")) {
        body.enable_thinking = false;
      }

      const res = await fetch(GROQ_API_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      // Model not found on this key — try next
      if (res.status === 404) continue;

      if (!res.ok) {
        const errBody = await res.text();
        if (res.status === 429) {
          // Rate limited — wait 65s for the per-minute window to reset, then retry same model
          await new Promise(r => setTimeout(r, 65000));
          // Retry this model after waiting (don't continue to next model)
          const res2 = await fetch(GROQ_API_URL, {
            method:  "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify(body),
          });
          if (!res2.ok) {
            const e2 = await res2.text();
            return { ok: false, error: `Groq still rate limited after wait: ${e2.slice(0, 150)}` };
          }
          const j2   = await res2.json();
          const raw2: string = j2?.choices?.[0]?.message?.content ?? "";
          if (!raw2.trim()) return { ok: false, error: "Groq returned empty response after retry." };
          const t2 = stripThinking(raw2);
          try { return { ok: true, data: JSON.parse(t2) as T }; }
          catch {
            const d2 = extractJSON<T>(t2);
            if (d2 !== null) return { ok: true, data: d2 };
          }
        }
        // For other 4xx errors on this model, try next model
        if (res.status >= 400 && res.status < 500) continue;
        return { ok: false, error: `Groq API error ${res.status}: ${errBody.slice(0, 200)}` };
      }

      const json     = await res.json();
      const rawText: string = json?.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) return { ok: false, error: "Groq returned empty response." };

      // Strip <think>...</think> blocks (qwen thinking model)
      const text = stripThinking(rawText);

      try {
        return { ok: true, data: JSON.parse(text) as T };
      } catch {
        const data = extractJSON<T>(text);
        if (data !== null) return { ok: true, data };
        // This model gave bad JSON — try next model
        continue;
      }
    } catch {
      // Network error on this model — try next
      continue;
    }
  }

  return { ok: false, error: "Groq: all models failed. Check your API key at console.groq.com." };
}
