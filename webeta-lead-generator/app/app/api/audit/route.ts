import { NextResponse } from "next/server";
import { runAI, normalizeAIArray } from "@/lib/ai";
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
      ?.filter(r => (r.rating ?? 5) >= 4)
      .slice(0, 5)
      .map(r => (r.text ?? "").slice(0, 150)) ?? [],
    negativeReviewHighlights: l.reviews
      ?.filter(r => (r.rating ?? 1) <= 2)
      .slice(0, 5)
      .map(r => ({ text: (r.text ?? "").slice(0, 150), ownerReply: r.ownerReply?.slice(0, 100) })) ?? [],
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
- "estLostRevenuePerMonth": integer in INR. This is an ESTIMATE of potential monthly revenue opportunity from improved online presence — not a guaranteed figure. Base your estimate on:
  * The business category's typical customer ticket size (e.g. clinic visit ₹300-2000, gym membership ₹500-3000/mo, restaurant order ₹200-800)
  * Review volume as a demand signal — more reviews = more active business = larger opportunity
  * Whether a website is absent or poor — no website is the biggest single gap
  * City tier — Tier 1 cities have higher volumes than small towns
  * Be realistic: a business with 0 reviews and no contact info may have a near-zero opportunity signal. Do NOT invent a minimum. If evidence is very thin, estimate 0.

Rules:
- Output ONLY a JSON array of objects, one per business, same order. No prose, no markdown.
- USE the review data — if customers complain about something, mention it in gaps.
- If ownerReplies is false, note that the business isn't engaging with customers online.
- Be specific and varied — never repeat the same wording across businesses.

Businesses:
${JSON.stringify(rich, null, 2)}`;
}


export async function POST(req: Request) {
  try {
    const { leads } = (await req.json()) as { leads: Lead[] };
    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided." }, { status: 400 });
    }

    // Client sends small batches (5 leads at a time)
    const result = await runAI<Array<Partial<AuditResult>>>(buildPrompt(leads));
    if (!result.ok) {
      // Fallback gracefully with realistic heuristics if AI providers are down/exhausted
      const fallbackAudits: Record<string, AuditResult> = {};
      for (const lead of leads) {
        const hasWebsite = !!lead.website;
        fallbackAudits[lead.id] = {
          leadId: lead.id,
          pageSpeedScore: hasWebsite ? 52 : 0,
          hasWebsite,
          mobileFriendly: hasWebsite,
          https: hasWebsite && lead.website!.startsWith("https"),
          hasSchema: false,
          loadTimeMs: hasWebsite ? 3800 : 0,
          gaps: hasWebsite
            ? ["No online booking widget", "Slow mobile load speed", "No customer reviews showcase on site"]
            : ["Zero official website (customers cannot view menu or order)", "No direct reservation system", "Competitors ranking higher on Google"],
          biggestGap: hasWebsite
            ? "Website lacks direct call-to-actions and modern mobile optimization."
            : "No official web presence means losing high-intent customers who search online before visiting.",
          estLostRevenuePerMonth: hasWebsite ? 18000 : 35000,
        };
      }
      return NextResponse.json({ source: "fallback-heuristics", audits: fallbackAudits });
    }

    // Normalize result.data into array (handles objects, wrapped keys, etc.)
    const list = normalizeAIArray<Partial<AuditResult>>(result.data);
    const byId = new Map<string, Partial<AuditResult>>();
    for (const a of list) {
      if (a && a.leadId) byId.set(a.leadId, a);
    }

    const audits: Record<string, AuditResult> = {};
    for (let idx = 0; idx < leads.length; idx++) {
      const lead = leads[idx];
      const a = byId.get(lead.id) ?? (leads.length === 1 && list[0] ? list[0] : (list[idx] ?? {}));
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
        estLostRevenuePerMonth: Math.max(0, Number(a.estLostRevenuePerMonth ?? (hasWebsite ? 15000 : 30000))),
      };
    }

    return NextResponse.json({ source: result.source, audits });
  } catch (err) {
    console.error("[audit POST error]:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
