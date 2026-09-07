import { NextResponse } from "next/server";
import { runAI } from "@/lib/ai";
import type { Lead, AuditResult, RankedLead } from "@/lib/types";
import { estimateBusinessAgeMonths } from "@/lib/businessAge";

export const maxDuration = 300;

const BATCH_SIZE     = 5;
const BATCH_DELAY_MS = 1500;

function buildPrompt(leads: Lead[], audits: Record<string, AuditResult>): string {
  const rows = leads
    .filter((l) => audits[l.id])
    .map((l) => {
      const a = audits[l.id];
      const contactChannels = [
        l.phone    && "phone",
        l.whatsapp && "whatsapp",
        l.email    && "email",
      ].filter(Boolean);

      // Website quality: 0=none, 1=poor, 2=mediocre, 3=decent, 4=good
      let websiteQuality = 0;
      if (a.hasWebsite) {
        if      (a.pageSpeedScore >= 70 && a.mobileFriendly && a.https) websiteQuality = 4;
        else if (a.pageSpeedScore >= 50 && a.mobileFriendly)            websiteQuality = 3;
        else if (a.pageSpeedScore >= 30)                                 websiteQuality = 2;
        else                                                             websiteQuality = 1;
      }

      return {
        id:                     l.id,
        name:                   l.name,
        category:               l.category,
        rating:                 l.rating   ?? null,
        reviewsCount:           l.reviewsCount ?? 0,
        photosCount:            l.photosCount  ?? 0,
        hasPhone:               !!(l.phone ?? l.whatsapp),
        contactChannels,
        websiteQuality,          // 0=none 1=poor 2=mediocre 3=decent 4=good
        mobileFriendly:         a.mobileFriendly,
        https:                  a.https,
        hasSchema:              a.hasSchema,
        biggestGap:             a.biggestGap,
        estLostRevenuePerMonth: a.estLostRevenuePerMonth,
        estimatedAgeMonths:     estimateBusinessAgeMonths(l.reviews), // null = unknown
      };
    });

  return `You are an expert B2B sales strategist scoring local-business leads for a freelance web-development agency in India. Score each lead 0–100 based on how likely they are to BUY a website and how much value a site would create for them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — LEGITIMACY CHECK (do this first)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before scoring opportunity, determine if the business is real and operating.

GHOST / DEAD listing (cap score at 10):
  • reviewsCount = 0 AND photosCount = 0 AND no phone → clear ghost, score 0–5
  • reviewsCount < 3 AND photosCount = 0 AND no phone → likely dead, score 5–10

NEWLY OPENED (do NOT penalise — treat as opportunity):
  • reviewsCount < 10 BUT has phone AND photosCount > 0 → new business, needs site now
  • rating 4.5–5.0 with few reviews = loyal early customers, very open to investment

NEGLECTED OWNER (medium risk):
  • Has phone, maybe photos, low reviews, older listing → real but not digitally active
  • Score on other factors but apply a small uncertainty discount (−5 to −10)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — SCORE USING THIS FIXED RUBRIC (scores are ABSOLUTE, not relative to batch)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A) DIGITAL GAP — up to 40 points
  websiteQuality = 0 (no site)   → 40 pts
  websiteQuality = 1 (poor site) → 30 pts  ← nearly as good as no site
  websiteQuality = 2 (mediocre)  → 18 pts
  websiteQuality = 3 (decent)    → 6 pts
  websiteQuality = 4 (good site) → 0 pts   ← already sorted, low opportunity

B) DEMAND PROOF via reviews — up to 20 points
  IMPORTANT: more reviews = more real customers = business has money = better lead.
  Do NOT penalise high review counts. Penalise very low counts (ghost risk).
  reviewsCount 100–500  → 20 pts  (thriving, can afford site)
  reviewsCount 30–99    → 16 pts  (established)
  reviewsCount 10–29    → 12 pts  (growing)
  reviewsCount 3–9      → 7 pts   (new or small, uncertain)
  reviewsCount 1–2      → 3 pts   (very risky)
  reviewsCount 0        → 0 pts
  EXCEPTION: reviewsCount > 800 with no website → likely franchise/chain, deduct 5 pts (won't buy from freelancer)

C) RATING QUALITY — up to 8 points
  rating 4.2–4.8  → 8 pts  (sweet spot: good rep, real customers)
  rating 4.8–5.0  with reviewsCount < 10 → 4 pts (suspicious — friends/family reviews)
  rating 4.8–5.0  with reviewsCount ≥ 10 → 7 pts
  rating 3.8–4.1  → 5 pts
  rating < 3.8    → 1 pt   (bad reputation = owner likely defensive, hard to sell)
  rating = null   → 3 pts  (unknown)

D) CATEGORY TIER — up to 20 points
  Tier 1 (20 pts): dentist, doctor, clinic, hospital, diagnostic, lawyer, CA, accountant, hotel, resort
  Tier 2 (15 pts): salon, spa, beauty parlour, gym, fitness, boutique, fashion, jewellery, restaurant, cafe, photographer, videographer, event planner, architect, interior designer, real estate agent
  Tier 3 (8 pts):  coaching institute, tuition, school, pharmacy, chemist, auto repair, mechanic, travel agent, courier
  Tier 4 (2 pts):  grocery, kirana, general store, street food, petrol pump, vegetable shop, pan shop

E) REACHABILITY — up to 12 points
  3 channels (phone + whatsapp + email) → 12 pts
  2 channels                            → 9 pts
  phone or whatsapp only                → 6 pts
  no contact at all                     → 0 pts AND deduct 15 from total score (cannot close a lead you cannot reach)

F) BUSINESS MATURITY via estimatedAgeMonths — up to 8 points
  This is derived from the oldest customer review. Use it to gauge buy-readiness:
  estimatedAgeMonths = null (no data)        → 4 pts (neutral)
  estimatedAgeMonths < 3  (just opened)      → 3 pts (too early, likely no budget)
  estimatedAgeMonths 3–12 (new & growing)    → 7 pts (actively building presence, open to pitch)
  estimatedAgeMonths 13–48 (sweet spot)      → 8 pts (proven revenue, wants to grow)
  estimatedAgeMonths 49–84 (established)     → 5 pts (set in ways, needs strong pitch)
  estimatedAgeMonths > 84 (old-school 7yr+)  → 2 pts (very resistant to change)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — FINAL ADJUSTMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Add up to 5 bonus points if estLostRevenuePerMonth > 30000
• Deduct 10 points if legitimacy check found this is suspicious (neglected owner with very few signals)
• Clamp final score: 0–100

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY a JSON array. No prose, no markdown, no explanation outside JSON.
Each object must have exactly:
  "leadId": string
  "score": integer 0-100
  "scoreReasoning": ONE sentence max 20 words referencing actual data (reviews, category, contact, website quality)

Leads to score:
${JSON.stringify(rows, null, 2)}`;
}


export async function POST(req: Request) {
  // Accepts a SINGLE batch of leads — the frontend loops through batches
  // so it can show live progress ("X / Y leads ranked").
  const { leads, audits } = (await req.json()) as {
    leads: Lead[];
    audits: Record<string, AuditResult>;
  };
  const auditable = leads.filter((l) => audits?.[l.id]);
  if (auditable.length === 0) {
    return NextResponse.json({ scores: [] });
  }

  const result = await runAI<Array<{ leadId: string; score: number; scoreReasoning: string }>>(
    buildPrompt(auditable, audits),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const scores = Array.isArray(result.data) ? result.data : [];
  return NextResponse.json({ source: result.source ?? "groq", scores });
}
