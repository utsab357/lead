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
    .map((l) => ({
      id: l.id,
      name: l.name,
      category: l.category,
      city: l.city,
      address: l.address,
      rating: l.rating,
      reviewsCount: l.reviewsCount,
      hasWebsite: audits[l.id].hasWebsite,
      biggestGap: audits[l.id].biggestGap,
      estLostRevenuePerMonth: audits[l.id].estLostRevenuePerMonth,
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
        .map(r => r.text.slice(0, 120)) ?? [],
      customerPraise: l.reviews
        ?.filter(r => r.rating >= 4)
        .slice(0, 3)
        .map(r => r.text.slice(0, 120)) ?? [],
    }));

  return `You are a business consultant and sales expert specialized in Indian local businesses. For each business below, generate UNIQUE, PERSONALIZED conversion points — specific reasons WHY this exact business needs a website RIGHT NOW.

These points will be used by a freelance web developer during phone calls and WhatsApp messages to convince the business owner. The points must be:
- SPECIFIC to this business (use their name, category, city, rating, reviews)
- Based on their REAL data (not generic templates)
- Include competitor analysis (imagine what similar businesses nearby are doing)
- Include revenue impact with real ₹ numbers
- Feel urgent — why they're losing money TODAY

For EACH business return a JSON object:
- "leadId": string (copy the id)
- "points": array of 4-5 unique selling points. Each point should be a complete sentence the developer can say on a call. Reference the business name and city.
- "competitorInsight": ONE sentence about what their nearby competitors are doing better online (make it realistic for their city)
- "revenueArgument": ONE sentence with specific ₹ numbers about how much revenue a website could add per month
- "urgencyHook": ONE sentence creating urgency

Output ONLY a JSON array of these objects. Vary the language — never repeat the same phrases across businesses.

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
      };
    }
  }

  return NextResponse.json({ source, conversionPoints: byId });
}
