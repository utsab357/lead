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

const STYLE_INSTRUCTIONS: Record<string, string> = {
  professional: "Clean, trustworthy design. White/light background, navy or dark-green primary, serif headings + sans body. No flashy animations. Looks credible to first-time visitors.",
  modern:       "Sleek and minimal. Dark or white canvas, single accent colour, generous whitespace, subtle fade-in animations, modern sans-serif font (Inter or Outfit).",
  animated:     "Rich micro-interactions: scroll-triggered section reveals (AOS or Framer Motion), hover card lifts, floating CTA button pulse, smooth page transitions. Keep animations <300ms.",
  warm:         "Earthy warm palette (cream, terracotta, olive). Rounded corners (radius-xl), friendly illustrations or icons, handwritten-style accent font for headings. Welcoming feel.",
  luxury:       "Dark background (#0f0f0f or deep navy), gold (#c9a84c) accent, thin elegant serif headings, generous line-height, minimal UI — inspired by premium Indian brands.",
  bold:         "High-contrast vibrant palette. Electric blue or orange primary, bold 700+ weight headings, large hero text, strong above-fold CTA, high-energy feel.",
};

function buildPrompt(lead: RankedLead, platform: string, style: string): string {
  const platformNote = PLATFORM_OUTPUT[platform] ?? PLATFORM_OUTPUT.lovable;
  const styleNote    = STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.professional;

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

  return `You are a senior conversion copywriter + web designer. Write a COMPLETE, ready-to-paste website-builder prompt for ${platform}. A freelance developer will paste this into the AI builder to generate a high-converting site for this Indian local business.

## MANDATORY TECHNICAL RULES (NON-NEGOTIABLE)
- MOBILE-FIRST: India is 90%+ mobile users. Every section must look perfect on 375px wide screens first.
- FULLY RESPONSIVE: Must work flawlessly on mobile (375px), tablet (768px), and desktop (1280px). Use responsive grid/flexbox.
- FLOATING WHATSAPP BUTTON: Fixed bottom-right, always visible on all devices, opens wa.me link with pre-filled message.
- CLICK-TO-CALL HEADER: Phone number as a <a href="tel:..."> in the sticky header, large and tappable (min 44px touch target).
- PERFORMANCE: Lighthouse mobile score target 90+. No heavy libraries unless essential. Lazy-load images below the fold.
- ZERO BUGS: All links must work. No broken layouts. No overflow issues on mobile. Test all CTA buttons.
- ACCESSIBILITY: Proper alt text, ARIA labels, sufficient colour contrast (WCAG AA), semantic HTML5 tags.
- SEO: LocalBusiness JSON-LD schema, meta title + description, H1 with city + category, canonical URL.
- NO PLACEHOLDER CONTENT: Use the REAL business data provided — real name, real services, real reviews, real photos.

## DESIGN STYLE
${styleNote}

## REQUIRED SECTIONS (in order)
1. Sticky header: logo/name + click-to-call + WhatsApp link
2. Hero: powerful headline using city + category, trust line (rating + reviews), 2 CTAs (WhatsApp + Call)
3. Trust strip: star rating, review count, years in business
4. Services grid: use ACTUAL services from the data, not generic placeholders
5. About/story: use their real description if available, else write a believable one from the data
6. Customer testimonials: use REAL review text from the data (min 3)
7. FAQ: 4–6 questions relevant to this category + city
8. Location + Hours: embed Google Maps (search link), show REAL hours from data
9. Final CTA: strong closing section, WhatsApp + Call buttons
10. Footer: address, phone, copyright

## BUSINESS DATA
- Name: ${lead.name}
- Category: ${lead.category}
- Location: ${lead.address}, ${lead.city}
- Google Rating: ${lead.rating ?? "n/a"} ⭐ (${lead.reviewsCount ?? 0} reviews)
- Phone: ${lead.phone ?? "n/a"} | WhatsApp: ${lead.whatsapp ?? lead.phone ?? "n/a"}
- Years in business: ${lead.yearsInBusiness ?? "n/a"}
- Biggest gap today: ${lead.audit.biggestGap}${realPhotos}${realServices}${realHours}${realAbout}${realReviews}${socialLinks}

## OUTPUT FORMAT
Return ONLY this JSON (no markdown fences):
{
  "prompt": "the full builder prompt as a single string with clear section headings. End with: OUTPUT: ${platformNote}",
  "pitchPoints": ["3 short sentences the freelancer can tell the owner — reference specific real data (rating, review count, missing website, etc.)"]
}`;
}

export async function POST(req: Request) {
  const { lead, platform, style } = (await req.json()) as { lead: RankedLead; platform: string; style?: string };
  if (!lead) return NextResponse.json({ error: "No lead provided." }, { status: 400 });

  const result = await runWithFallback<BuildPromptResult>(buildPrompt(lead, platform || "lovable", style || "professional"));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    source: "gemini",
    style: style || "professional",
    prompt: result.data.prompt ?? "",
    pitchPoints: Array.isArray(result.data.pitchPoints) ? result.data.pitchPoints : [],
  });
}
