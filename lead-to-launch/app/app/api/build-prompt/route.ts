import { NextResponse } from "next/server";
import { runGroqJSON } from "@/lib/groq";
import { runGeminiJSON } from "@/lib/gemini";
import type { RankedLead, BuildPromptResult } from "@/lib/types";

async function runWithFallback<T>(prompt: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const groq = await runGroqJSON<T>(prompt);
  if (groq.ok) return groq;
  return runGeminiJSON<T>(prompt);
}

export const maxDuration = 300;

const PLATFORM_OUTPUT: Record<string, string> = {
  stitch: "Use Google Stitch (stitch.withgoogle.com). Create a modern, mobile-first landing page. Output clean HTML + CSS.",
  lovable: "Single-page React + Tailwind. No backend. Use placeholder images from unsplash.com.",
  bolt: "Single-page React + Tailwind. No backend. Use placeholder images from unsplash.com.",
  "claude-code": "Next.js 16 app router + Tailwind + shadcn. Single landing page route.",
  codex: "Static index.html + Tailwind CDN, fully self-contained.",
};

function buildPrompt(lead: RankedLead, platform: string): string {
  const platformNote = PLATFORM_OUTPUT[platform] ?? PLATFORM_OUTPUT.stitch;

  // Include real scraped data for an accurate demo
  const realPhotos = lead.photoUrls?.length
    ? `\n- REAL photos from Google Maps (use these instead of stock photos): ${lead.photoUrls.slice(0, 5).join(", ")}`
    : "";
  const realServices = lead.services?.length
    ? `\n- Actual services offered: ${lead.services.join(", ")}`
    : "";
  const realHours = lead.hours?.length
    ? `\n- Business hours: ${lead.hours.join("; ")}`
    : "";
  const realAbout = lead.about
    ? `\n- About (their own words): "${lead.about.slice(0, 200)}"`
    : "";
  const realReviews = lead.reviews?.length
    ? `\n- Real customer testimonials to feature on the site: ${lead.reviews.filter(r => r.rating >= 4).slice(0, 3).map(r => `"${r.text.slice(0, 100)}" — ${r.author.split(/\d/)[0].trim()}`).join("; ")}`
    : "";
  const socialLinks = lead.socialLinks?.length
    ? `\n- Social media links to include: ${lead.socialLinks.map(s => `${s.platform}: ${s.url}`).join(", ")}`
    : "";

  return `You are a senior conversion copywriter + web designer. Write a COMPLETE, ready-to-paste website-builder prompt that a freelancer will paste into ${platform} to generate a high-converting site for this Indian local business.

IMPORTANT: Use the REAL business data below — real photos, real services, real customer reviews. Do NOT use placeholder content.

Business:
- Name: ${lead.name}
- Category: ${lead.category}
- Location: ${lead.address}, ${lead.city}
- Google rating: ${lead.rating ?? "n/a"} (${lead.reviewsCount ?? 0} reviews)
- Phone: ${lead.phone ?? "n/a"} | WhatsApp: ${lead.whatsapp ?? lead.phone ?? "n/a"}
- Years in business: ${lead.yearsInBusiness ?? "n/a"}
- Biggest gap today: ${lead.audit.biggestGap}
- Price level: ${lead.priceLevel ?? "n/a"}${realPhotos}${realServices}${realHours}${realAbout}${realReviews}${socialLinks}

The generated prompt MUST bake in: mobile-first (India = 90% mobile), floating WhatsApp button, click-to-call header, a trust strip (rating + reviews + years), their ACTUAL services from the data above (not generic ones), an about/credentials section using their real description, REAL customer reviews as testimonials, an FAQ section, a Google Maps + hours section using their real hours, LocalBusiness JSON-LD schema, and a Lighthouse-90+ mobile target. Warm, trustworthy tone.

If real photo URLs are provided, use them directly in the prompt instead of placeholder/stock images.

Return ONLY this JSON (no markdown fences):
{
  "prompt": "the full builder prompt as a single string, with clear sections and the business's real details filled in. End it with: OUTPUT: ${platformNote}",
  "pitchPoints": ["3 short sentences the freelancer can tell the owner about why this new site beats their current online presence — reference specific real data"]
}`;
}

export async function POST(req: Request) {
  const { lead, platform } = (await req.json()) as { lead: RankedLead; platform: string };
  if (!lead) return NextResponse.json({ error: "No lead provided." }, { status: 400 });

  const result = await runWithFallback<BuildPromptResult>(buildPrompt(lead, platform || "stitch"));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 502 },
    );
  }
  return NextResponse.json({
    source: "gemini",
    prompt: result.data.prompt ?? "",
    pitchPoints: Array.isArray(result.data.pitchPoints) ? result.data.pitchPoints : [],
  });
}
