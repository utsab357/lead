import { NextResponse } from "next/server";
import { runGroqJSON } from "@/lib/groq";
import { runGeminiJSON } from "@/lib/gemini";
import type { Lead, AuditResult } from "@/lib/types";

export const maxDuration = 300;

function buildPrompt(leads: Lead[]): string {
  const rich = leads.map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    city: l.city,
    address: l.address,
    rating: l.rating,
    reviewsCount: l.reviewsCount,
    website: l.website || null,
    hasPhone: !!l.phone,
    hasWhatsapp: !!l.whatsapp,
    yearsInBusiness: l.yearsInBusiness ?? null,
    hours: l.hours ?? null,
    photosCount: l.photosCount ?? 0,
    about: l.about ?? null,
    services: l.services ?? [],
    priceLevel: l.priceLevel ?? null,
    socialLinks: l.socialLinks?.map(s => s.platform) ?? [],
    ownerReplies: l.ownerReplies ?? null,
    positiveReviewHighlights: l.reviews
      ?.filter(r => r.rating >= 4)
      .slice(0, 5)
      .map(r => r.text.slice(0, 150)) ?? [],
    negativeReviewHighlights: l.reviews
      ?.filter(r => r.rating <= 2)
      .slice(0, 5)
      .map(r => ({ text: r.text.slice(0, 150), ownerReply: r.ownerReply?.slice(0, 100) })) ?? [],
  }));

  return `You are a senior web-conversion analyst specializing in Indian local businesses. You have real scraped data from Google Maps for each business including their reviews, photos, hours, services, and social presence.

For EACH business, analyze ALL the data and return one JSON object with these exact fields:
- "leadId": string (copy the id)
- "hasWebsite": boolean (true only if a website URL is present)
- "pageSpeedScore": integer 0-100. If no website, use 0. If free builder (weebly/wix/business.site/wordpress.com), estimate 25-45. Otherwise 50-75.
- "mobileFriendly": boolean (false if no site or free builder)
- "https": boolean (false if no site)
- "hasSchema": boolean (almost always false for small local businesses)
- "loadTimeMs": integer. 0 if no site, else estimate 2500-9000.
- "gaps": array of 4-6 SPECIFIC gap labels based on their actual data. Examples:
  * If negative reviews mention something specific → "No online booking (customers complained)"
  * If 0 photos → "Zero online photos — customers can't see the business"
  * If no hours listed → "Business hours not visible online"
  * If services exist but no site → "8 services offered but not listed anywhere online"
  * If they have Instagram but no website → "Instagram exists but no website to convert followers"
  * Be SPECIFIC using their real data.
- "biggestGap": ONE specific sentence naming the single biggest opportunity, referencing their actual review complaints, missing features, or competitor advantages. Use REAL data from the reviews.
- "estLostRevenuePerMonth": integer in INR. Base it on reviewsCount*400 for the review-volume factor, add 30000 if no website, adjust for the category's typical ticket size and the city's market. Never below 20000.

Rules:
- Output ONLY a JSON array of objects, one per business, same order. No prose, no markdown.
- USE the review data — if customers complain about something, mention it in gaps.
- If ownerReplies is false, note that the business isn't engaging with customers online.
- Be specific and varied — never repeat the same wording across businesses.

Businesses:
${JSON.stringify(rich, null, 2)}`;
}

/** Run prompt with Groq first, fall back to Gemini if Groq fails */
async function runWithFallback<T>(prompt: string): Promise<{ ok: true; data: T; source: string } | { ok: false; error: string }> {
  // Try Groq first (higher limits, no output cap)
  const groqResult = await runGroqJSON<T>(prompt);
  if (groqResult.ok) return { ...groqResult, source: "groq" };

  // Fall back to Gemini
  const geminiResult = await runGeminiJSON<T>(prompt);
  if (geminiResult.ok) return { ...geminiResult, source: "gemini" };

  return { ok: false, error: `Groq: ${groqResult.error} | Gemini: ${geminiResult.error}` };
}


export async function POST(req: Request) {
  const { leads } = (await req.json()) as { leads: Lead[] };
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "No leads provided." }, { status: 400 });
  }

  // Client sends small batches (5 leads at a time)
  const result = await runWithFallback<Array<Partial<AuditResult>>>(buildPrompt(leads));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Normalize into lead-id keyed map
  const byId = new Map<string, Partial<AuditResult>>();
  for (const a of result.data) if (a && a.leadId) byId.set(a.leadId, a);

  const audits: Record<string, AuditResult> = {};
  for (const lead of leads) {
    const a = byId.get(lead.id) ?? {};
    const hasWebsite = a.hasWebsite ?? !!lead.website;
    audits[lead.id] = {
      leadId:                 lead.id,
      pageSpeedScore:         Number(a.pageSpeedScore ?? (hasWebsite ? 55 : 0)),
      hasWebsite,
      mobileFriendly:         a.mobileFriendly ?? false,
      https:                  a.https ?? (hasWebsite ? (lead.website ?? "").startsWith("https") : false),
      hasSchema:              a.hasSchema ?? false,
      loadTimeMs:             Number(a.loadTimeMs ?? 0),
      gaps:                   Array.isArray(a.gaps) && a.gaps.length ? a.gaps : ["No online booking", "Weak local SEO"],
      biggestGap:             a.biggestGap ?? "Limited online presence is costing this business new customers every month.",
      estLostRevenuePerMonth: Math.max(20000, Number(a.estLostRevenuePerMonth ?? 20000)),
    };
  }

  return NextResponse.json({ source: result.source, audits });
}
