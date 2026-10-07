import { NextResponse } from "next/server";
import { runAI } from "@/lib/ai";
import type { RankedLead, OutreachChannel, OutreachLanguage, OutreachResult, CallScript } from "@/lib/types";

export const maxDuration = 300;

const CHANNEL_RULES: Record<OutreachChannel, string> = {
  whatsapp: "WhatsApp DM. Max ~110 words. Warm, human. Emojis OK (👋 🔥 ✓). Short 2-4 line paragraphs. End with a low-friction yes/no ask.",
  email: "Email. Include a Subject line. Max ~150 words. No emoji in subject. Clear CTA.",
  instagram: "Instagram DM. Max ~45 words. Casual, one hook + demo link + soft ask.",
};

function getPreviewUrl(lead: RankedLead): string {
  const namePart = (lead.name || "business")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
  const cityPart = (lead.city || "city")
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 15);
  const hash = (lead.id || "").slice(-8);
  const fileSlug = `${namePart}_${cityPart}_${hash}`;
  return `https://webeta-lead-generator.onrender.com/html-previews/${fileSlug}.html`;
}

function getDynamicPageDescription(lead: RankedLead): string {
  const cat = (lead.category || "").toLowerCase();
  if (/cafe|coffee|restaurant|dining|pizza|burger|bakery|bistro|dhaba/i.test(cat)) {
    return "3-page design preview below (Homepage, Digital Menu, and Ambiance Showcase)";
  }
  if (/hotel|resort|lodge|stay|inn|guest house/i.test(cat)) {
    return "4-page design preview below (Homepage, Rooms, Amenities, and Showcase)";
  }
  if (/clinic|hospital|dental|doctor|salon|spa|gym|fitness|academy|coaching/i.test(cat)) {
    return "2-page design preview below (Homepage & Services)";
  }
  return "sample website preview below (Homepage)";
}

function buildOutreachPrompt(lead: RankedLead, channel: OutreachChannel, language: OutreachLanguage): string {
  const previewUrl = getPreviewUrl(lead);
  const pageDesc = getDynamicPageDescription(lead);

  const langRule = language === "hinglish"
    ? "Write in clean, conversational Hinglish (Hindi words in Latin letters, e.g. 'Hi ji! Humne Google Maps par aapka business dekha...'). Natural, polite, respectful Indian tone. Keep technical and business terms in English."
    : "Write in clear, warm, professional Indian business English. Polite, conversational, and respectful without robotic corporate jargon or pushy high-pressure sales talk.";

  const conversionPointsText = lead.conversionPoints
    ? `\n- Unique conversion points: ${lead.conversionPoints.points.join("; ")}\n- Competitor insight: ${lead.conversionPoints.competitorInsight}`
    : "";

  const reviewInsights = lead.reviews?.length
    ? `\n- Real customer praise: ${lead.reviews.filter(r => r.rating >= 4).slice(0, 2).map(r => `"${r.text.slice(0, 80)}..."`).join("; ") || "none found"}`
    : "";

  const businessDetails = [
    lead.services?.length ? `- Services: ${lead.services.join(", ")}` : "",
    lead.hours?.length ? `- Hours: ${lead.hours.slice(0, 3).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  return `You are writing a high-converting cold outreach message and Day-3 follow-up for Webeta (https://webeta.site), an agency that designs custom websites for local businesses.

IMPORTANT CONTEXT:
- The sender will send this text message FIRST, and immediately follow with high-resolution design preview photos attached directly in WhatsApp.
- We also provide an interactive live mobile preview link (${previewUrl}) which the business owner can open and test directly on their phone.

BUSINESS DATA:
- Business: ${lead.name}, ${lead.category}, ${lead.city}
- Rating: ${lead.rating ? `${lead.rating}★` : "Top-rated"} (${lead.reviewsCount ?? 45}+ Google reviews)
${conversionPointsText}${reviewInsights}
${businessDetails}
- Page Structure: ${pageDesc}
- Live Interactive Link: ${previewUrl}

FIRST MESSAGE STRUCTURE:
1. Warm, respectful greeting to ${lead.name} in ${lead.city}.
2. Genuine compliment acknowledging their strong Google reputation (${lead.rating ?? "4.8"}★ across ${lead.reviewsCount ?? 45}+ reviews).
3. The Opportunity / Core Problem: Mention that when potential customers find ${lead.name} on Google Maps or online, having no direct website often causes them to either order through third-party delivery apps (paying 25-30% commissions) or hesitate because they can't browse the official offerings.
4. The Solution: "To help you attract direct walk-ins and direct customer orders, Team Webeta put together a ${pageDesc}."
5. Live Link with Expiry Note:
   "🔗 Test your interactive mobile preview here:
   ${previewUrl} (Active for 72 hours)"
6. Visuals Note: "We have also attached the high-resolution design preview photos below."
7. Prototype Note (MANDATORY IN BOLD):
   Always include this reassuring note in WhatsApp bold syntax:
   "*(Note: This is an initial sample concept — your final official website will be fully customized with your exact menu/pricing, custom photos, official domain & an even more elegant design!)*"
8. Low-friction Ask: "No obligation or cost at all — take a quick look, and if you'd like to activate it on your official domain, feel free to reply right here!"
9. Professional Sign-off:
   "Best regards,
   Team Webeta
   Building Websites. Growing Businesses. | webeta.site"

STRICT FORMATTING RULES:
- Safe Emojis only: Use clean emojis (👋, 🌟, 🔗, 📸) or standard punctuation. NEVER use 4-byte hand emojis like 👇 or 👉 that render as question-mark boxes in WhatsApp.
- Clean spacing: Use short 2-3 line paragraphs so it is easy to read on mobile.
- Total length: Around 90-130 words.

DAY-3 FOLLOW-UP RULES (CRITICAL — ZERO FAKE PROMISES):
1. Polite, brief check-in: "Hi again! Just following up briefly to see if you got a moment to check the interactive preview we shared above for ${lead.name}?"
2. ZERO fake promises: Do NOT make exaggerated claims ("10x sales guaranteed") or artificial panic ("offer ending today").
3. Low-pressure & helpful: "No worries at all if you have been busy! Whenever you are ready to launch your official website and capture direct orders, we are here to help."
4. Sign-off:
   "Team Webeta
   Building Websites. Growing Businesses. | webeta.site"
5. Keep under 45 words.

Channel: ${channel} — ${CHANNEL_RULES[channel]}
Language: ${langRule}

Return ONLY this JSON (no markdown fences):
{
  "first": "the first-touch message",
  "followUp": "the day-3 follow-up message",
  "bestSendTime": "one short line on the best day/time to send in IST"
}`;
}

function buildCallScriptPrompt(lead: RankedLead): string {
  const conversionPointsText = lead.conversionPoints
    ? `\nUnique selling points to use:\n${lead.conversionPoints.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}\nCompetitor insight: ${lead.conversionPoints.competitorInsight}\nRevenue argument: ${lead.conversionPoints.revenueArgument}\nUrgency: ${lead.conversionPoints.urgencyHook}`
    : "";

  const reviewContext = lead.reviews?.length
    ? `\nReal customer reviews to reference in the call:
- Complaints: ${lead.reviews.filter(r => r.rating <= 2).slice(0, 3).map(r => `"${r.text.slice(0, 100)}"`).join("; ") || "none"}
- Praise: ${lead.reviews.filter(r => r.rating >= 4).slice(0, 2).map(r => `"${r.text.slice(0, 100)}"`).join("; ") || "none"}
- Owner engages with reviews: ${lead.ownerReplies ? "Yes" : "No"}`
    : "";

  const servicesText = lead.services?.length
    ? `\nServices they offer: ${lead.services.join(", ")}`
    : "";

  return `You are a sales call script writer for an Indian freelance web developer. Write a complete phone call script for calling this local business owner to sell them a website.

IMPORTANT: Use the REAL customer review data. If a customer complained about "no AC" or "no online booking", use that as a talking point. Reference their actual services and strengths.

Business:
- Name: ${lead.name}
- Category: ${lead.category}
- Location: ${lead.address}, ${lead.city}
- Rating: ${lead.rating ?? "n/a"} (${lead.reviewsCount ?? 0} reviews)
- Has website: ${lead.audit.hasWebsite ? "Yes (but poor quality)" : "No"}
- Biggest gap: ${lead.audit.biggestGap}
- Estimated ₹ lost/month: ${lead.audit.estLostRevenuePerMonth}${conversionPointsText}${reviewContext}${servicesText}

Return ONLY this JSON:
{
  "openingLine": "A warm, confident opening in English (mention their business name, compliment something specific from their reviews)",
  "painPoints": ["3-4 specific pain points based on their REAL review complaints and missing online features"],
  "objectionHandlers": [
    {"objection": "I don't need a website", "response": "Your response using their specific data..."},
    {"objection": "It's too expensive", "response": "Your response..."},
    {"objection": "I'll think about it", "response": "Your response..."},
    {"objection": "I already have customers", "response": "Your response..."}
  ],
  "closingLine": "A strong closing that creates urgency and asks for a meeting",
  "pricingSuggestion": "A suggested price range based on business category and size (in ₹)"
}`;
}

export async function POST(req: Request) {
  const { lead, channel, language, includeCallScript } = (await req.json()) as {
    lead: RankedLead;
    channel: OutreachChannel;
    language: OutreachLanguage;
    includeCallScript?: boolean;
  };
  if (!lead) return NextResponse.json({ error: "No lead provided." }, { status: 400 });

  // Generate outreach message (Groq → Gemini → OpenRouter fallback chain)
  const outreachResult = await runAI<OutreachResult>(
    buildOutreachPrompt(lead, channel || "whatsapp", language || "english"),
  );
  if (!outreachResult.ok) {
    const bizName = lead.name || "there";
    const previewUrl = getPreviewUrl(lead);
    const pageDesc = getDynamicPageDescription(lead);
    const ratingStr = lead.rating ? `${lead.rating}★` : "4.8★";
    const reviewsStr = lead.reviewsCount ? `${lead.reviewsCount}+` : "50+";

    return NextResponse.json({
      source: "template-fallback",
      first: `Hi Team ${bizName}! 👋

Loved seeing your strong ${ratingStr} rating across ${reviewsStr} reviews on Google Maps in ${lead.city || "town"}.

Many customers searching for ${lead.category || "great spots"} in ${lead.city || "your area"} want to check your official menu and direct bookings without paying hefty aggregator commissions.

To help you get direct customer inquiries and walk-ins, we designed a ${pageDesc}.

🔗 Test your interactive mobile preview here:
${previewUrl} (Active for 72 hours)

We've also attached your high-resolution design preview photos below.

No obligation at all — take a quick look, and if you'd like to launch it on your official domain, just reply here!

Best regards,
Team Webeta
Building Websites. Growing Businesses. | webeta.site`,
      followUp: `Hi ${bizName}! Following up briefly to check if you had a moment to explore the interactive website preview we created for you?

Whenever you're ready to get more direct customer orders and your own official domain, feel free to reply right here or visit us at https://webeta.site.

Team Webeta
Building Websites. Growing Businesses.`,
      bestSendTime: "Tue–Thu, 11am–1pm IST",
      callScript: null,
    });
  }

  // Optionally generate call script
  let callScript: CallScript | null = null;
  if (includeCallScript !== false) {
    const scriptResult = await runAI<CallScript>(buildCallScriptPrompt(lead));
    if (scriptResult.ok) {
      callScript = scriptResult.data;
    }
  }

  return NextResponse.json({
    source: "gemini",
    first: outreachResult.data.first ?? "",
    followUp: outreachResult.data.followUp ?? "",
    bestSendTime: outreachResult.data.bestSendTime ?? "Tue–Thu, 10am–12pm IST",
    callScript,
  });
}
