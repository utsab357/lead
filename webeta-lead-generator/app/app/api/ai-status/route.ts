import { NextResponse } from "next/server";
import { geminiConnected } from "@/lib/gemini";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const doPing = url.searchParams.get("ping") === "true";

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  const providers = [
    {
      id: "groq",
      name: "Groq (Hermes / GPT-OSS)",
      role: "Primary Engine",
      configured: !!groqKey,
      status: groqKey ? "ready" : "unconfigured",
      model: "openai/gpt-oss-120b",
      quotaInfo: "14,400 req/day (Ultra-fast)",
      rateLimited: false,
      latencyMs: null as number | null,
      error: null as string | null,
    },
    {
      id: "gemini",
      name: "Google Gemini",
      role: "Secondary Fallback",
      configured: !!geminiKey,
      status: geminiKey ? "ready" : "unconfigured",
      model: "gemini-2.0-flash",
      quotaInfo: "1,500 req/day (Google AI Studio)",
      rateLimited: false,
      latencyMs: null as number | null,
      error: null as string | null,
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      role: "Tertiary Safety Net",
      configured: !!openRouterKey,
      status: openRouterKey ? "ready" : "unconfigured",
      model: "meta-llama/llama-3.1-8b:free",
      quotaInfo: "Multi-Model Safety Fallback",
      rateLimited: false,
      latencyMs: null as number | null,
      error: null as string | null,
    },
  ];

  if (doPing) {
    // Ping Groq
    if (groqKey) {
      const start = Date.now();
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
        });
        providers[0].latencyMs = Date.now() - start;
        if (res.status === 429) {
          providers[0].status = "rate_limited";
          providers[0].rateLimited = true;
          providers[0].error = "Rate limit reached (429)";
        } else if (!res.ok) {
          providers[0].status = "error";
          providers[0].error = `HTTP ${res.status}`;
        } else {
          providers[0].status = "ready";
        }
      } catch (e) {
        providers[0].status = "error";
        providers[0].error = (e as Error).message;
      }
    }

    // Ping Gemini
    if (geminiKey) {
      const start = Date.now();
      try {
        const connected = await geminiConnected();
        providers[1].latencyMs = Date.now() - start;
        if (!connected) {
          providers[1].status = "error";
          providers[1].error = "Connection or quota limit issue";
        } else {
          providers[1].status = "ready";
        }
      } catch (e) {
        providers[1].status = "error";
        providers[1].error = (e as Error).message;
      }
    }

    // Ping OpenRouter
    if (openRouterKey) {
      const start = Date.now();
      try {
        const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${openRouterKey}` },
        });
        providers[2].latencyMs = Date.now() - start;
        if (!res.ok) {
          providers[2].status = "error";
          providers[2].error = `HTTP ${res.status}`;
        } else {
          providers[2].status = "ready";
        }
      } catch (e) {
        providers[2].status = "error";
        providers[2].error = (e as Error).message;
      }
    }
  }

  const healthyCount = providers.filter((p) => p.status === "ready").length;
  const rateLimitedCount = providers.filter((p) => p.rateLimited).length;
  const configuredCount = providers.filter((p) => p.configured).length;
  const activeProvider = providers.find((p) => p.status === "ready") ?? null;

  return NextResponse.json({
    providers,
    healthyCount,
    rateLimitedCount,
    configuredCount,
    activeProvider: activeProvider?.id ?? null,
    activeName: activeProvider?.name ?? "None",
  });
}
