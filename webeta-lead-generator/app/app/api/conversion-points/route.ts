import { NextResponse } from "next/server";
import { runGroqJSON } from "@/lib/groq";
import { runGeminiJSON } from "@/lib/gemini";
import type { Lead, AuditResult, ConversionPoints } from "@/lib/types";

export const maxDuration = 300;

const BATCH_SIZE     = 5;
const BATCH_DELAY_MS = 1500;

function buildPrompt(leads: Lead[], audits: Record<string, AuditResult>): string {
  const rows = leads
    .filter((l) => audits[l.id])
    .map((l) => {
      const monthlyLoss = audits[l.id].estLostRevenuePerMonth;
      const monthlyLossStr = monthlyLoss != null ? `₹${Number(monthlyLoss).toLocaleString("en-IN")}` : "";
      const numericMonthly = Number(monthlyLoss) || 0;
      const dailyLoss = numericMonthly > 0 ? `₹${Math.round(numericMonthly / 30).toLocaleString("en-IN")}` : null;

      return {
        id: l.id,
        name: l.name,
        category: l.category,
        city: l.city,
        address: l.address,
        rating: l.rating,
        reviewsCount: l.reviewsCount,
        hasWebsite: audits[l.id].hasWebsite,
        biggestGap: audits[l.id].biggestGap,
        estLostRevenuePerMonth: monthlyLossStr,
        estLostRevenuePerDay: dailyLoss,   // ← FIXED: pre-calculated so AI uses correct number
        gaps: audits[l.id].gaps,
        hours: l.hours ?? null,
        photosCount: l.photosCount ?? 0,
        services: l.services ?? [],
        priceLevel: l.priceLevel ?? null,
        socialLinks: l.socialLinks?.map(s => s.platform) ?? [],
        ownerReplies: l.ownerReplies ?? null,
        customerComplaints: l.reviews
          ?.filter(r => r.rating <= 2)
          .slice(0, 3)
          .map(r => r.text.slice(0, 150)) ?? [],
        customerPraise: l.reviews
          ?.filter(r => r.rating >= 4)
          .slice(0, 3)
          .map(r => r.text.slice(0, 150)) ?? [],
      };
    });

  return `You are a business consultant helping a FIRST-TIME CALLER who is a web developer (not a salesperson) pitch a free website demo to local Indian business owners. The developer is nervous and technical — the content must be simple, honest, and conversational.

CRITICAL RULES — read before generating:
1. NEVER invent specific competitor names (like "XYZ Clinic 2km away"). You don't know real competitors. Instead say "similar clinics nearby" or "other [category] businesses in [city]". Inventing names will embarrass the caller.
2. MATH MUST BE CONSISTENT. The field "estLostRevenuePerDay" is pre-calculated. Use THAT exact number in the objection handler — never invent a different daily figure.
3. The opener must NOT sound like a sales call. It should sound like a curious person who stumbled on their business online. Start with a genuine observation or compliment. Do NOT start with "I'm calling to sell you" or "I want to offer you".
4. Use REAL review text from customerComplaints and customerPraise to make points personal. If a customer complained about "no online booking", reference that. If customers praise the doctor, compliment the owner on it.
5. Keep language simple. The developer will read this on a phone screen while talking. Short sentences only.

For EACH business return a JSON object with these EXACT fields:

- "leadId": string (copy the id field exactly)

- "points": array of 4-5 unique selling points. Each = one sentence the developer can SAY OUT LOUD. Use the business name, city, real review data, and specific numbers. Do NOT use generic sentences.

- "competitorInsight": ONE sentence about what similar businesses in their city are doing online — use generic phrasing like "other Ayurvedic clinics in Barasat" not invented names.

- "revenueArgument": ONE sentence with specific ₹/month number from estLostRevenuePerMonth. Keep it realistic.

- "urgencyHook": ONE short punchy sentence. Must use estLostRevenuePerDay as the daily loss figure.

- "callScript": object with these fields for a cold call — keep ALL text SHORT (max 2 sentences each):
  - "opener": First sentence to say when owner picks up. Should sound like: "I was looking at [category] clinics in [city] and noticed your [specific observation]..." — NOT salesy. Mention one real fact (rating, reviews, or a specific review insight).
  - "iceBreaker": ONE question to ask AFTER the opener to get the owner talking naturally. Should NOT be about selling. Example: "Do most of your patients find you through Google or through word of mouth?" — makes them reflect on their online presence themselves.
  - "keyPoints": Array of exactly 3 short bullet sentences to mention. Each references their real data. Easy to read aloud quickly. No jargon.
  - "objectionHandler": ONE sentence for when they say "not interested" or "I'm busy". MUST use the pre-calculated estLostRevenuePerDay figure. Keep it soft and non-pushy.
  - "closer": ONE sentence to end the call. Should offer to send a free WhatsApp mock-up or demo screenshot. Never ask for money.
  - "doNotSay": ONE specific phrase or mistake a first-time caller should AVOID with this owner. Example: "Don't say 'I want to build you a website' upfront — instead say you noticed their profile and wanted to share something."

- "postCallWhatsApp": The exact WhatsApp message to send within 5 minutes after the call ends. Should be 2-3 sentences max. Warm, personal, references something from the call. Ends with a soft yes/no question. Include their name/business name naturally.

- "bestTimeToCall": ONE short sentence recommending the best day and time to call this specific type of business (based on their category and hours). Example: "For a clinic, call Tuesday or Wednesday between 2–4 PM when appointment rushes are lower."

Output ONLY a valid JSON array. No markdown. No explanation. Vary language across businesses — never repeat the same sentences.

Businesses:
${JSON.stringify(rows, null, 2)}`;
}

async function runWithFallback<T>(prompt: string): Promise<{ ok: true; data: T; source: string } | { ok: false; error: string }> {
  const groqResult = await runGroqJSON<T>(prompt);
  if (groqResult.ok) return { ...groqResult, source: "groq" };
  const geminiResult = await runGeminiJSON<T>(prompt);
  if (geminiResult.ok) return { ...geminiResult, source: "gemini" };
  return { ok: false, error: `Groq: ${groqResult.error} | Gemini: ${geminiResult.error}` };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
  return chunks;
}

export async function POST(req: Request) {
  const { leads, audits } = (await req.json()) as {
    leads: Lead[];
    audits: Record<string, AuditResult>;
  };

  const auditable = leads.filter((l) => audits?.[l.id]);
  if (auditable.length === 0) {
    return NextResponse.json({ error: "No audited leads." }, { status: 400 });
  }

  // Process in batches
  const batches = chunk(auditable, BATCH_SIZE);
  const allPoints: ConversionPoints[] = [];
  let source = "groq";

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await runWithFallback<Array<ConversionPoints>>(buildPrompt(batch, audits));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    if (result.source === "gemini") source = "gemini";
    if (Array.isArray(result.data)) allPoints.push(...result.data);
    if (i < batches.length - 1) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  const byId: Record<string, ConversionPoints> = {};
  for (const cp of allPoints) {
    if (cp && cp.leadId) {
      byId[cp.leadId] = {
        leadId:             cp.leadId,
        points:             Array.isArray(cp.points) ? cp.points : [],
        competitorInsight:  cp.competitorInsight ?? "",
        revenueArgument:    cp.revenueArgument ?? "",
        urgencyHook:        cp.urgencyHook ?? "",
        postCallWhatsApp:   (cp as any).postCallWhatsApp ?? "",
        bestTimeToCall:     (cp as any).bestTimeToCall ?? "",
        callScript:         cp.callScript ? {
          opener:           cp.callScript.opener ?? "",
          iceBreaker:       (cp.callScript as any).iceBreaker ?? "",
          keyPoints:        Array.isArray(cp.callScript.keyPoints) ? cp.callScript.keyPoints : [],
          objectionHandler: cp.callScript.objectionHandler ?? "",
          closer:           cp.callScript.closer ?? "",
          doNotSay:         (cp.callScript as any).doNotSay ?? "",
        } : undefined,
      };

    }
  }

  return NextResponse.json({ source, conversionPoints: byId });
}
