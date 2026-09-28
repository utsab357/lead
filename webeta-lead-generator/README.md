# Webeta Lead Generator (Pro)

An autonomous local-first intelligence platform and sales pipeline built for agencies, web developers, and freelancers to discover local businesses, perform automated technical audits, generate high-converting sales scripts, compose multi-channel outreach, and close website deals.

---

## ⚡ The 7-Phase Intelligence Pipeline

1. **Phase 1 — Lead Discovery**
   Direct Google Maps extraction with real-time phone verification, review metrics, and website detection. Includes 1-click popular niche & location presets.

2. **Phase 2 — Digital Audit**
   Evaluates page performance, mobile-readiness, schema gaps, and calculates estimated monthly revenue lost without a modern web presence.

3. **Phase 3 — Opportunity Matrix**
   Multi-factor AI scoring algorithm prioritizing leads with the highest buying probability and immediate need for a website.

4. **Phase 4 — Conversion Intelligence**
   Generates personalized sales hooks, competitor insights, urgency triggers, step-by-step cold call scripts, and an after-call CRM tracker.

5. **Phase 5 — Outreach Studio**
   Drafts personalized first-touch and day-3 follow-up messages for WhatsApp, Email, and Instagram in English or Hinglish with 1-click send integration.

6. **Phase 6 — Website Architect**
   Constructs production-ready builder prompts tailored for Google Stitch, Lovable, Bolt.new, and Codex, with extra upsell page generators (Services, Pricing, About).

7. **Phase 7 — Deal Pipeline & CRM**
   Full client deal tracking (agreed price, advance received, balance due, domain & hosting timelines), Kanban/table pipeline management, and instant exports to Google Sheets, CSV, and standalone HTML client dossiers.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd app
npm install
```

### 2. Configure Environment (Optional / AI Engine)
Add your AI key in `app/.env.local`:
```bash
# Supports Hermes / Groq (Recommended for ultra-fast inference)
GROQ_API_KEY=your_groq_key_here

# Or Gemini / OpenRouter fallbacks
GEMINI_API_KEY=your_gemini_key_here
```

### 3. Run Locally
```bash
npm run dev
# Open http://localhost:3000 in your browser
```

---

## 🛡️ Architecture & Privacy
- **Local-First**: All session data, notes, and client deals are saved locally in `data/sessions/` on your machine.
- **No Third-Party Scraping Subscriptions Required**: Direct scraping engine with full browser automation.
- **Multi-Model Inference**: Optimized to run with high-efficiency open models (Hermes / Groq) with zero cloud vendor lock-in.

---
© Webeta Lead Generator. Built for modern digital agencies.
