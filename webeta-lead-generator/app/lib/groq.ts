/**
 * Groq AI client — OpenAI-compatible API.
 * Free tier: 14,400 requests/day.
 * Used as PRIMARY model (Gemini as fallback if Groq fails).
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Models tried in order — verified against actual API key (2026-08-22)
// gpt-oss-120b MUST be first — only model that handles large prompts (13k+ chars)
const GROQ_MODELS = [
  "openai/gpt-oss-120b", // 120B — handles large prompts, high context window
  "openai/gpt-oss-20b",  // 20B — smaller context, fallback for lighter tasks
  "qwen/qwen3.6-27b",   // 27B thinking model — limited output, last resort
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
      // Build body — qwen needs thinking disabled and lower max_tokens
      // gpt-oss models support up to ~8k total tokens (input + output)
      // with large build prompts (~3k input tokens), 4096 output is safe; 8192 causes 413
      const modelMaxTokens = model.includes("qwen") ? 2048 : 4096;
      const body: Record<string, unknown> = {
        model,
        temperature: opts.temperature ?? 0.3,
        max_tokens: modelMaxTokens,
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
          // Rate limited — wait 15s then retry once
          await new Promise(r => setTimeout(r, 15000));
          const res2 = await fetch(GROQ_API_URL, {
            method:  "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body: JSON.stringify(body),
          });
          if (!res2.ok) {
            // Still rate-limited or error — try next model instead of giving up
            continue;
          }
          const j2   = await res2.json();
          const raw2: string = j2?.choices?.[0]?.message?.content ?? "";
          if (!raw2.trim()) continue; // empty response — try next model
          const t2 = stripThinking(raw2);
          try { return { ok: true, data: JSON.parse(t2) as T }; }
          catch {
            const d2 = extractJSON<T>(t2);
            if (d2 !== null) return { ok: true, data: d2 };
            continue; // bad JSON — try next model
          }
        }
        // For other 4xx errors on this model, try next model
        if (res.status >= 400 && res.status < 500) continue;
        return { ok: false, error: `Groq API error ${res.status}: ${errBody.slice(0, 200)}` };
      }

      const json     = await res.json();
      const rawText: string = json?.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) continue; // empty — try next model


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
