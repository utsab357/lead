/**
 * Groq AI client — OpenAI-compatible API.
 * Free tier: 14,400 requests/day.
 * Used as PRIMARY model (Gemini as fallback if Groq fails).
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Models tried in order — current active Groq model IDs (verified live Oct 2026)
const GROQ_MODELS = [
  "openai/gpt-oss-120b",      // 120B — highest quality, 131K context, supports json_mode
  "openai/gpt-oss-20b",       // 20B — ultra-fast, 131K context, supports json_mode
  "qwen/qwen3.8-27b",         // 27B — high capability, 131K context
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

/** Format a reset time from Groq response headers into a human-readable string. */
function formatGroqReset(headers: Headers): string {
  // Groq sends x-ratelimit-reset-requests as an ISO timestamp or duration like "2s", "1m30s"
  const resetHeader = headers.get("x-ratelimit-reset-requests");
  const retryAfter  = headers.get("retry-after"); // seconds

  if (retryAfter) {
    const sec = parseInt(retryAfter, 10);
    if (!isNaN(sec)) {
      if (sec < 60)  return `in ~${sec}s`;
      if (sec < 120) return `in ~1 min`;
      return `in ~${Math.ceil(sec / 60)} min`;
    }
  }

  if (resetHeader) {
    // Could be "2s", "1m30s", or an ISO date
    const secMatch = resetHeader.match(/^(\d+)s$/);
    const minMatch = resetHeader.match(/^(\d+)m(?:(\d+)s)?$/);
    if (secMatch) return `in ~${secMatch[1]}s`;
    if (minMatch) return `in ~${minMatch[1]} min`;
    // Try as ISO date
    const d = new Date(resetHeader);
    if (!isNaN(d.getTime())) {
      return `at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
  }

  return "shortly";
}

/**
 * Run a prompt through Groq and parse the result as JSON.
 * Tries each model in GROQ_MODELS order, with smart error detection.
 *
 * Error types detected:
 *  - 401 → Invalid API key (stops immediately — no point retrying)
 *  - 429 → Rate limited (reads reset time from headers)
 *  - 404 → Model not found on this key (tries next)
 *  - Other → Tries next model
 */
export async function runGroqJSON<T>(
  prompt: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<GroqResult<T>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return {
      ok: false,
      error: "❌ Groq API key missing — add GROQ_API_KEY to .env.local (get a free key at console.groq.com)",
    };
  }

  // Track the most informative error seen across all model attempts
  let lastErrorType: "auth" | "rate_limit" | "quota" | "other" = "other";
  let lastErrorDetail = "";

  for (const model of GROQ_MODELS) {
    try {
      const body: Record<string, unknown> = {
        model,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4096,
        messages: [
          {
            role:    "system",
            content: "You are a precise JSON-only assistant. Always respond with valid JSON only — no markdown, no prose, no explanations. Start your response directly with [ or {.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      };


      const res = await fetch(GROQ_API_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      // ── Auth error — stop all retries immediately ──────────────────────────
      if (res.status === 401) {
        return {
          ok: false,
          error: "❌ Groq: Invalid API key — generate a new one at console.groq.com/keys (Settings → API Keys)",
        };
      }

      // ── Model not found on this key — try next ─────────────────────────────
      if (res.status === 404) continue;

      // ── Rate limited ───────────────────────────────────────────────────────
      if (res.status === 429) {
        const resetMsg = formatGroqReset(res.headers);
        lastErrorType   = "rate_limit";
        lastErrorDetail = `Groq rate limited — resets ${resetMsg}. (This model: ${model})`;

        // Wait 15s then retry once on same model before trying next
        await new Promise(r => setTimeout(r, 15000));
        const res2 = await fetch(GROQ_API_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify(body),
        });
        if (!res2.ok) {
          // Still limited — try next model
          continue;
        }
        const j2   = await res2.json();
        const raw2: string = j2?.choices?.[0]?.message?.content ?? "";
        if (!raw2.trim()) continue;
        const t2 = stripThinking(raw2);
        try { return { ok: true, data: JSON.parse(t2) as T }; }
        catch {
          const d2 = extractJSON<T>(t2);
          if (d2 !== null) return { ok: true, data: d2 };
          continue;
        }
      }

      // ── Other 4xx — try next model ─────────────────────────────────────────
      if (res.status >= 400 && res.status < 500) {
        const errText = await res.text().catch(() => "");
        lastErrorDetail = `Groq error ${res.status} on ${model}: ${errText.slice(0, 150)}`;
        continue;
      }

      // ── 5xx server error — try next model ─────────────────────────────────
      if (!res.ok) {
        lastErrorDetail = `Groq server error ${res.status} on ${model}`;
        continue;
      }

      const json     = await res.json();
      const rawText: string = json?.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) continue;

      const text = stripThinking(rawText);

      try {
        return { ok: true, data: JSON.parse(text) as T };
      } catch {
        const data = extractJSON<T>(text);
        if (data !== null) return { ok: true, data };
        continue;
      }
    } catch {
      lastErrorDetail = `Groq network error on ${model}`;
      continue;
    }
  }

  // ── All models exhausted — return the most informative error ───────────────
  if (lastErrorType === "rate_limit") {
    return {
      ok: false,
      error: `⏳ ${lastErrorDetail} — try again in a minute, or wait for Gemini/OpenRouter fallback`,
    };
  }

  if (lastErrorDetail) {
    return { ok: false, error: `Groq: ${lastErrorDetail}` };
  }

  return {
    ok: false,
    error: "Groq: All models failed — check your API key at console.groq.com",
  };
}
