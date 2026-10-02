/**
 * Cloudflare Workers AI Image Generation Client with Multi-Account Rotation & Pollinations Fallback
 *
 * Primary Model: @cf/black-forest-labs/flux-1-schnell (FLUX.1 schnell)
 * Quota: 10,000 neurons/day per account (~100 images/day per free account)
 * No credit card or billing required.
 *
 * Supports multi-account rotation (CLOUDFLARE_ACCOUNT_ID_1, _2, _3)
 * Automatic seamless failover to Pollinations.ai (FLUX) if Cloudflare accounts are exhausted.
 */

export interface CloudflareCredential {
  accountId: string;
  apiToken: string;
  label: string;
}

export interface ImageGenerationOptions {
  aspectRatio?: "vertical" | "widescreen" | "square";
  seed?: number;
  timeoutMs?: number;
  provider?: "cloudflare" | "pollinations" | "auto";
}

export interface ImageGenerationResult {
  ok: boolean;
  imageBuffer?: Buffer;
  mimeType?: string;
  provider: "cloudflare" | "pollinations";
  accountUsed?: string;
  modelUsed: string;
  error?: string;
  isRateLimited?: boolean;
}

/**
 * Collect configured Cloudflare accounts from environment variables.
 * Checks for CLOUDFLARE_ACCOUNT_ID_1, CLOUDFLARE_ACCOUNT_ID_2, CLOUDFLARE_ACCOUNT_ID_3
 * and legacy CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN.
 */
export function getCloudflareAccounts(): CloudflareCredential[] {
  const accounts: CloudflareCredential[] = [];

  // 1. Check indexed accounts (1 to 5)
  for (let i = 1; i <= 5; i++) {
    const accountId = (process.env[`CLOUDFLARE_ACCOUNT_ID_${i}`] || "").trim();
    const apiToken = (process.env[`CLOUDFLARE_API_TOKEN_${i}`] || "").trim();
    if (accountId && apiToken) {
      accounts.push({
        accountId,
        apiToken,
        label: `Account ${i}`,
      });
    }
  }

  // 2. Check legacy / unnumbered account if no indexed accounts found or as first
  const defaultAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const defaultApiToken = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (defaultAccountId && defaultApiToken) {
    const alreadyExists = accounts.some((a) => a.accountId === defaultAccountId);
    if (!alreadyExists) {
      accounts.unshift({
        accountId: defaultAccountId,
        apiToken: defaultApiToken,
        label: "Default Account",
      });
    }
  }

  return accounts;
}

// In-memory pointer to current active Cloudflare account to balance loads across invocations
let activeAccountIndex = 0;
const exhaustedAccounts = new Set<string>();

/**
 * Generates an image using a specific Cloudflare account.
 */
async function callCloudflareWorkersAI(
  prompt: string,
  cred: CloudflareCredential,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult> {
  const timeoutMs = options.timeoutMs ?? 45000;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Cloudflare Workers AI has a strict 2048 character limit on /prompt
    const safePrompt = prompt.length > 2000 ? prompt.slice(0, 1990) + "..." : prompt;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: safePrompt,
        seed: options.seed,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    // Rate limit or quota exhausted (10,000 neurons reached)
    if (res.status === 429) {
      return {
        ok: false,
        provider: "cloudflare",
        accountUsed: cred.label,
        modelUsed: "@cf/black-forest-labs/flux-1-schnell",
        error: `Cloudflare ${cred.label} hit daily rate limit/neuron quota (HTTP 429).`,
        isRateLimited: true,
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        provider: "cloudflare",
        accountUsed: cred.label,
        modelUsed: "@cf/black-forest-labs/flux-1-schnell",
        error: `Cloudflare ${cred.label} HTTP ${res.status}: ${errText.slice(0, 200)}`,
        isRateLimited: res.status === 402 || res.status === 403,
      };
    }

    const data = await res.json();
    const base64Image = data?.result?.image;

    if (!base64Image || typeof base64Image !== "string") {
      return {
        ok: false,
        provider: "cloudflare",
        accountUsed: cred.label,
        modelUsed: "@cf/black-forest-labs/flux-1-schnell",
        error: "Cloudflare returned empty or invalid image payload.",
      };
    }

    const buffer = Buffer.from(base64Image, "base64");

    // Strict validation: must be at least 15KB to be a real rendered image
    if (buffer.length < 15000) {
      return {
        ok: false,
        provider: "cloudflare",
        accountUsed: cred.label,
        modelUsed: "@cf/black-forest-labs/flux-1-schnell",
        error: `Cloudflare returned truncated image (${buffer.length} bytes).`,
      };
    }

    return {
      ok: true,
      imageBuffer: buffer,
      mimeType: "image/png",
      provider: "cloudflare",
      accountUsed: cred.label,
      modelUsed: "@cf/black-forest-labs/flux-1-schnell",
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const error = err as Error;
    const isTimeout = error.name === "AbortError";
    return {
      ok: false,
      provider: "cloudflare",
      accountUsed: cred.label,
      modelUsed: "@cf/black-forest-labs/flux-1-schnell",
      error: isTimeout
        ? `Cloudflare ${cred.label} request timed out after ${timeoutMs / 1000}s`
        : `Cloudflare ${cred.label} connection error: ${error.message}`,
    };
  }
}

/**
 * Fallback image generator via Pollinations.ai (FLUX model).
 * 100% free, no credit card, no API key required.
 */
async function callPollinationsAI(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult> {
  const timeoutMs = options.timeoutMs ?? 55000;
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 1500));

  let width = 1024;
  let height = 1024;
  if (options.aspectRatio === "vertical") {
    width = 768;
    height = 1344;
  } else if (options.aspectRatio === "widescreen") {
    width = 1280;
    height = 720;
  }

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&nologo=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        provider: "pollinations",
        modelUsed: "pollinations-flux",
        error: `Pollinations.ai HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length < 15000) {
      return {
        ok: false,
        provider: "pollinations",
        modelUsed: "pollinations-flux",
        error: `Pollinations.ai returned invalid image (${buffer.length} bytes).`,
      };
    }

    return {
      ok: true,
      imageBuffer: buffer,
      mimeType: res.headers.get("content-type") || "image/jpeg",
      provider: "pollinations",
      modelUsed: "pollinations-flux",
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const error = err as Error;
    return {
      ok: false,
      provider: "pollinations",
      modelUsed: "pollinations-flux",
      error: `Pollinations.ai connection error: ${error.message}`,
    };
  }
}

/**
 * Master Image Generation Dispatcher
 *
 * 1. Checks configured Cloudflare accounts.
 * 2. Attempts generation on active Cloudflare account.
 * 3. On 429 / quota limit, rotates to next Cloudflare account and retries.
 * 4. If all Cloudflare accounts fail or none are configured, seamlessly falls back to Pollinations.ai (FLUX).
 */
export async function generateWebsitePreviewImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageGenerationResult> {
  const accounts = getCloudflareAccounts();
  const errors: string[] = [];

  // If user explicitly chose pollinations, invoke pollinations directly
  if (options.provider === "pollinations") {
    const pollinationsRes = await callPollinationsAI(prompt, options);
    if (pollinationsRes.ok) return pollinationsRes;
    errors.push(`Pollinations.ai failed: ${pollinationsRes.error}`);
    // If pollinations failed but Cloudflare is available, fallback to Cloudflare
    if (accounts.length > 0) {
      console.warn(`[CloudflareAI] Pollinations failed. Falling back to Cloudflare Workers AI.`);
    }
  }

  // Attempt Cloudflare multi-account rotation
  if (accounts.length > 0 && (options.provider !== "pollinations" || errors.length > 0)) {
    const initialIndex = activeAccountIndex % accounts.length;

    for (let attempt = 0; attempt < accounts.length; attempt++) {
      const credIndex = (initialIndex + attempt) % accounts.length;
      const cred = accounts[credIndex];

      // If already known to be exhausted today, skip to next unless all exhausted
      if (exhaustedAccounts.has(cred.accountId) && exhaustedAccounts.size < accounts.length) {
        continue;
      }

      const result = await callCloudflareWorkersAI(prompt, cred, options);

      if (result.ok) {
        // Success: update active pointer for round-robin balancing
        activeAccountIndex = (credIndex + 1) % accounts.length;
        return result;
      }

      errors.push(result.error || `${cred.label} failed`);

      if (result.isRateLimited) {
        exhaustedAccounts.add(cred.accountId);
        console.warn(`[CloudflareAI] ${cred.label} exhausted daily quota. Rotating to next account...`);
      }
    }
  } else if (options.provider !== "pollinations") {
    errors.push("No Cloudflare credentials configured in environment variables.");
  }

  // Fallback to Pollinations.ai FLUX (100% free, zero keys required)
  console.warn(
    `[CloudflareAI] Cloudflare accounts unavailable or exhausted (${errors.join("; ")}). Falling back to Pollinations.ai FLUX.`
  );

  const pollinationsRes = await callPollinationsAI(prompt, options);
  if (pollinationsRes.ok) {
    return pollinationsRes;
  }

  return {
    ok: false,
    provider: "pollinations",
    modelUsed: "none",
    error: `All providers failed: Cloudflare (${errors.join("; ")}) | Pollinations (${pollinationsRes.error})`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Cloudflare Workers AI — TEXT / JSON Generation (uses same 5 accounts)
// ══════════════════════════════════════════════════════════════════════════════

export type CloudflareTextResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

/** Pull the first JSON object/array out of a possibly fenced string. */
function extractJSONFromText<T>(text: string): T | null {
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
 * Run a JSON prompt through Cloudflare Workers AI text models.
 * Rotates through all 5 accounts and multiple models.
 * Used as the 4th fallback in the AI chain: Groq → Gemini → OpenRouter → Cloudflare.
 */
export async function runCloudflareJSON<T>(
  prompt: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<CloudflareTextResult<T>> {
  const accounts = getCloudflareAccounts();

  if (accounts.length === 0) {
    return { ok: false, error: "No Cloudflare accounts configured" };
  }

  // Text models available on Cloudflare Workers AI (free tier)
  const textModels = [
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/meta/llama-3-8b-instruct",
    "@cf/mistral/mistral-7b-instruct-v0.2",
  ];

  // Truncate prompt for Cloudflare's context limits
  const safePrompt = prompt.length > 6000 ? prompt.slice(0, 5900) + "\n..." : prompt;
  const errors: string[] = [];

  for (const account of accounts) {
    for (const model of textModels) {
      try {
        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${model}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${account.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "You are a precise JSON-only assistant. Always respond with valid JSON only — no markdown fences, no prose, no explanations. Start your response directly with [ or {.",
              },
              { role: "user", content: safePrompt },
            ],
            max_tokens: opts.maxTokens ?? 4096,
            temperature: opts.temperature ?? 0.3,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        // Rate limited or quota exhausted — try next account
        if (res.status === 429 || res.status === 402 || res.status === 403) {
          errors.push(`${account.label} rate limited`);
          break; // skip remaining models on this account, try next account
        }

        if (res.status === 404) continue; // model not found, try next model

        if (!res.ok) {
          errors.push(`${account.label} HTTP ${res.status}`);
          continue;
        }

        const json = await res.json();
        const rawText: string = json?.result?.response ?? "";

        if (!rawText.trim()) {
          errors.push(`${account.label} ${model}: empty response`);
          continue;
        }

        // Try parsing as JSON
        try {
          return { ok: true, data: JSON.parse(rawText.trim()) as T };
        } catch {
          const data = extractJSONFromText<T>(rawText);
          if (data !== null) return { ok: true, data };
          errors.push(`${account.label} ${model}: invalid JSON`);
          continue;
        }
      } catch (err) {
        const msg = (err as Error).message || "unknown";
        errors.push(`${account.label}: ${msg.slice(0, 80)}`);
        continue;
      }
    }
  }

  return {
    ok: false,
    error: `Cloudflare Workers AI: all 5 accounts failed — ${errors.slice(0, 4).join("; ")}`,
  };
}
