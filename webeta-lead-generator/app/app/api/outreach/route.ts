import { NextResponse } from "next/server";
import { runGroqJSON } from "@/lib/groq";
import { runGeminiJSON } from "@/lib/gemini";
import type { RankedLead, OutreachChannel, OutreachLanguage, OutreachResult, CallScript } from "@/lib/types";

async function runWithFallback<T>(prompt: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const groq = await runGroqJSON<T>(prompt);
  if (groq.ok) return groq;
  return runGeminiJSON<T>(prompt);
}

export const maxDuration = 300;

const CHANNEL_RULES: Record<OutreachChannel, string> = {
  whatsapp: "WhatsApp DM. Max ~110 words. Warm, human. Emojis OK (👋 🔥 ✓). Short 2-4 line paragraphs. End with a low-friction yes/no ask.",
  email: "Email. Include a Subject line. Max ~150 words. No emoji in subject. Clear CTA.",
  instagram: "Instagram DM. Max ~45 words. Casual, one hook + demo link + soft ask.",
};

function buildOutreachPrompt(lead: RankedLead, channel: OutreachChannel, language: OutreachLanguage): string {
  const langRule = "Write in clear, warm English.";

  const conversionPointsText = lead.conversionPoints
    ? `\n- Unique conversion points: ${lead.conversionPoints.points.join("; ")}\n- Competitor insight: ${lead.conversionPoints.competitorInsight}`
    : "";

  // Include real review data if available
  const reviewInsights = lead.reviews?.length
    ? `\n- Customer complaints: ${lead.reviews.filter(r => r.rating <= 2).slice(0, 3).map(r => `"${r.text.slice(0, 80)}..."`).join("; ") || "none found"}
- Customer praise: ${lead.reviews.filter(r => r.rating >= 4).slice(0, 2).map(r => `"${r.text.slice(0, 80)}..."`).join("; ") || "none found"}
- Owner replies to reviews: ${lead.ownerReplies ? "Yes" : "No (not engaged online)"}`
    : "";

  const businessDetails = [
    lead.services?.length ? `- Services: ${lead.services.join(", ")}` : "",
    lead.hours?.length ? `- Hours: ${lead.hours.slice(0, 3).join("; ")}` : "",
    lead.socialLinks?.length ? `- Social media: ${lead.socialLinks.map(s => s.platform).join(", ")}` : "",
    lead.photosCount ? `- Photos on Maps: ${lead.photosCount}` : "- Photos on Maps: 0",
  ].filter(Boolean).join("\n");

  return `You are a top cold-outreach copywriter helping a freelancer pitch a free website demo to a local business owner. Proven structure: personal hook → specific compliment grounded in their data → one-line pain (their biggest gap) → the free demo link → a low-friction yes/no ask. The day-3 follow-up restates the cost of inaction in ₹ and asks for a 5-min call.

IMPORTANT: Use the REAL customer review data to make the pitch personal. If customers complained about something, mention how a website solves it. If customers praise something, compliment the owner on it.

Business:
- Name: ${lead.name}
- Owner: use "${lead.name.includes("Dr.") ? lead.name.split(",")[0] : "Sir / Ma'am"}" if no clear owner name
- Category: ${lead.category}
- Rating: ${lead.rating ?? "n/a"} (${lead.reviewsCount ?? 0} reviews), ${lead.city}
- Biggest gap: ${lead.audit.biggestGap}
- Estimated ₹ lost/month: ${lead.audit.estLostRevenuePerMonth}
- Demo status: The freelancer has already prepared a visual demo layout of the business website (not a live URL — it's a screenshot they will share on WhatsApp/email). So the message should reference "I've prepared a demo layout/design for your business" and offer to share it — NOT include any URL link.${conversionPointsText}${reviewInsights}
${businessDetails}

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

  // Generate outreach message (Groq first, Gemini fallback)
  const outreachResult = await runWithFallback<OutreachResult>(
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
    const scriptResult = await runWithFallback<CallScript>(buildCallScriptPrompt(lead));
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
