import { NextResponse } from "next/server";
import { runGeminiJSON } from "@/lib/gemini";
import type { RankedLead, BuildPromptResult, ExtraPage } from "@/lib/types";

/**
 * Small AI request — only asks for pitch points and extra page suggestions.
 * ~200 input tokens + ~300 output = ~500 tokens total.
 * The website prompt itself is built by code (buildPrompt), not AI.
 */
async function getCreativeInsights(
  lead: RankedLead,
): Promise<{ pitchPoints: string[]; extraPages: ExtraPage[] }> {
  const prompt = `You are a web sales consultant. A developer is pitching a website to a local Indian business.

Business data:
- Name: ${lead.name}
- Category: ${lead.category}
- City: ${lead.city?.split(",")[0] ?? ""}
- Rating: ${lead.rating ?? "n/a"} ⭐ (${lead.reviewsCount ?? 0} reviews)
- Has website: ${lead.website ? "Yes" : "No"}
- Phone: ${lead.phone ?? "n/a"}
${lead.about ? `- About: ${lead.about.slice(0, 200)}` : ""}
${lead.services?.length ? `- Services: ${lead.services.slice(0, 6).join(", ")}` : ""}

Return ONLY this JSON (no markdown, no explanation):
{
  "pitchPoints": [
    "Sentence 1 — reference their real rating/reviews/gap to make it personal",
    "Sentence 2 — revenue/opportunity argument",
    "Sentence 3 — urgency or local competition hook"
  ],
  "extraPages": [
    {
      "id": "snake_case_id",
      "icon": "📅",
      "label": "Page Name",
      "desc": "One sentence: what this page does and why THIS specific business needs it"
    }
  ]
}

For extraPages: suggest only what genuinely fits this business type. 3-5 pages max.`;

  const result = await runGeminiJSON<{ pitchPoints: string[]; extraPages: ExtraPage[] }>(prompt, {
    temperature: 0.5,
  });

  if (result.ok) {
    return {
      pitchPoints: Array.isArray(result.data.pitchPoints) ? result.data.pitchPoints : [],
      extraPages:  Array.isArray(result.data.extraPages)  ? result.data.extraPages  : [],
    };
  }

  // AI failed — return safe defaults so the prompt still works
  return {
    pitchPoints: [
      `${lead.name} has ${lead.reviewsCount ?? "many"} Google reviews but no website — every competitor with a website is taking their customers.`,
      `A professional website turns their ${lead.rating ?? "high"}⭐ rating into a 24/7 sales tool that books clients even when the phone is off.`,
      `Local businesses in ${lead.city?.split(",")[0] ?? "your city"} are moving online fast — being first in ${lead.category} here is a real advantage.`,
    ],
    extraPages: [],
  };
}

/**
 * Normalizes a Google CDN photo URL to prefer a usable higher-resolution variant.
 * Google Maps photo URLs contain dimension params like =w32-h32 or =w408-h306.
 * If the URL is a googleusercontent.com URL with a small dimension (w < 400 or h < 400),
 * we replace the dimension suffix with =w800-h600-k-no (a standard Maps large variant).
 * If the URL already has large dimensions, has no detectable dimension param, or is not
 * a Google CDN URL, it is returned unchanged.
 */
function normalizeGooglePhotoUrl(url: string): string {
  if (!url.includes("googleusercontent.com")) return url;
  // Match trailing =wNNN-hNNN[-optional-flags] pattern
  const suffixMatch = url.match(/=w(\d+)-h(\d+)([^&\s"']*)?$/);
  if (suffixMatch) {
    const w = parseInt(suffixMatch[1], 10);
    const h = parseInt(suffixMatch[2], 10);
    if (w < 400 || h < 400) {
      return url.replace(/=w\d+-h\d+[^&\s"']*$/, "=w800-h600-k-no");
    }
    return url; // already large enough
  }
  // Match path-embedded /wNNN-hNNN/ pattern (less common)
  const pathMatch = url.match(/\/w(\d+)-h(\d+)\//);
  if (pathMatch) {
    const w = parseInt(pathMatch[1], 10);
    const h = parseInt(pathMatch[2], 10);
    if (w < 400 || h < 400) {
      return url.replace(/\/w\d+-h\d+\//, "/w800-h600/");
    }
  }
  return url;
}

export const maxDuration = 300;

/**
 * Maps a business category to a curated Unsplash stock photo URL for use as
 * the hero background. These are landscape, high-resolution, professionally
 * composed photos that look great as full-bleed hero backgrounds.
 * Real scraped Google Maps photos go to gallery/about — NOT the hero.
 */
function getCategoryHeroPhoto(category: string): string {
  const c = category.toLowerCase();

  if (/gym|fitness|sport|yoga|dance|zumba|aerobic|pilates|crossfit|workout|martial|mma|boxing/.test(c))
    return "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=85";

  if (/restaurant|dining|biryani|dhaba|mughlai|chinese|pizza|burger|fast food|eatery|canteen|mess|kitchen/.test(c))
    return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=85";

  if (/cafe|coffee|tea|chai|bakery|pastry|dessert|sweet|mithai|snack/.test(c))
    return "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=85";

  if (/salon|beauty|hair|barber|grooming|makeup|cosmetic|nail|threading|spa|massage|wellness|ayurveda|therapy/.test(c))
    return "https://images.unsplash.com/photo-1560066984-138daaa1183f?auto=format&fit=crop&w=1600&q=85";

  if (/clinic|doctor|physician|medical|hospital|health centre|healthcare|nursing/.test(c))
    return "https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=1600&q=85";

  if (/dental|dentist|orthodontic|teeth/.test(c))
    return "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1600&q=85";

  if (/pharmacy|chemist|medical store|drug store/.test(c))
    return "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1600&q=85";

  if (/school|college|coaching|tuition|academy|institute|university|education|classes|tutorial/.test(c))
    return "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1600&q=85";

  if (/hotel|lodge|resort|guest house|hostel|inn|accommodation|banquet|convention/.test(c))
    return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=85";

  if (/jewel|jewellery|gold|diamond|silver|ornament/.test(c))
    return "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1600&q=85";

  if (/clothing|fashion|boutique|garment|textile|saree|readymade|tailor|apparel/.test(c))
    return "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=85";

  if (/car|auto|vehicle|motor|garage|workshop|bike|motorcycle|tyre|service centre/.test(c))
    return "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1600&q=85";

  if (/real estate|property|builder|apartment|flat|office space|construction/.test(c))
    return "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=85";

  if (/tech|software|it company|digital|computer|development|startup|agency/.test(c))
    return "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85";

  if (/grocery|kirana|supermarket|general store|mart/.test(c))
    return "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1600&q=85";

  if (/event|wedding|catering|photography|video|studio/.test(c))
    return "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1600&q=85";

  // Default: modern professional commercial interior
  return "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=85";
}

/**
 * Cleans an Indian phone number to +91 XXXXXXXXXX format.
 */
function cleanPhone(raw: string | null | undefined): string {
  if (!raw) return "n/a";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12 && digits[2] === "0") return `+91 ${digits.slice(3)}`;
  if (digits.length === 11 && digits[0] === "0") return `+91 ${digits.slice(1)}`;
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+91 ${digits.slice(2)}`;
  return `+91 ${digits}`;
}

function cleanWaNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return cleanPhone(raw).replace(/[^\d]/g, "");
}

const PLATFORM_OUTPUT: Record<string, string> = {
  stitch:       "Use Google Stitch (stitch.withgoogle.com). Output ONE complete HTML file. ALL CSS must be inside a <style> tag. ALL JavaScript must be inside a <script> tag. External CDN libraries (e.g. AOS, Google Fonts via @import) are allowed. External image URLs are allowed. Google Maps iframes/links are allowed. No React. No build step. No separate CSS or JS files.",
  lovable:      "Build in Lovable (lovable.dev). Tech stack: React 18 + TypeScript + Tailwind CSS (frontend), Django 4.x + Django REST Framework (backend). Create React components with proper props and types. Use Tailwind utility classes for all styling. Backend API endpoints for contact form and appointment booking using Django REST Framework. Do NOT use plain HTML or vanilla CSS.",
  bolt:         "Build in Bolt (bolt.new). Tech stack: React 18 + TypeScript + Tailwind CSS (frontend), Django 4.x + Django REST Framework (backend). Structure as proper React components. Use Tailwind for styling. Include Django models and DRF views for form submissions. Do NOT use plain HTML or vanilla CSS.",
  "claude-code":"Build with Claude Code. Tech stack: React 18 + TypeScript + Tailwind CSS + shadcn/ui (frontend), Django 4.x + Django REST Framework (backend). Use Next.js App Router for the frontend. Include Django models, serializers, and API views. Proper folder structure for both frontend and backend.",
  codex:        "Build with OpenAI Codex. Tech stack: React 18 + TypeScript + Tailwind CSS (frontend), Django 4.x + Django REST Framework (backend). Provide complete component code and Django backend code.",
};

// 2026-level design system per style
const STYLE_SYSTEM: Record<string, string> = {
  professional: `
DESIGN SYSTEM — PROFESSIONAL TRUST (2026):
- Fonts: Import from Google Fonts: "Plus Jakarta Sans" (weights 400,500,600,700,800) for body, "Instrument Serif" for display headings. Use: font-family: 'Plus Jakarta Sans', sans-serif globally; headings use 'Instrument Serif'.
- Colors: --bg: #F9FAFB; --surface: #FFFFFF; --primary: #1A3C5E; --primary-light: #2563EB; --accent: #0EA5E9; --text: #0F172A; --muted: #64748B; --border: #E2E8F0;
- Hero: full-viewport-height (100dvh). Use the HERO STOCK PHOTO URL from the HERO section as background-image with dark-blue gradient overlay (linear-gradient(135deg, rgba(26,60,94,0.92) 0%, rgba(14,165,233,0.6) 100%)). White headline text, H1 font-size clamp(2.5rem,5vw,4.5rem), font-weight 800, line-height 1.1.
- Cards: background white, border 1px solid var(--border), border-radius 16px, box-shadow: 0 4px 24px rgba(0,0,0,0.06). On hover: transform translateY(-4px), box-shadow 0 12px 40px rgba(0,0,0,0.12), transition 200ms ease.
- Buttons: Primary = background linear-gradient(135deg, #1A3C5E, #2563EB), color white, border-radius 50px, padding 14px 32px, font-weight 600, box-shadow: 0 4px 20px rgba(37,99,235,0.35). Hover: brightness(1.08) scale(1.02).
- Section alternation: sections alternate between #F9FAFB and white backgrounds. One key section uses --primary as dark background with white text.`,

  modern: `
DESIGN SYSTEM — SLEEK MODERN (2026):
- Fonts: Import "Inter" (weights 400,500,600,700,900) and "Syne" (700,800) from Google Fonts. Headlines use Syne, body uses Inter.
- Colors: --bg: #0A0A0F; --surface: #111118; --card: #16161E; --primary: #6C63FF; --accent: #00D4AA; --text: #F0F0F5; --muted: #8B8B9E; --border: rgba(255,255,255,0.08);
- DARK MODE by default. The entire site is dark.
- Hero: 100dvh, dark background (#0A0A0F), large animated gradient blob behind the text (CSS: radial-gradient animation pulsing slowly). H1: font-size clamp(3rem,6vw,5.5rem), font-weight 900, background: linear-gradient(135deg,#F0F0F5,#6C63FF,#00D4AA), -webkit-background-clip:text, color:transparent. Sub-headline: color var(--muted).
- Cards: background var(--card), border 1px solid var(--border), border-radius 20px, backdrop-filter blur(10px). Glassmorphism inner glow: box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 32px rgba(0,0,0,0.4).
- Buttons: Primary = background linear-gradient(135deg,#6C63FF,#00D4AA), border-radius:50px, font-weight:700. Box-shadow: 0 0 24px rgba(108,99,255,0.5). Hover: box-shadow 0 0 40px rgba(108,99,255,0.7), scale(1.03). WhatsApp button: background #25D366, box-shadow: 0 0 20px rgba(37,211,102,0.5).
- BENTO GRID for services: CSS Grid with varying cell sizes (some 1 col, some 2 col span) for visual interest.
- Scrollbar: custom thin dark scrollbar.`,

  animated: `
DESIGN SYSTEM — ANIMATED KINETIC (2026):
- Fonts: "Cabinet Grotesk" via @import or fallback "DM Sans" (weights 400,500,700,800) from Google Fonts. "Clash Display" or fallback "Space Grotesk" (700,800) for headlines.
- Colors: --bg: #FAFAF9; --primary: #FF4D4D; --secondary: #FF8C42; --dark: #1A1A2E; --text: #1A1A2E; --muted: #6B7280;
- KINETIC ENERGY: Everything moves. Use AOS library (CDN) with data-aos attributes for ALL sections (fade-up, fade-right, zoom-in). Initialize AOS with duration:600, easing:'ease-out-cubic', once:true.
- Hero: Full viewport. Animated gradient background cycling between colors (CSS @keyframes gradient-shift on background-position). Massive H1 (clamp(3.5rem,7vw,6rem)) in --dark color. Bold red/orange gradient on key word in headline.
- Floating elements: decorative blobs (CSS circles with blur:40px, opacity:0.15) positioned absolute behind content.
- Buttons: Gradient red-to-orange, border-radius:8px (not round), with animated shimmer ::after pseudo-element sliding across on hover. Arrow icon → inside button that moves right on hover.
- Stats section: animated number counter (JS countUp on IntersectionObserver). Large numbers in gradient text.
- Service cards: Tilt effect on mouse-move (JS), gradient left border on hover, icon scales 1.2x.`,

  warm: `
DESIGN SYSTEM — WARM EARTHY PREMIUM (2026):
- Fonts: "Lora" (400,600,700) for headings, "Nunito" (400,600,700) for body from Google Fonts.
- Colors: --bg: #FDF8F3; --surface: #FFFBF7; --primary: #C4622D; --secondary: #E8A87C; --dark: #3D2B1F; --text: #3D2B1F; --muted: #8B6F5E; --border: #F0E0D0;
- Warm, cozy, trustworthy. Like a premium Ayurvedic/spa brand.
- Hero: full-height, warm cream background with soft botanical SVG pattern (CSS background-image repeating). Large Lora serif H1 in --dark. Warm terracotta CTA button.
- Cards: rounded-2xl (border-radius:24px), warm ivory background, subtle terracotta left-border (4px solid --primary). Icon: terracotta color.
- Section separator: organic wavy SVG divider between sections (use inline SVG wave).
- Testimonials: large quote marks (font-size:5rem, color:--secondary, opacity:0.3), card with cream background and warm shadow.
- Accent elements: leaf/botanical icons from Unicode or simple SVG.`,

  luxury: `
DESIGN SYSTEM — DARK LUXURY PREMIUM (2026):
- Fonts: "Cormorant Garamond" (300,400,600,700) for headings, "Montserrat" (300,400,500,600) for body from Google Fonts.
- Colors: --bg: #080808; --surface: #0F0F0F; --card: #141414; --gold: #C9A84C; --gold-light: #E8C870; --text: #F5F0E8; --muted: #8A8070; --border: rgba(201,168,76,0.15);
- Ultra-premium dark gold aesthetic. Think Burj Al Arab, not a regular business.
- Hero: 100vh, pure black background. Use the HERO STOCK PHOTO URL from the HERO section as background-image with a very dark overlay (rgba(0,0,0,0.75)). Thin gold horizontal line above H1. H1: font-family Cormorant Garamond, font-weight 300, font-size clamp(3rem,5vw,5rem), letter-spacing:0.05em, color:--text. Gold gradient on the key phrase.
- Dividers: thin gold lines (1px, opacity 0.3) between sections.
- Cards: --card background, gold top-border (2px solid --gold), border-radius 0 (square). No rounded corners — luxury is precise.
- Buttons: outlined style = border 1px solid --gold, color --gold, background transparent. On hover: background fills with --gold, color #080808. Transition 300ms.
- Stats: gold numbers, small caps label below. Dividers between stat items.`,

  bold: `
DESIGN SYSTEM — BOLD HIGH-ENERGY (2026):
- Fonts: "Bebas Neue" for display headlines, "Manrope" (400,500,600,700,800) for body from Google Fonts.
- Colors: --bg: #FFFFFF; --dark: #0D0D0D; --primary: #FF3300; --secondary: #FFB800; --text: #0D0D0D; --muted: #555;
- HIGH CONTRAST. Bold. Graphic design energy.
- Hero: split screen. Left half: solid --dark background with giant H1 in Bebas Neue, font-size clamp(4rem,10vw,9rem), line-height:0.95, color:white. "CALL" word in --primary red. Right half: Use the HERO STOCK PHOTO URL from the HERO section (object-fit:cover). On mobile: stacked (left on top).
- Accent elements: angled/diagonal section dividers (CSS clip-path: polygon) instead of straight horizontal.
- Service cards: flat bold cards with thick colored left border, icon in a colored square badge, card border-radius:0. Each card has a different accent color.
- CTA button: background --primary red, all-caps text in Bebas Neue, wide letter-spacing, no border-radius (sharp corners). On hover: background --secondary yellow, color --dark.
- Stats: giant numbers in Bebas Neue on dark background, red underline accent.`,

  "ai-decides": `
AI-SELECTED DESIGN SYSTEM — INTELLIGENCE MODE:

STEP 1 — ANALYZE THE BUSINESS (do this silently before any code):
Look at the business data provided: category, name, rating, reviews count, about text, and services.
Ask yourself:
  - What kind of customer does this business serve? (premium/luxury vs everyday/budget, young vs mature)
  - What emotion should the website evoke? (trust/calm, energy/excitement, warmth/comfort, prestige/exclusivity)
  - What industry conventions apply? (clinics = professional clean; gyms = bold energy; restaurants = warm/inviting; salons/boutiques = luxury; tech/startups = modern dark)
  - NOTE: If real photos are available below, their visual tone (dark/moody vs bright/airy) may inform the style choice. If no photos are available, base the decision on category and business name alone.

STEP 2 — CHOOSE ONE of these established styles as the primary:
  A) Professional Trust — clinics, lawyers, CAs, consultants, education
  B) Sleek Modern Dark — tech, agencies, co-working, modern gyms, studios
  C) Animated Kinetic — fitness, events, sports, entertainment, youth brands
  D) Warm Earthy Premium — restaurants, cafes, Ayurveda, wellness, food retail
  E) Dark Luxury — high-end salons, boutiques, jewellery, premium hotels, spas
  F) Bold High-Energy — gyms, MMA, street food, nightlife, streetwear

STEP 3 — STATE YOUR CHOICE (as an HTML comment at the very top of your output):
<!-- STYLE: [chosen style name] | REASON: [one sentence explaining why this fits this specific business] -->

STEP 4 — IMPLEMENT THAT STYLE COMPLETELY:
After choosing, implement the full design system for that style. For the hero background: always use the HERO STOCK PHOTO URL provided in the HERO section — apply the appropriate gradient overlay for your chosen style on top of it.`,
};

function buildPrompt(lead: RankedLead, platform: string, style: string): string {
  const platformNote = PLATFORM_OUTPUT[platform] ?? PLATFORM_OUTPUT.stitch;

  // Support combined styles like "professional+animated"
  const styleIds = style.split("+").filter(Boolean);
  const designSystem = styleIds
    .map((id) => STYLE_SYSTEM[id] ?? "")
    .filter(Boolean)
    .join("\n\nADDITIONAL STYLE LAYER:\n");

  const phone = cleanPhone(lead.phone);
  const waNumber = cleanWaNumber(lead.whatsapp ?? lead.phone);
  const waLink = `https://wa.me/${waNumber}?text=Hello%20${encodeURIComponent(lead.name)}`;
  const telLink = `tel:${phone.replace(/\s/g, "")}`;

  const photoCount = lead.photoUrls?.length ?? 0;
  const heroPhoto = getCategoryHeroPhoto(lead.category);
  const realPhotos = photoCount > 0
    ? `\nREAL BUSINESS PHOTOS FROM GOOGLE MAPS (${photoCount} available):
${lead.photoUrls!.slice(0, 6).map((u, i) => `  Photo ${i + 1}: ${normalizeGooglePhotoUrl(u)}`).join("\n")}
PHOTO PLACEMENT RULES — READ CAREFULLY:
- These are customer-panel photos from Google Maps. They show the real business.
- Photo 1 (or whichever is listed first) = the FEATURED photo for the About section left panel.
- All photos = use in the Gallery page.
- DO NOT use these photos as the hero background. The hero has its own professional stock photo (see HERO section below).
- Never repeat the same URL in two sections.
- If a section needs Photo 3 but only ${photoCount} exist, use a CSS gradient from the design system.`
    : `\nNO REAL BUSINESS PHOTOS:
- About section left panel: use a styled brand panel — large business name in typography, city, and a CSS decorative pattern from the design system.
- Gallery: placeholder cards with business name and "Photos coming soon" text.
- Do NOT embed any broken image URLs.`;
  const realServices = lead.services?.length
    ? `\nACTUAL SERVICES (use exactly these, do not invent others):\n${lead.services.map(s => `  - ${s}`).join("\n")}`
    : "";
  const realHours = lead.hours?.length
    ? `\nBUSINESS HOURS:\n${lead.hours.map(h => `  - ${h}`).join("\n")}`
    : "";
  const realAbout = lead.about
    ? `\nABOUT (use this real text): "${lead.about.slice(0, 300)}"`
    : "";
  const realReviews = lead.reviews?.filter(r => r.rating >= 4).slice(0, 5).length
    ? `\nREAL CUSTOMER REVIEWS (use these exact quotes):\n${lead.reviews!.filter(r => r.rating >= 4).slice(0, 5).map(r => `  - "${r.text.slice(0, 180)}" — ${r.author.split(/\d/)[0].trim()} (${r.rating}★)`).join("\n")}`
    : "";
  const socialLinks = lead.socialLinks?.length
    ? `\nSOCIAL LINKS: ${lead.socialLinks.map(s => `${s.platform}: ${s.url}`).join(" | ")}`
    : "";
  const mapsLink = lead.mapUrl ?? `https://maps.google.com/?q=${encodeURIComponent(lead.name + " " + lead.city)}`;

  return `You are a WORLD-CLASS web designer and developer in 2026. Your job is to write a complete, production-ready website prompt for a local Indian business. The output MUST look like a premium 2026 agency-built website — NOT a WordPress template from 2015.

## PLATFORM
${platformNote}

## MANDATORY DESIGN RULES — READ EVERY WORD
1. FULL-VIEWPORT HERO: The hero section MUST be 100dvh. Use the HERO STOCK PHOTO URL provided in the HERO section below as the CSS background-image. Apply a gradient overlay from the design system on top of it. The headline MUST be large (clamp min 2.8rem mobile, 4.5rem desktop). Do NOT use scraped Google Maps photos in the hero.
2. REAL DESIGN SYSTEM: Use the complete design system below. Apply CSS custom properties (--variables) from the top. Every color, font, and spacing value must come from the system.
3. MICRO-INTERACTIONS: Every card, button, and image must have a hover state with transform and transition. No static elements.
4. ANIMATED STATS: Create a "trust numbers" section with big animated counters (JS IntersectionObserver + requestAnimationFrame countUp). Show ONLY verified statistics supplied in BUSINESS DATA (rating, review count, years in business). If a stat is not in BUSINESS DATA, omit it entirely — do NOT invent placeholder numbers.
5. BENTO GRID or MASONRY for services — NOT a boring equal-column grid. At least one card should span 2 columns on desktop for visual interest.
6. GLASSMORPHISM for overlapping UI elements (testimonial cards, floating badges, stat chips).
7. GRADIENT TEXT on the main hero headline or key section heading (CSS: background:gradient; -webkit-background-clip:text; color:transparent).
8. FLOATING WHATSAPP: Fixed bottom-right, pulsing glow animation, always visible.
9. SMOOTH SCROLL: html { scroll-behavior: smooth; }
10. MOBILE FIRST: Design for 375px, enhance at 768px, maximize at 1280px. EVERY section must be tested mentally for mobile overflow.

## DESIGN SYSTEM
${designSystem}

## REQUIRED SECTIONS (do not skip any)

### 1. STICKY HEADER
- Height: 64px. backdrop-filter: blur(20px). Semi-transparent background.
- Left: business name as wordmark (bold, styled).
- Right: Click-to-call phone as <a href="${telLink}">${phone}</a> with a phone icon. WhatsApp icon linking to ${waLink}.
- Hamburger menu on mobile that slides in a full-screen nav overlay.

### 2. HERO (100dvh)
- Background: Use this professional stock photo as the full-bleed hero background-image: ${heroPhoto}
  This is a curated stock photo matching the business category — it always looks stunning as a hero.
  Apply the gradient overlay from the design system on top (dark enough for white text to read clearly).
  Do NOT use any Google Maps / googleusercontent.com photo URL in the hero background.
- Floating trust badge (glassmorphism)${lead.rating != null || (lead.reviewsCount ?? 0) > 0 ? `: "★ ${lead.rating?.toFixed(1)} · ${lead.reviewsCount} Reviews" — positioned absolute, animated fade-in.` : `: show "Google Maps Listed" or "Now Open" — do NOT invent a rating or review count the business does not have.`}
- H1: Bold, large, gradient or white text: "Trusted ${lead.category} in ${lead.city?.split(",")[0]}"
- Sub-headline: short, compelling, max 12 words.
- TWO CTA buttons: WhatsApp primary, Call secondary. Both with hover animations.
- Scroll indicator (animated bouncing chevron or dot at bottom).

### 3. ANIMATED TRUST STATS STRIP
- Dark or accent background (not white).
- Stats strip items — include ONLY the stats for which real data is available:
${lead.rating != null ? `  * ${lead.rating.toFixed(1)}★ Rating` : "  * (omit rating — no verified rating data)"}
${(lead.reviewsCount ?? 0) > 0 ? `  * ${lead.reviewsCount}+ Reviews` : "  * (omit review count — business has no reviews yet)"}
${lead.yearsInBusiness != null ? `  * ${lead.yearsInBusiness}+ Years` : "  * (omit years — not verified; do NOT invent a number)"}
  * If fewer than 3 verified stats are available, show fewer stats. Do NOT invent percentages ("100% Satisfaction"), vague claims ("Local Experts", "Award Winning", "Trusted by 1000+"), or any statistic that is not in BUSINESS DATA.
- Each number animates counting up when scrolled into view (JS countUp).
- Stats separated by vertical dividers or gold/accent lines.

### 4. SERVICES — BENTO GRID LAYOUT
${realServices || "- No verified services are available in BUSINESS DATA. Do NOT invent a list of services based on the category. Instead, create a neutral 'What We Offer' section with a single card that says the business offers professional services in their category, and a CTA to contact them via WhatsApp for details. Do NOT name specific services that are not in BUSINESS DATA."}
- CSS Grid: on desktop, mix 1-col and 2-col spans. First card spans 2 columns. Others are 1. This creates a bento layout.
- Each card: icon (SVG or emoji), service name as bold heading, 1 short description sentence, "Book Now →" link to ${waLink}.
- Cards use the glassmorphism/card style from the design system.
- Hover: lift + glow effect.

### 5. ABOUT / STORY (SPLIT SCREEN)
- Left side: ${photoCount >= 2 ? "Photo 1 as the featured image (full height, object-fit cover). Photo 2 overlapping at a slight angle/offset below it for visual depth. These are the real business photos — they create authenticity." : photoCount === 1 ? "Photo 1 centered and padded — the actual business photo. Do NOT reuse the hero stock photo here." : "Styled brand panel: large business name in typography, category badge, city — using design system colors and a subtle CSS geometric pattern. No images."}
- Right side: "Our Story" label, H2, the about text, a "Speak with Us" button.
${realAbout || "- No verified about/story text exists in BUSINESS DATA. Do NOT invent: business history, founder story, years in business, mission statement, staff claims, or achievements. Instead, create a visually strong neutral section with only verified facts (name, category, city) and a clear CTA: \"Get in touch to learn about us\" linking to the WhatsApp link. The section must look premium but must not fabricate any history or claims."}
- On mobile: left side stacks above text.

### 6. CUSTOMER TESTIMONIALS (CARDS WITH GLASSMORPHISM)
${realReviews || "- No real reviews are available for this business yet. Instead of fabricating testimonials, build the testimonials section as a 'Leave Us a Review' invite: show 3 empty card placeholders with a star icon, the text \"Be the first to share your experience!\", and a \"Write a Review\" button linking to their Google Maps listing. Do NOT invent review quotes."}
- Layout: 3-column grid on desktop, 1-column on mobile.
- Each card: giant quote mark (CSS content, styled in accent color), star rating (show ★ symbols), review text (italic), reviewer name bold.
- Cards: glassmorphism style from design system.
- Add subtle fade-up animation (AOS or CSS @keyframes).

### 7. FAQ ACCORDION
- 5 questions relevant to ${lead.category} in ${lead.city?.split(",")[0]}.
- Each item: question as bold clickable header, answer expands smoothly (CSS max-height transition or JS toggle).
- Arrow icon rotates 180° when open.
- CRITICAL FAQ RULE: Questions may be category-relevant, but answers must use ONLY verified information in BUSINESS DATA. If the answer is not in BUSINESS DATA, use: "Please contact us directly for the latest information" and link to ${waLink}. Do NOT assume or invent: specific prices, parking availability, online/offline consultation, booking requirements, payment methods, emergency services, specific procedures, or opening hours. Never state as fact anything that is not explicitly in BUSINESS DATA.

### 8. LOCATION + HOURS
- Two-column: Left = embedded Google Maps iframe using link: ${mapsLink}, height 350px, border-radius from design system.
- Right = Address card with icon, Hours list with icon.
${realHours || "- No verified business hours are available in BUSINESS DATA. Do NOT invent hours. Instead, display a message: 'Contact us for current opening hours' with the WhatsApp and phone CTA. Do NOT show hours like 'Mon-Sat 9am-8pm' or 'Sunday Closed' unless those exact hours are in BUSINESS DATA."}
- "Get Directions" button linking to Google Maps.

### 9. FINAL CTA SECTION
- Accent/dark colored background (not white — use the primary or dark color from design system).
- Bold large closing headline: "Ready to ${lead.category.toLowerCase().includes("clinic") || lead.category.toLowerCase().includes("health") ? "heal naturally?" : "get started?"}"
- Sub-text: one compelling sentence referencing ${lead.city?.split(",")[0]}.
- Two buttons: WhatsApp + Call. Both large and prominent.
- Optional: subtle background pattern or noise texture.

### 10. FOOTER
- Dark background. 3–4 columns on desktop.
- Col 1: Business name + short tagline + social links: ${socialLinks || "(no verified social profiles — show only the WhatsApp link and phone number; do NOT add Facebook, Instagram, YouTube, or other social icons unless their URLs are in BUSINESS DATA)"}
- Col 2: Quick links (Home, Services, About, Contact)
- Col 3: Contact info — address with 📍 icon, phone with 📞 as click-to-call, WhatsApp link.
- Bottom bar: © 2026 ${lead.name}. All rights reserved. | Privacy Policy | Terms
${lead.socialLinks?.find(s => s.platform === "facebook")?.url ? `- Social link to Facebook: ${lead.socialLinks.find(s => s.platform === "facebook")!.url}` : "- (No verified Facebook URL — do NOT include a Facebook link or '#' placeholder)"}

## BUSINESS DATA
- Name: ${lead.name}
- Category: ${lead.category}
- Address: ${lead.address}, ${lead.city}
- Rating: ${lead.rating ?? "n/a"} ⭐ (${lead.reviewsCount ?? 0} reviews)
- Phone: ${phone}
- WhatsApp link: ${waLink}
- Tel link: ${telLink}
- Google Maps: ${mapsLink}
${lead.socialLinks?.find(s => s.platform === "facebook")?.url ? `- Facebook: ${lead.socialLinks.find(s => s.platform === "facebook")!.url}` : "- Facebook: not available (do NOT invent or include a Facebook URL)"}
${realPhotos}${realServices}${realHours}${realAbout}${realReviews}${socialLinks}

## TECHNICAL REQUIREMENTS
- SEO: <title>${lead.name} – ${lead.category} in ${lead.city?.split(",")[0]}</title>, meta description (compelling, 160 chars), LocalBusiness JSON-LD schema with real data, canonical URL, H1 with city+category.
- PERFORMANCE: lazy-load all images below the fold (<img loading="lazy">), no heavy libraries except AOS (CDN, 14kb).
- ACCESSIBILITY: alt text on every image, aria-labels on all buttons/links, min 44px touch targets, WCAG AA contrast.
- ZERO BUGS: no mobile overflow, all links functional, no broken images.
- Use AOS library for scroll animations: <link rel="stylesheet" href="https://unpkg.com/aos@2.3.4/dist/aos.css"> and <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>, initialize with AOS.init({duration:600,easing:'ease-out-cubic',once:true}).

## VERIFIED DATA RULE — THIS IS MANDATORY
1. Use ONLY facts explicitly present in the BUSINESS DATA section below.
2. NEVER invent: ratings, review counts, years in business, prices, opening hours, services, certifications, awards, guarantees, statistics, social profiles, or business history.
3. When data is missing, omit the claim rather than guessing or estimating.
4. NEVER convert an assumption into a factual statement (e.g. do not write "5+ Years" if yearsInBusiness is not in BUSINESS DATA).
5. Design quality must come from layout, typography, imagery, spacing, interaction, hierarchy, and visual polish — NOT fabricated business facts.
6. Real customer reviews must only come from the REAL CUSTOMER REVIEWS section. Never create fictional customer names or testimonials.
7. Never invent phone numbers, WhatsApp numbers, addresses, emails, map links, or social URLs.
8. The supplied REAL PHOTOS are the actual business photos. Use those exact URLs. Do NOT replace them with stock photos, AI images, or placeholder gradients. If a photo URL fails to load, omit it or use another supplied photo — do NOT substitute unrelated imagery.
9. Social links: include ONLY verified URLs explicitly present in BUSINESS DATA. Never infer social profile ownership from a similar name. Never output "#" as a placeholder for a social link. If a social profile is absent or uncertain, omit it entirely from header, footer, and all other sections.

### MISSING DATA HANDLING
When a requested website section depends on information not present in BUSINESS DATA:
1. Prefer omitting the unsupported fact entirely.
2. Never invent an answer merely to fill visual space.
3. Neutral design is always preferable to fabricated business information.
4. Contact/WhatsApp/call CTAs may be used when those contact details are verified in BUSINESS DATA.
5. The website must never imply that an unavailable fact is confirmed.

## CRITICAL REMINDER
The output must look like it was built by a ₹5,00,000+ agency. It must make the business owner's jaw drop. Use the real business data — real name, real reviews, real photos, real phone. When the owner sees this demo, they must feel: "This is exactly what my business needs."

OUTPUT: ${platformNote}`;
}

/**
 * Builds a specific extra page prompt (booking, menu, gallery, etc.) — pure code, no AI.
 */
function buildExtraPagePrompt(
  lead: RankedLead,
  platform: string,
  style: string,
  pageType: string,
  pageLabel: string,
): string {
  const platformNote = PLATFORM_OUTPUT[platform] ?? PLATFORM_OUTPUT.stitch;
  const styleIds = style.split("+").filter(Boolean);
  const designSystem = styleIds.map((id) => STYLE_SYSTEM[id] ?? "").filter(Boolean).join("\n\nADDITIONAL STYLE LAYER:\n");
  const photoCount = lead.photoUrls?.length ?? 0;

  const phone = cleanPhone(lead.phone);
  const waNumber = cleanWaNumber(lead.whatsapp ?? lead.phone);
  const waLink = `https://wa.me/${waNumber}?text=Hello%20${encodeURIComponent(lead.name)}`;
  const telLink = `tel:${phone.replace(/\s/g, "")}`;
  const realPhotos = lead.photoUrls?.length
    ? lead.photoUrls.slice(0, 4).map((u, i) => `Photo ${i + 1}: ${normalizeGooglePhotoUrl(u)}`).join("\n")
    : "";

  const pageInstructions: Record<string, string> = {
    booking:
      `Build a complete BOOKING / APPOINTMENT page.\n- Prominent booking form: Name, Phone, Service (dropdown using ONLY services from BUSINESS DATA — if none, use a free-text field), Preferred Date, Preferred Time, Message.\n- On submit: show WhatsApp link pre-filled with booking details linking to ${waLink}.\n- Above the form: ${lead.rating != null || (lead.reviewsCount ?? 0) > 0 ? `3 trust signals using their real ${lead.rating != null ? `${lead.rating.toFixed(1)}★ rating` : ""} ${(lead.reviewsCount ?? 0) > 0 ? `and ${lead.reviewsCount} Google reviews` : ""}` : "a short welcome message — do NOT invent ratings or reviews the business does not have"}.\n- Below the form: FAQ about the booking process (3 questions — answers must say 'Contact us for details' if not in BUSINESS DATA).\n- Sticky WhatsApp button always visible.`,
    schedule:
      `Build a CLASS SCHEDULE / TIMETABLE page.\n- Weekly schedule table (Mon-Sun) with time slots.\n- CRITICAL: Do NOT invent class names, trainer names, or specific schedules. Label all time slots as 'Session' with a note 'Contact us for the latest class schedule'. Use ONLY class/service names that are explicitly in BUSINESS DATA services.\n- Each slot: a generic time block, a 'Book This Slot' button linking to ${waLink}.\n- Filter buttons by day only.\n- Big CTA at top: 'WhatsApp us for the current schedule' linking to ${waLink}.`,
    menu:
      `Build a DIGITAL MENU page.\n- CRITICAL: Do NOT invent dish names, descriptions, or prices (Rs.). This is a real business — fabricated menu items damage credibility.\n- Use ONLY menu items or categories explicitly listed in BUSINESS DATA services. If none are listed: show category tabs (e.g. 'Food', 'Beverages', 'Specials') with placeholder cards that say 'Ask us about our [category]' and a WhatsApp CTA for each.\n- 'Order on WhatsApp' button links to ${waLink}.\n- QR code placeholder section at bottom linking to ${waLink}.\n- Search bar to filter categories.`,
    gallery:
      `Build a complete PHOTO GALLERY page.\n${photoCount > 0 ? `Use these real photos:\n${lead.photoUrls!.slice(0, 4).map((u, i) => `Photo ${i + 1}: ${normalizeGooglePhotoUrl(u)}`).join("\n")}` : "No real photos available — build a gallery with styled placeholder cards showing the business name and a 'Photo coming soon' message. Do NOT use random stock image URLs."}\n- Masonry grid layout (CSS columns: 3 on desktop, 2 on tablet, 1 on mobile).\n- Lightbox on click (pure JS, no library).\n- CTA at bottom: 'Book Your Session' linking to ${waLink}.`,
    team:
      `Build a TEAM / STAFF page.\n- CRITICAL: Do NOT invent staff names, bios, or years of experience. Use ONLY team members explicitly mentioned in BUSINESS DATA.\n- If no team data in BUSINESS DATA: show role placeholder cards (e.g. 'Head Trainer', 'Manager', 'Specialist') with initials avatar and the text 'Meet our team in person'. Each card has a WhatsApp CTA.\n- Hover: card lifts, WhatsApp contact button appears.\n- CTA at bottom to book a session via ${waLink}.`,
    pricing:
      `Build a PRICING / MEMBERSHIP PLANS page.\n- CRITICAL: Do NOT invent rupee amounts. Use ONLY prices explicitly stated in BUSINESS DATA. If no prices in BUSINESS DATA: show 3 tiers (Basic, Standard, Premium) with features listed from BUSINESS DATA services, but replace all price fields with a 'Contact for pricing' CTA button linking to ${waLink}.\n- Annual pricing toggle only if at least one price is in BUSINESS DATA.\n- Below plans: FAQ about membership (4 questions — answers must reference WhatsApp for anything not in BUSINESS DATA).`,
    admission:
      `Build a complete ADMISSION / ENROLLMENT FORM page.\n- Multi-step form (3 steps) with progress bar: Step 1 (personal details), Step 2 (program selection using ONLY programs from BUSINESS DATA services or a free-text field if none), Step 3 (confirmation).\n- Step 1: Name, DOB, Gender, Phone, Email, Address.\n- Step 2: Program dropdown, batch time, how they heard about us.\n- Step 3: Review + 'Submit via WhatsApp' button linking to ${waLink}.`,
    products:
      `Build a PRODUCT CATALOG page.\n- CRITICAL: Do NOT invent product names, descriptions, or prices. Use ONLY products/services explicitly in BUSINESS DATA.\n- If no product data in BUSINESS DATA: show category cards with 'Contact us for product details' and a WhatsApp CTA instead of inventing items.\n- Grid of product cards (3-4 per row desktop, 2 tablet, 1 mobile).\n- 'Enquire on WhatsApp' button linking to ${waLink} on each card.\n- Category filter bar and search input.`,
  };

  const specificInstructions = pageInstructions[pageType]
    ?? `Build a complete ${pageLabel} page that fits ${lead.name} professionally. Include relevant content, CTAs to WhatsApp (${waLink}), and mobile-responsive layout.`;

  return `You are a WORLD-CLASS web designer in 2026. Build a complete, self-contained ${pageLabel} page for ${lead.name}.

This is an ADDITIONAL PAGE for their website — it must match their main site brand.

## PLATFORM
${platformNote}

## DESIGN SYSTEM (match the main site)
${designSystem}

## BUSINESS INFO
- Name: ${lead.name}
- Category: ${lead.category}, ${lead.city?.split(",")[0]}
- Phone: ${phone} (tel: ${telLink})
- WhatsApp: ${waLink}
- Rating: ${lead.rating ?? "n/a"} (${lead.reviewsCount ?? 0} reviews)

## PAGE TO BUILD: ${pageLabel.toUpperCase()}
${specificInstructions}

## TECHNICAL REQUIREMENTS
- Self-contained: all CSS in <style>, all JS in <script>. No external files except AOS.
- Mobile-first: 375px, 768px, 1280px breakpoints.
- Smooth scroll, hover effects, micro-interactions.
- WCAG AA contrast, aria-labels, min 44px touch targets.
- AOS: <link rel="stylesheet" href="https://unpkg.com/aos@2.3.4/dist/aos.css"> and <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>, AOS.init({duration:600,easing:'ease-out-cubic',once:true}).
- Floating WhatsApp button (bottom-right, pulsing glow).
- Back link to homepage (href="index.html").

OUTPUT: ${platformNote}`;
}



export async function POST(req: Request) {
  const { lead, platform, style, pageType, pageLabel } = (await req.json()) as {
    lead: RankedLead;
    platform: string;
    style?: string;
    pageType?: string;   // provided when generating an extra page prompt
    pageLabel?: string;
  };
  if (!lead) return NextResponse.json({ error: "No lead provided." }, { status: 400 });

  // ── Extra page: on-demand, per-click, instant ─────────────────────────────
  if (pageType && pageLabel) {
    const prompt = buildExtraPagePrompt(lead, platform || "stitch", style || "professional", pageType, pageLabel);
    return NextResponse.json({ source: "code", prompt });
  }

  // ── Main landing page (Option A) ──────────────────────────────────────────
  // 1. Build the website prompt instantly in JavaScript — no AI, no tokens, never fails
  const websitePrompt = buildPrompt(lead, platform || "stitch", style || "ai-decides");

  // 2. Ask AI ONLY for the small creative parts (~500 tokens total)
  const { pitchPoints, extraPages } = await getCreativeInsights(lead);

  return NextResponse.json({
    source: "code",
    style: style || "professional",
    prompt: websitePrompt,
    pitchPoints,
    extraPages,
  });
}
