import { NextResponse } from "next/server";
import { runAI, normalizeAIArray } from "@/lib/ai";
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
1. NEVER invent specific competitor names (like "XYZ Business 2km away"). You don't know real competitor names. Instead say "similar businesses nearby" or "other [category] providers in [city]". Inventing names will embarrass the caller.
2. MATH MUST BE CONSISTENT. The field "estLostRevenuePerDay" is pre-calculated. Use THAT exact number in the objection handler — never invent a different daily figure.
3. The opener must NOT sound like a sales call. It should sound like a curious person who stumbled on their business online. Start with a genuine observation or compliment about their real rating or reviews. Do NOT start with "I'm calling to sell you" or "I want to offer you".
4. Use REAL review text from customerComplaints and customerPraise to make points deeply personal. If a customer complained about "no online booking" or "hard to find prices", reference that. If customers praise their food, service, craftsmanship, or staff, compliment the owner on it.
5. Keep language simple, punchy, and conversational. The developer will read this on a phone screen while talking. Short sentences only.

For EACH business return a JSON object with these EXACT fields:

- "leadId": string (copy the id field exactly)

- "points": array of 4-5 unique selling points. Each = one sentence the developer can SAY OUT LOUD. Deeply tailored to the specific business category, city, real review feedback, and lost revenue. Do NOT use generic buzzwords.

- "competitorInsight": ONE sentence about what similar businesses in their niche and city are doing online — use generic phrasing like "other top-rated [category] businesses in [city]" not invented names.

- "revenueArgument": ONE sentence with specific ₹/month number from estLostRevenuePerMonth. Keep it realistic and tied to their actual business model.

- "urgencyHook": ONE short punchy sentence. Must use estLostRevenuePerDay as the daily loss figure.

- "callScript": object with these fields for a cold call — keep ALL text SHORT (max 2 sentences each):
  - "opener": First sentence to say when owner picks up. Should sound like: "I was looking at [category] in [city] and noticed your [specific observation from their rating or reviews]..." — NOT salesy. Mention one real fact (rating, reviews, or a specific review insight).
  - "iceBreaker": ONE question to ask AFTER the opener to get the owner talking naturally. Should NOT be about selling. Example: "Do most of your new customers find you through word of mouth, or are they finding you directly on Google search?" — makes them reflect on their online presence themselves.
  - "keyPoints": Array of exactly 3 short bullet sentences to mention. Each references their real data, services, or gaps. Easy to read aloud quickly. No jargon.
  - "objectionHandler": ONE sentence for when they say "not interested" or "I'm busy". MUST use the pre-calculated estLostRevenuePerDay figure. Keep it soft and non-pushy.
  - "closer": ONE sentence to end the call. Should offer to send a free WhatsApp mock-up or demo screenshot. Never ask for money.
  - "doNotSay": ONE specific phrase or mistake a first-time caller should AVOID with this owner. Example: "Don't say 'I want to build you a website' upfront — instead say you noticed their profile and wanted to share a free preview."

- "postCallWhatsApp": The exact WhatsApp message to send within 5 minutes after the call ends. Should be 2-3 sentences max. Warm, personal, references something specific from their niche. Ends with a soft yes/no question. Include their business name naturally.

- "bestTimeToCall": ONE short sentence recommending the best day and time to call this specific category based on their operational hours and peak rush times (e.g. mid-afternoon for food/hospitality, morning for professional services, weekday mornings for retail/salons).

Output ONLY a valid JSON array. No markdown. No explanation. Vary language across businesses — never repeat the same sentences.

Businesses:
${JSON.stringify(rows, null, 2)}`;
}

async function _unused() { return null; } // removed: runWithFallback replaced by runAI

function chunk<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
  return chunks;
}


function buildFallbackPoints(lead: Lead, audit?: AuditResult): ConversionPoints {
  const category = lead.category || "business";
  const city = lead.city || "your area";
  const name = lead.name || "your business";
  const rating = lead.rating ? `${lead.rating}★` : "strong";
  const reviews = lead.reviewsCount ? `${lead.reviewsCount}+` : "local";
  const gap = audit?.biggestGap || "no mobile-ready website";
  const numericMonthly = Number(audit?.estLostRevenuePerMonth) || 28000;
  const monthlyStr = `₹${numericMonthly.toLocaleString("en-IN")}`;
  const dailyStr = `₹${Math.round(numericMonthly / 30).toLocaleString("en-IN")}`;

  return {
    leadId: lead.id,
    points: [
      `Capture high-intent customers in ${city} searching for ${category} before they contact competitors.`,
      `Showcase your core services, verified reviews (${rating} rating), and pricing with instant mobile loading.`,
      `Direct 1-tap WhatsApp consultation and inquiry buttons to convert visitors into paying clients instantly.`,
      `Fix your primary digital gap (${gap}) so Google Maps searchers can connect directly with ${name}.`,
    ],
    competitorInsight: `Top competing ${category} providers in ${city} already use modern mobile-ready websites to capture online searchers.`,
    revenueArgument: `A modern mobile-first website can easily capture ${monthlyStr}/month in new direct client inquiries and bookings.`,
    urgencyHook: `Every single day without a live website, an estimated ${dailyStr} in local customer searches goes directly to other ${category} providers in ${city}.`,
    callScript: {
      opener: `Hi, I was looking up top-rated ${category} businesses in ${city} and noticed ${name} has great ${rating} reviews, but no direct website linked on Google Maps.`,
      iceBreaker: "Do most of your new clients find you through word-of-mouth recommendations, or do they search for you online?",
      keyPoints: [
        `Over 75% of local clients research ${category} options online before calling or visiting.`,
        "A dedicated website lets customers book appointments or ask questions directly via WhatsApp.",
        `We built a free, personalized demo website for ${name} so you can see how it looks in action.`,
      ],
      objectionHandler: `Completely understand your time is valuable! Even capturing 1–2 extra clients a month easily covers the ${dailyStr}/day currently lost to competitors.`,
      closer: "Can I send you a quick 30-second screenshot demo on WhatsApp so you can check it out with zero commitment?",
      doNotSay: "Don't hard-sell or discuss complex web technologies — focus strictly on how a website brings more customers.",
    },
    postCallWhatsApp: `Hi ${name}! Great connecting with you earlier. Here is the link to the live demo website we built for your business in ${city}. Take a quick look and let me know what you think:`,
    bestTimeToCall: `Best time to reach a ${category} owner is between 2:00 PM – 4:30 PM on weekdays during off-peak hours.`,
  };
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
  const byId: Record<string, ConversionPoints> = {};
  let source = "groq";

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await runAI<Array<ConversionPoints> | Record<string, any>>(buildPrompt(batch, audits));

    if (!result.ok) {
      // Fallback heuristics for batch
      for (const lead of batch) {
        byId[lead.id] = buildFallbackPoints(lead, audits[lead.id]);
      }
      continue;
    }

    if (result.source === "gemini") source = "gemini";
    else if (result.source) source = result.source;

    const items = normalizeAIArray<ConversionPoints>(result.data);

    // If batch has 1 lead, ensure whatever AI produced is mapped to batch[0].id
    if (batch.length === 1) {
      const singleItem = (items.length > 0 ? items[0] : (typeof result.data === "object" && result.data ? result.data : null)) as any;
      if (singleItem) {
        singleItem.leadId = batch[0].id;
        items[0] = singleItem;
      }
    }

    // Map items to batch leads
    for (let idx = 0; idx < items.length; idx++) {
      const cp = items[idx] as any;
      if (!cp) continue;

      let matchedLead = batch.find((b) => b.id === cp.leadId || b.id === cp.id);
      if (!matchedLead && cp.name) {
        matchedLead = batch.find((b) => b.name.toLowerCase() === String(cp.name).toLowerCase());
      }
      if (!matchedLead && batch[idx]) {
        matchedLead = batch[idx];
      }

      const targetId = matchedLead ? matchedLead.id : (cp.leadId || cp.id);
      if (targetId) {
        byId[targetId] = {
          leadId:             targetId,
          points:             Array.isArray(cp.points) && cp.points.length > 0 ? cp.points : buildFallbackPoints(matchedLead || batch[0], audits[targetId]).points,
          competitorInsight:  cp.competitorInsight ?? "",
          revenueArgument:    cp.revenueArgument ?? "",
          urgencyHook:        cp.urgencyHook ?? "",
          postCallWhatsApp:   cp.postCallWhatsApp ?? "",
          bestTimeToCall:     cp.bestTimeToCall ?? "",
          callScript:         cp.callScript ? {
            opener:           cp.callScript.opener ?? "",
            iceBreaker:       cp.callScript.iceBreaker ?? "",
            keyPoints:        Array.isArray(cp.callScript.keyPoints) ? cp.callScript.keyPoints : [],
            objectionHandler: cp.callScript.objectionHandler ?? "",
            closer:           cp.callScript.closer ?? "",
            doNotSay:         cp.callScript.doNotSay ?? "",
          } : buildFallbackPoints(matchedLead || batch[0], audits[targetId]).callScript,
        };
      }
    }

    // Guarantee every lead in this batch has an entry
    for (const lead of batch) {
      if (!byId[lead.id] || !byId[lead.id].points || byId[lead.id].points.length === 0) {
        byId[lead.id] = buildFallbackPoints(lead, audits[lead.id]);
      }
    }

    if (i < batches.length - 1) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  // Final check: guarantee ALL auditable leads have conversion points
  for (const lead of auditable) {
    if (!byId[lead.id]) {
      byId[lead.id] = buildFallbackPoints(lead, audits[lead.id]);
    }
  }

  return NextResponse.json({ source, conversionPoints: byId });
}
