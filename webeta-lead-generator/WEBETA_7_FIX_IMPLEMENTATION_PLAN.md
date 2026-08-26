Make ONE final small patch to the existing Webeta Phase 6 / BUILD prompt generator.

Do NOT redesign anything.
Do NOT touch the other phases.
Do NOT undo the previous fixes.
Do NOT add new features.

Only fix these three remaining factual-data issues in the generated AI-DECIDES website prompt:

## 1. Social links — exact business only

Current problem:
The generated prompt can contain a social URL that may not belong to the exact business.

Required behavior:

* Only include a social link when the source data explicitly identifies that profile as belonging to the exact business.
* If the social account is missing or identity is uncertain, OMIT it completely.
* Never infer ownership from a similar business name.
* Never output `#` as a fake placeholder.
* Never invent or guess Instagram, Facebook, YouTube, or other social URLs.
* Apply this rule consistently to:

  * footer
  * header
  * social icons
  * BUSINESS DATA
  * any other generated section

IMPORTANT:
Do not preserve a suspicious social URL merely because it exists in the scraped data unless the current data model/source explicitly marks it as belonging to the exact business.

## 2. About / Our Story — no invented business history

Current problem:
The generated prompt says to use an "about text" even when verified about/business-history data may not exist.

Required behavior:

* Use only verified about/business description text supplied in BUSINESS DATA.
* If verified about text exists, use it.
* If it does not exist, do NOT invent:

  * business history
  * founder story
  * years in business
  * mission
  * achievements
  * staff claims
  * background story
* If there is no verified about text, either:

  * omit the About/Story section, or
  * create a visually strong neutral section based only on verified facts without making unsupported claims.

Do not let the website generator fill the missing information itself.

## 3. FAQ — questions may be generated, facts may not

Current problem:
The prompt currently asks for FAQ answers involving things such as:

* booking process
* pricing
* first visit
* parking
* online consultation

Some of these may not exist in BUSINESS DATA.

Required behavior:

* Questions can be relevant to the business category.
* Answers must use ONLY verified information in BUSINESS DATA.
* If the answer is unknown, do not invent an answer.
* Do not assume:

  * parking is available
  * online consultation exists
  * booking is required
  * specific pricing
  * payment methods
  * emergency services
  * opening hours
  * specific procedures
* When information is unavailable, use a safe answer such as:
  "Please contact the business directly for the latest information."
  or omit that FAQ item entirely.

## Add this rule to the generated prompt

Add this under the existing VERIFIED DATA RULE:

### MISSING DATA HANDLING

When a requested website section depends on information that is not present in BUSINESS DATA:

1. Prefer omitting the unsupported fact.
2. Never invent an answer merely to fill visual space.
3. Neutral design is always preferable to fabricated business information.
4. Contact/WhatsApp/call CTAs may be used when those contact details are verified.
5. The website must never imply that an unavailable fact is confirmed.

## Specific validation test

After making the change, generate a prompt for a business where:

* social links are missing or uncertain
* about text is missing
* hours are missing
* services are missing
* pricing is missing
* parking information is missing
* online consultation information is missing

Confirm that the generated prompt does NOT contain:

* guessed Instagram/Facebook URLs
* invented business history
* invented years in business
* invented prices
* invented parking availability
* invented online consultation
* invented opening hours
* invented services
* invented booking rules

## Do not change

Keep all existing behavior intact:

* AI-selected design system
* all six visual styles
* premium 2026 design requirements
* real business photos and w800-h600 normalization
* real customer reviews
* verified rating/review count handling
* phone/WhatsApp handling
* Google Maps
* SEO requirements
* responsive/mobile requirements
* animations
* Stitch output format
* previous 7 fixes
* existing Groq → Gemini fallback
* all other pipeline phases

## Validation

After editing:

1. Run `tsc --noEmit`.
2. Search the generated prompt source for any remaining social fallbacks such as `"#"`.
3. Search for language that tells the generator to invent or assume business facts.
4. Generate one test prompt with missing data and inspect it.
5. Confirm AI Decides still works.
6. Confirm no unrelated files are changed.

Only modify the minimum required code.

At the end, report:

* exact file changed
* exact changes made
* validation performed
* confirmation that the previous fixes remain intact
* confirmation that no unrelated functionality changed
# Webeta — 7 Fix Implementation Plan

## Goal

This plan covers ONLY the seven approved fixes to the Webeta Lead Generator codebase.
No architectural redesign. No new features. No pipeline restructuring.

---

## Scope

### IN SCOPE
1. Remove fabricated fallback data from Phase 6 / BUILD prompt
2. Fix revenue estimation to be clearly labelled as estimated
3. Label audit performance metrics (PageSpeed, load time) as estimated in the UI
4. Resolve the self-contained HTML vs CDN contradiction in Phase 6 prompt wording
5. Normalize/upgrade scraped Google photo URLs to prefer usable higher-resolution variants
6. Make "AI Decides" the default Phase 6 style in both frontend and backend
7. Rename Phase 6 label from "Demo" to "Build" in the Stepper

### OUT OF SCOPE
- Real PageSpeed API / Lighthouse integration
- Review theme clustering
- Advanced CRM features (follow-up dates, payment status, domain tracking)
- Multi-step outreach sequence expansion
- Architectural redesign of any pipeline phase
- Changes to Groq/Gemini fallback chain
- Changes to duplicate detection (useDuplicateIndex)
- Changes to multi-source scraping (Maps + JustDial + Zomato)
- Changes to session persistence

---

## Task Status

| Part | Task | Status | Validation |
|------|------|--------|------------|
| 7 | Rename Phase 6 Demo -> Build | COMPLETED | tsc --noEmit: 0 errors. Stepper.tsx line 13 confirmed "Build". |
| 6 | Default style ai-decides | COMPLETED | tsc --noEmit: 0 errors. Phase4Build.tsx useState default and fallback updated. build-prompt/route.ts backend fallback updated. |
| 4 | Fix HTML/CDN contradiction | COMPLETED | tsc --noEmit: 0 errors. Stitch platform note now says CDN/image/maps allowed explicitly. |
| 3 | Label audit metrics estimated | COMPLETED | tsc --noEmit: 0 errors. "Avg PageSpeed (est.)" in stat card. "PageSpeed (estimated)" label added in audit card. |
| 5 | Normalize photo URLs | COMPLETED | tsc --noEmit: 0 errors. normalizeGooglePhotoUrl() helper added. Applied to both main prompt and extra-page prompts. |
| 2 | Fix revenue estimation | COMPLETED | tsc --noEmit: 0 errors. Rigid formula and Never below 20000 removed from prompt. Hard Math.max(20000,...) floor removed from normalization. |
| 1 | Remove fabricated fallbacks | COMPLETED | tsc --noEmit: 0 errors. Scan confirms zero remaining ?? "5.0", ?? "100+", or ?? "5" in factual positions. All 4 locations fixed. |

---

# Final Verification

## Task 1 — Remove fabricated fallback data

**What changed:**
- Hero trust badge: now conditionally shows real rating/reviewsCount only if available; otherwise shows "Google Maps Listed" or "Now Open" badge — no invented numbers.
- Trust stats strip: completely rewritten to include ONLY stats for which real data exists. If rating is null, omit it. If reviewsCount = 0, omit it. If yearsInBusiness is null, omit it. One generic non-factual quality statement allowed to fill the strip.
- Testimonials section: if no real reviews exist, instructs AI to build a "Leave Us a Review" invite section with empty placeholders and a link to Google Maps — NOT fabricated testimonials.
- Booking page trust signals: conditionally uses real rating/reviews or shows a welcome message; never invents numbers.

**Files changed:** `app/app/api/build-prompt/route.ts`

**Validation performed:**
- TypeScript: 0 errors
- Select-String scan for "5.0", "100+" near review/rating, "Write.*believable" → 0 results
- Logic trace: lead with rating=null → hero badge shows "Google Maps Listed"
- Logic trace: lead with reviewsCount=0 → review count omitted from stats strip
- Logic trace: lead with yearsInBusiness=null → years stat omitted
- Logic trace: lead with no reviews → testimonials section instructs review invite, not fabrication

**Result: PASS**

---

## Task 2 — Fix revenue estimation

**What changed:**
- Audit prompt: removed rigid `reviewsCount*400` formula and `Never below 20000` rule. Replaced with category-aware estimation guidance that explicitly allows 0 for businesses with thin evidence.
- Route normalization: changed `Math.max(20000, ...)` to `Math.max(0, ...)`. Revenue of 0 is now valid for empty leads.
- Field name `estLostRevenuePerMonth` unchanged — Phase 3 and Phase 4 still receive it as a number.

**Files changed:** `app/app/api/audit/route.ts`

**Validation performed:**
- TypeScript: 0 errors
- Confirmed downstream: Phase 3 rank prompt uses `estLostRevenuePerMonth` as-is — no breakage
- Confirmed downstream: Phase 4 conversion prompt uses pre-formatted `monthlyLossStr` — no breakage

**Result: PASS**

---

## Task 3 — Label estimated audit metrics

**What changed:**
- Stats card header: "Avg PageSpeed" → "Avg PageSpeed (est.)"
- Audit card inside per-lead card: added "PageSpeed (estimated)" label above the gauge value

**Files changed:** `app/components/Phase2Audit.tsx`

**Validation performed:**
- TypeScript: 0 errors
- Visual diff confirms both labels updated
- PageSpeedGauge component itself unchanged

**Result: PASS**

---

## Task 4 — Resolve HTML/CDN contradiction

**What changed:**
- Stitch platform note: removed "No external files." — replaced with explicit statement that CDN libraries, external image URLs, and Google Maps iframes/links are all allowed. One HTML file with inline CSS/JS required. No React, no build step, no separate files.

**Files changed:** `app/app/api/build-prompt/route.ts`

**Validation performed:**
- TypeScript: 0 errors
- Confirmed the AOS CDN instruction in TECHNICAL REQUIREMENTS now agrees with the platform note

**Result: PASS**

---

## Task 5 — Normalize photo URLs

**What changed:**
- Added `normalizeGooglePhotoUrl(url: string): string` helper function. Upgrades small Google CDN variants (w < 400 or h < 400) to `=w800-h600-k-no`. Leaves non-Google URLs and already-large URLs unchanged.
- Applied to `realPhotos` in both the main landing page prompt and extra-page prompts.

**Files changed:** `app/app/api/build-prompt/route.ts`

**Validation performed:**
- TypeScript: 0 errors
- Logic trace: `url=...=w32-h32` → matches suffix pattern, w=32 < 400 → replaced with `=w800-h600-k-no` ✅
- Logic trace: `url=...=w408-h306` → w=408 ≥ 400 → returned unchanged ✅
- Logic trace: `https://example.com/img.jpg` → no googleusercontent.com → returned unchanged ✅

**Result: PASS**

---

## Task 6 — Make AI Decides the default style

**What changed:**
- `Phase4Build.tsx` useState initial value: `["professional"]` → `["ai-decides"]`
- `Phase4Build.tsx` generate() fallback: `"professional"` → `"ai-decides"`
- `build-prompt/route.ts` POST handler fallback: `style || "professional"` → `style || "ai-decides"`

**Files changed:** `app/components/Phase4Build.tsx`, `app/app/api/build-prompt/route.ts`

**Validation performed:**
- TypeScript: 0 errors
- All 6 manual styles remain available in STYLE_PRESETS
- ai-decides logic in STYLE_SYSTEM unchanged

**Result: PASS**

---

## Task 7 — Rename Phase 6 Demo → Build

**What changed:**
- `Stepper.tsx` line 13: `label: "Demo"` → `label: "Build"`

**Files changed:** `app/components/Stepper.tsx`

**Validation performed:**
- TypeScript: 0 errors
- Stepper now reads: Scrape · Audit · Rank · Convert · Outreach · Build · Export

**Result: PASS**

---

## Pre-existing Build Error (Not Introduced by These Changes)

The `npx next build` command exits with code 1 due to `scrape-single/route.ts` using Node.js `child_process.spawn` which Next.js cannot bundle. This error exists on the original code before any of these changes (confirmed by `git stash` + build + `git stash pop` test). All 5 modified files compile clean with `tsc --noEmit`.

---

## Out of Scope (Intentionally Not Implemented)

- Real Lighthouse / PageSpeed API integration
- Review theme clustering (group reviews by topic)
- Advanced CRM (follow-up dates, payment status, domain tracking)
- Multi-step outreach sequence (beyond existing 2-step)
- WhatsApp source confidence field
- Client-side re-filter for loaded sessions

---

## Final Safety Check

- [x] No unrelated feature was changed
- [x] Groq -> Gemini fallback chain remains intact (runWithFallback untouched in all API routes)
- [x] Duplicate detection (useDuplicateIndex) remains intact (not touched)
- [x] Multi-source scraping (Maps + JustDial + Zomato) remains intact (scrape/route.ts not touched)
- [x] Session persistence remains intact (sessions API not touched)
- [x] Manual outreach sending remains manual (no auto-send added)
- [x] Export still works (Phase7Export.tsx not touched)
- [x] All existing pipeline phases still reachable via Stepper

*Plan completed: 2026-08-26*
