import { NextResponse } from "next/server";
import { runAI } from "@/lib/ai";
import type { RankedLead, OutreachChannel, OutreachLanguage, OutreachResult, CallScript } from "@/lib/types";

export const maxDuration = 300;

const CHANNEL_RULES: Record<OutreachChannel, string> = {
  whatsapp: "WhatsApp DM. Max ~110 words. Warm, human. Emojis OK (👋 🔥 ✓). Short 2-4 line paragraphs. End with a low-friction yes/no ask.",
  email: "Email. Include a Subject line. Max ~150 words. No emoji in subject. Clear CTA.",
  instagram: "Instagram DM. Max ~45 words. Casual, one hook + demo link + soft ask.",
};

function buildOutreachPrompt(lead: RankedLead, channel: OutreachChannel, language: OutreachLanguage): string {
  const langRule = language === "hinglish"
    ? "Write in clean, conversational Hinglish (Hindi words written in English/Latin letters, e.g. 'Hi ji! Humne Google Maps par aapka business dekha...'). Natural, polite, respectful. Keep technical terms in English (website, design, Google Maps, online)."
    : "Write in clear, warm, conversational English. Polite, friendly, and professional without corporate jargon or pushy sales talk.";

  const conversionPointsText = lead.conversionPoints
    ? `\n- Unique conversion points: ${lead.conversionPoints.points.join("; ")}\n- Competitor insight: ${lead.conversionPoints.competitorInsight}`
    : "";

  const reviewInsights = lead.reviews?.length
    ? `\n- Customer praise: ${lead.reviews.filter(r => r.rating >= 4).slice(0, 2).map(r => `"${r.text.slice(0, 80)}..."`).join("; ") || "none found"}`
    : "";

  const businessDetails = [
    lead.services?.length ? `- Services: ${lead.services.join(", ")}` : "",
    lead.hours?.length ? `- Hours: ${lead.hours.slice(0, 3).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  return `You are writing a cold outreach message and a Day-3 follow-up for Webeta (https://webeta.site), a web design studio that creates clean sample website designs for local businesses.

IMPORTANT CONTEXT:
- The sender will ATTACH the preview screenshot image (PNG/JPG) as an image attachment in WhatsApp/DM right AFTER this message.
- Do NOT include any image URL or link in the message text. Say "Sharing the preview below 👇" or similar.

BUSINESS DATA:
- Business: ${lead.name}, ${lead.category}, ${lead.city}
- Rating: ${lead.rating ?? "n/a"} (${lead.reviewsCount ?? 0} reviews)
${conversionPointsText}${reviewInsights}
${businessDetails}

FIRST MESSAGE STRUCTURE:
1. Warm, polite greeting mentioning ${lead.name} on Google Maps in ${lead.city}.
2. One genuine compliment (e.g., strong ${lead.rating}★ rating or customer reviews).
3. Introduce: "I'm from Webeta (https://webeta.site) — we build modern websites for local businesses."
4. Value: "We created a clean 1-page sample website design for ${lead.name} just to show how your business could look online."
5. Point to attached image: "Sharing the preview image below 👇"
6. Zero pressure / Soft CTA: "No pressure or obligation at all — if you like the concept, feel free to reply or explore our work at https://webeta.site."
7. Sign off: "— Team Webeta"
8. Keep under 75-80 words.

DAY-3 FOLLOW-UP RULES (CRITICAL — ZERO FAKE PROMISES):
1. Polite, brief check-in: "Hi again! Just following up briefly to see if you got a moment to check the website mockup we shared above for ${lead.name}?"
2. ABSOLUTELY NO FAKE PROMISES:
   - Do NOT say "you are losing customers" or "we guarantee 10x sales/calls"
   - Do NOT create fake urgency ("offer expiring", "limited slots")
3. Respectful & Low-pressure: "No worries at all if you're busy! Whenever you're considering a modern website for your business, we're here to help."
4. Trust anchor: "You can explore our past work anytime at https://webeta.site or reach us right here."
5. Sign off: "— Team Webeta"
6. Keep under 40-45 words.

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
    return NextResponse.json(
      { error: outreachResult.error },
      { status: 502 },
    );
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
