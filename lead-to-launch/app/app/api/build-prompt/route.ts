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
  stitch:       "Use Google Stitch (stitch.withgoogle.com). Output one complete self-contained HTML file with ALL CSS inline in a <style> tag and all JS inline in a <script> tag. No external files. No React. No build step.",
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
- Hero: full-viewport-height (100dvh). Real photo URL as background-image with dark-blue gradient overlay (linear-gradient(135deg, rgba(26,60,94,0.92) 0%, rgba(14,165,233,0.6) 100%)). White headline text, H1 font-size clamp(2.5rem,5vw,4.5rem), font-weight 800, line-height 1.1.
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
- Hero: 100vh, pure black background. Real photo with very dark overlay (opacity 0.75). Thin gold horizontal line above H1. H1: font-family Cormorant Garamond, font-weight 300, font-size clamp(3rem,5vw,5rem), letter-spacing:0.05em, color:--text. Gold gradient on the key phrase: background:linear-gradient(90deg,#C9A84C,#E8C870), clip text.
- Dividers: thin gold lines (1px, opacity 0.3) between sections.
- Cards: --card background, gold top-border (2px solid --gold), border-radius 0 (square). No rounded corners — luxury is precise.
- Buttons: outlined style = border 1px solid --gold, color --gold, background transparent. On hover: background fills with --gold, color #080808. Transition 300ms.
- Stats: gold numbers, small caps label below. Dividers between stat items.`,

  bold: `
DESIGN SYSTEM — BOLD HIGH-ENERGY (2026):
- Fonts: "Bebas Neue" for display headlines, "Manrope" (400,500,600,700,800) for body from Google Fonts.
- Colors: --bg: #FFFFFF; --dark: #0D0D0D; --primary: #FF3300; --secondary: #FFB800; --text: #0D0D0D; --muted: #555;
- HIGH CONTRAST. Bold. Graphic design energy.
- Hero: split screen. Left half: solid --dark background with giant H1 in Bebas Neue, font-size clamp(4rem,10vw,9rem), line-height:0.95, color:white. "CALL" word in --primary red. Right half: real business photo (object-fit:cover). On mobile: stacked.
- Accent elements: angled/diagonal section dividers (CSS clip-path: polygon) instead of straight horizontal. 
- Service cards: flat bold cards with thick colored left border, icon in a colored square badge, card border-radius:0. Each card has a different accent color.
- CTA button: background --primary red, all-caps text in Bebas Neue, wide letter-spacing, no border-radius (sharp corners). On hover: background --secondary yellow, color --dark.
- Stats: giant numbers in Bebas Neue on dark background, red underline accent.`,
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

  const realPhotos = lead.photoUrls?.length
    ? `\nREAL PHOTOS (use these as actual <img src="..."> — not stock, not placeholder):\n${lead.photoUrls.slice(0, 6).map((u, i) => `  Photo ${i + 1}: ${u}`).join("\n")}`
    : "";
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
1. FULL-VIEWPORT HERO: The hero section MUST be 100dvh (full screen height). The business photo MUST be used as a full-bleed background image with a CSS gradient overlay. The headline MUST be large (clamp at minimum 2.8rem on mobile, 4.5rem on desktop). This is non-negotiable.
2. REAL DESIGN SYSTEM: Use the complete design system below. Apply CSS custom properties (--variables) from the top. Every color, font, and spacing value must come from the system.
3. MICRO-INTERACTIONS: Every card, button, and image must have a hover state with transform and transition. No static elements.
4. ANIMATED STATS: Create a "trust numbers" section with big animated counters (JS IntersectionObserver + requestAnimationFrame countUp) showing: star rating, review count, years in business.
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
- Background: first real photo URL as CSS background-image with gradient overlay from the design system.
- Floating trust badge (glassmorphism): "★ ${lead.rating ?? "5.0"} · ${lead.reviewsCount ?? "100+"}  Reviews" — positioned absolute, animated fade-in.
- H1: Bold, large, gradient or white text: "Trusted ${lead.category} in ${lead.city?.split(",")[0]}"
- Sub-headline: short, compelling, max 12 words.
- TWO CTA buttons: WhatsApp primary, Call secondary. Both with hover animations.
- Scroll indicator (animated bouncing chevron or dot at bottom).

### 3. ANIMATED TRUST STATS STRIP
- Dark or accent background (not white).
- 3–4 stat items in a row: "${lead.rating ?? "5.0"}★ Rating" | "${lead.reviewsCount ?? "100+"}+ Reviews" | "${lead.yearsInBusiness ?? "5"}+ Years" | "100% Natural".
- Each number animates counting up when scrolled into view (JS countUp).
- Stats separated by vertical dividers or gold/accent lines.

### 4. SERVICES — BENTO GRID LAYOUT
${realServices || "- Use realistic services for this business category (3–6 services)"}
- CSS Grid: on desktop, mix 1-col and 2-col spans. First card spans 2 columns. Others are 1. This creates a bento layout.
- Each card: icon (SVG or emoji), service name as bold heading, 1 short description sentence, "Book Now →" link to ${waLink}.
- Cards use the glassmorphism/card style from the design system.
- Hover: lift + glow effect.

### 5. ABOUT / STORY (SPLIT SCREEN)
- Left side: full-height stacked photos (2nd and 3rd real photo URLs, overlapping with a slight rotation/offset for visual depth).
- Right side: "Our Story" label, H2, the about text, a "Speak with Us" button.
${realAbout}
- On mobile: photos stack above text.

### 6. CUSTOMER TESTIMONIALS (CARDS WITH GLASSMORPHISM)
${realReviews || "- Write 3 believable testimonials for this category"}
- Layout: 3-column grid on desktop, 1-column on mobile.
- Each card: giant quote mark (CSS content, styled in accent color), star rating (show ★ symbols), review text (italic), reviewer name bold.
- Cards: glassmorphism style from design system.
- Add subtle fade-up animation (AOS or CSS @keyframes).

### 7. FAQ ACCORDION
- 5 questions relevant to ${lead.category} in ${lead.city?.split(",")[0]}.
- Each item: question as bold clickable header, answer expands smoothly (CSS max-height transition or JS toggle).
- Arrow icon rotates 180° when open.
- Include question about: booking process, pricing, what to expect on first visit, location/parking, online consultation if applicable.

### 8. LOCATION + HOURS
- Two-column: Left = embedded Google Maps iframe using link: ${mapsLink}, height 350px, border-radius from design system.
- Right = Address card with icon, Hours list with icon.
${realHours || "- Show realistic hours for this business type"}
- "Get Directions" button linking to Google Maps.

### 9. FINAL CTA SECTION
- Accent/dark colored background (not white — use the primary or dark color from design system).
- Bold large closing headline: "Ready to ${lead.category.toLowerCase().includes("clinic") || lead.category.toLowerCase().includes("health") ? "heal naturally?" : "get started?"}"
- Sub-text: one compelling sentence referencing ${lead.city?.split(",")[0]}.
- Two buttons: WhatsApp + Call. Both large and prominent.
- Optional: subtle background pattern or noise texture.

### 10. FOOTER
- Dark background. 3–4 columns on desktop.
- Col 1: Business name + short tagline + social links: ${socialLinks || "WhatsApp, Facebook icons"}
- Col 2: Quick links (Home, Services, About, Contact)
- Col 3: Contact info — address with 📍 icon, phone with 📞 as click-to-call, WhatsApp link.
- Bottom bar: © 2026 ${lead.name}. All rights reserved. | Privacy Policy | Terms
- Social link to Facebook: ${lead.socialLinks?.find(s => s.platform === "facebook")?.url ?? "#"}

## BUSINESS DATA
- Name: ${lead.name}
- Category: ${lead.category}
- Address: ${lead.address}, ${lead.city}
- Rating: ${lead.rating ?? "n/a"} ⭐ (${lead.reviewsCount ?? 0} reviews)
- Phone: ${phone}
- WhatsApp link: ${waLink}
- Tel link: ${telLink}
- Google Maps: ${mapsLink}
- Facebook: ${lead.socialLinks?.find(s => s.platform === "facebook")?.url ?? "n/a"}
${realPhotos}${realServices}${realHours}${realAbout}${realReviews}${socialLinks}

## TECHNICAL REQUIREMENTS
- SEO: <title>${lead.name} – ${lead.category} in ${lead.city?.split(",")[0]}</title>, meta description (compelling, 160 chars), LocalBusiness JSON-LD schema with real data, canonical URL, H1 with city+category.
- PERFORMANCE: lazy-load all images below the fold (<img loading="lazy">), no heavy libraries except AOS (CDN, 14kb).
- ACCESSIBILITY: alt text on every image, aria-labels on all buttons/links, min 44px touch targets, WCAG AA contrast.
- ZERO BUGS: no mobile overflow, all links functional, no broken images.
- Use AOS library for scroll animations: <link rel="stylesheet" href="https://unpkg.com/aos@2.3.4/dist/aos.css"> and <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>, initialize with AOS.init({duration:600,easing:'ease-out-cubic',once:true}).

## CRITICAL REMINDER
The output must look like it was built by a ₹5,00,000+ agency. It must make the business owner's jaw drop. Use the real business data — real name, real reviews, real photos, real phone. When the owner sees this demo, they must feel: "This is exactly what my business needs."

OUTPUT: ${platformNote}

Return ONLY this JSON (no markdown fences, no explanation):
{
  "prompt": "the complete website prompt as a single string — include ALL section details, design tokens, CSS snippets, real business data, and the OUTPUT instruction at the end",
  "pitchPoints": ["3 short powerful sentences the developer can say to the owner referencing their real data — rating, review count, the specific gap, revenue potential"],
  "extraPages": [
    {
      "id": "unique_id_snake_case",
      "icon": "single emoji",
      "label": "Page Name (short, clear)",
      "desc": "One sentence explaining what this page does and why this business specifically needs it"
    }
  ]
}

For extraPages: think like a professional web agency. Based on THIS specific business (${lead.name}, category: ${lead.category}), decide which additional pages beyond the landing page this business truly needs. Be specific — a Panchakarma clinic needs different pages than a dental clinic. Suggest only what genuinely makes sense for this exact business type. Typical examples: booking page for clinics, digital menu + QR for restaurants, rooms & pricing for hotels, before/after gallery for salons, class schedule for gyms, product catalog for shops, admission form for schools. Only include pages that are actually relevant.`;
}

export async function POST(req: Request) {
  const { lead, platform, style } = (await req.json()) as { lead: RankedLead; platform: string; style?: string };
  if (!lead) return NextResponse.json({ error: "No lead provided." }, { status: 400 });

  const result = await runWithFallback<BuildPromptResult>(buildPrompt(lead, platform || "stitch", style || "professional"));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  const raw = result.data as any;
  return NextResponse.json({
    source: "gemini",
    style: style || "professional",
    prompt: raw.prompt ?? "",
    pitchPoints: Array.isArray(raw.pitchPoints) ? raw.pitchPoints : [],
    extraPages: Array.isArray(raw.extraPages) ? raw.extraPages : [],
  });
}
