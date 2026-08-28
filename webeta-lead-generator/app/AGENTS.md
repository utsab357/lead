<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Webeta Lead Generator & Website Builder (2026)

This repository holds a Next.js application that scrapes local business leads, audits their online presence, ranks them by purchase likelihood, drafts outreach messages, and builds premium customizable prompts for landing page builders.

---

## 🛠️ Project Architecture

```
app/
├── app/
│   ├── api/
│   │   ├── scrape/          # Scrapes Google Maps/Places
│   │   ├── audit/           # Runs AI audit to identify gaps
│   │   ├── rank/            # Computes conversions & score
│   │   ├── outreach/        # Drafts email/whatsapp outreach
│   │   ├── build-prompt/    # Builds page prompt & style preset rules
│   │   └── sessions/        # Saves session data
│   └── page.tsx             # Main dashboard rendering Phases 1-6
├── components/              # React views for each Phase (e.g. Phase4Build.tsx)
├── lib/
│   ├── ai.ts                # Shared AI runner (Groq → Gemini → OpenRouter)
│   ├── gemini.ts            # Google Gemini client & internal retries
│   ├── groq.ts              # Groq client & smart status errors
│   ├── openrouter.ts        # OpenRouter fallback client (free models)
│   └── types.ts             # Shared data definitions (RankedLead, AuditResult)
└── .env.local               # Private local environment credentials
```

---

## 🤖 Shared AI Fallback Chain (`lib/ai.ts`)

All API routes (`audit`, `rank`, `outreach`, `conversion-points`) must call `runAI<T>(prompt)` rather than invoking providers directly.

1.  **Groq**: Primary provider. Fastest speed, zero usage limit. Handles large prompts up to 13k characters.
2.  **Gemini**: Secondary provider. Used when Groq rate limits or fails.
3.  **OpenRouter**: Tertiary safety fallback. Automatically tries four free models in sequence (`Llama-3.1`, `Gemma-2`, `Phi-3`, `Qwen-2`).

---

## 🖼️ Photo & Layout Rules (Phase 6 Build)

*   **Hero Backgrounds**: Always use curated professional Unsplash stock photos matching the business category. Scraped Google Maps images are customer review uploads and must never be placed in the hero to maintain visual design quality.
*   **About Section**: Places the first real scraped business image in the left panel. If zero images are available, renders a beautiful geometric CSS fallback layout.
*   **Gallery**: Displays remaining real scraped customer images.
*   **Data Integrity**: Never invent pricing values, schedule timings, employee names, or menu lists. If they are missing in the raw lead metadata, use contact CTAs instead.
