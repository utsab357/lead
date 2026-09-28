/**
 * Builds a high-quality HTML generation prompt for a business lead.
 * Groq outputs a complete, single-file HTML page that Playwright screenshots.
 *
 * Design goal: match Google Stitch quality — beautiful, modern, responsive,
 * full-page layouts with proper sections visible at every breakpoint.
 */

import type { RankedLead } from "@/lib/types";

/** Maps category to a curated Unsplash hero image */
function getCategoryHero(category: string): string {
  const c = category.toLowerCase();
  if (/gym|fitness|yoga|dance|sport|martial|boxing|crossfit|workout/.test(c))
    return "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=85&fit=crop";
  if (/restaurant|biryani|dhaba|food|dining|eatery|north indian|south indian|chinese|mughlai/.test(c))
    return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=85&fit=crop";
  if (/cafe|coffee|tea|chai|bakery|pastry|dessert|brew/.test(c))
    return "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1600&q=85&fit=crop";
  if (/salon|hair|beauty|spa|makeup|grooming|barber|nails/.test(c))
    return "https://images.unsplash.com/photo-1560066984-138daaa1183f?w=1600&q=85&fit=crop";
  if (/clinic|doctor|medical|health|dental|dentist|pharmacy/.test(c))
    return "https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=1600&q=85&fit=crop";
  if (/school|coaching|tuition|academy|college|institute|education/.test(c))
    return "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=85&fit=crop";
  if (/hotel|lodge|resort|banquet|guest|hospitality/.test(c))
    return "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=85&fit=crop";
  if (/jewel|gold|diamond|silver/.test(c))
    return "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1600&q=85&fit=crop";
  if (/car|auto|garage|vehicle|bike|motor/.test(c))
    return "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1600&q=85&fit=crop";
  if (/real estate|property|builder|apartment/.test(c))
    return "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=85&fit=crop";
  return "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=85&fit=crop";
}

function cleanPhone(raw?: string): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) return `+91 ${d.slice(2)}`;
  if (d.length === 10) return `+91 ${d}`;
  return raw;
}

export function buildPreviewHtmlPrompt(lead: RankedLead): string {
  const hero = getCategoryHero(lead.category);
  const phone = cleanPhone(lead.phone);
  const waNum = (lead.whatsapp ?? lead.phone ?? "").replace(/\D/g, "");
  const waLink = waNum ? `https://wa.me/${waNum}?text=Hi!` : "#";
  const city = lead.city?.split(",")[0] ?? lead.city ?? "";

  const realReviews = (lead.reviews ?? [])
    .filter((r) => r.rating >= 4)
    .slice(0, 3)
    .map((r) => `"${r.text.slice(0, 140)}" — ${r.author.split(/\d/)[0].trim()} (${r.rating}★)`)
    .join("\n");

  const services = (lead.services ?? []).slice(0, 8).join(", ");
  const ratingLine = lead.rating != null
    ? `${lead.rating.toFixed(1)} Stars · ${lead.reviewsCount ?? 0} Google Reviews`
    : "";

  const photoSection = (lead.photoUrls ?? []).length > 0
    ? `REAL BUSINESS PHOTOS (use these for gallery/about — NOT as hero bg):\n${(lead.photoUrls ?? []).slice(0, 4).map((u, i) => `  Photo ${i + 1}: ${u}`).join("\n")}`
    : "NO REAL PHOTOS: Use styled placeholder cards with business name.";

  return `You are a WORLD-CLASS web designer in 2026. Write a complete, production-ready, single HTML file for a local business website preview.

This must look like it was built by a premium design agency — NOT a basic template. Match the quality of Google Stitch, Framer, or Webflow.

## BUSINESS INFO
- Name: ${lead.name}
- Category: ${lead.category}
- City: ${city}
${ratingLine ? `- Rating: ${ratingLine}` : ""}
${phone ? `- Phone: ${phone}` : ""}
${services ? `- Services: ${services}` : ""}
${realReviews ? `\n## REAL CUSTOMER REVIEWS (use verbatim)\n${realReviews}` : ""}

## ${photoSection}

## HERO BACKGROUND IMAGE (use ONLY this URL — do not use business photos in hero):
${hero}

## MANDATORY OUTPUT RULES
1. Output ONLY complete HTML. Start immediately with <!DOCTYPE html>. No markdown, no explanation.
2. All CSS in ONE <style> tag in <head>. All JS in ONE <script> tag at end of <body>.
3. Google Fonts: import via @import inside <style> — allowed.
4. AOS library: allowed via CDN in <head> for scroll animations.
5. RESPONSIVE: Must look beautiful at 390px (mobile), 768px (tablet), and 1280px+ (desktop).
6. The screenshot tool captures the ENTIRE page, so every section must render correctly.

## DESIGN SYSTEM — CHOOSE THE BEST FIT FOR THIS BUSINESS CATEGORY
Pick whichever color palette fits "${lead.category}" best:

OPTION A — WARM PREMIUM (cafes, restaurants, food):
  --bg: #FDF6EE; --text: #1C1209; --primary: #B45309; --accent: #F59E0B; --surface: #FFFBF4;
  Fonts: "Playfair Display" for headings, "Nunito" for body.
  Hero overlay: linear-gradient(160deg, rgba(28,18,9,0.78) 0%, rgba(180,83,9,0.55) 100%)

OPTION B — SLEEK DARK (gyms, tech, modern):
  --bg: #09090B; --text: #FAFAFA; --primary: #6366F1; --accent: #06B6D4; --surface: #18181B;
  Fonts: "Syne" for headings, "Inter" for body.
  Hero overlay: linear-gradient(135deg, rgba(9,9,11,0.9) 0%, rgba(99,102,241,0.4) 100%)

OPTION C — CLEAN PROFESSIONAL (clinics, education, services):
  --bg: #F8FAFC; --text: #0F172A; --primary: #1D4ED8; --accent: #0EA5E9; --surface: #FFFFFF;
  Fonts: "Plus Jakarta Sans" for headings & body.
  Hero overlay: linear-gradient(135deg, rgba(15,23,42,0.88) 0%, rgba(29,78,216,0.5) 100%)

OPTION D — DARK LUXURY (salons, jewellery, premium hotels):
  --bg: #060606; --text: #F5EDD7; --primary: #C9A84C; --accent: #E8C870; --surface: #0F0F0F;
  Fonts: "Cormorant Garamond" for headings, "Montserrat" for body.
  Hero overlay: linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 100%)

## REQUIRED CSS RULES (apply to ALL options)
\`\`\`css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: var(--body-font, sans-serif); background: var(--bg); color: var(--text); }
img { max-width: 100%; height: auto; display: block; }
section { width: 100%; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

/* MOBILE FIRST — base styles are for 390px, then scale up */
@media (min-width: 768px) { .container { padding: 0 40px; } }
@media (min-width: 1280px) { .container { padding: 0 60px; } }
\`\`\`

## REQUIRED SECTIONS (build ALL of them — this is a full multi-section website)

### 1. STICKY NAVBAR (height: 64px)
- Blurred semi-transparent background (backdrop-filter: blur(16px) + semi-opaque bg)
- Left: business name as bold wordmark
- Right (desktop): nav links (Home, Menu/Services, About, Contact) + CTA button
- Right (mobile): hamburger icon that toggles a fullscreen overlay menu (pure CSS or minimal JS)

### 2. HERO SECTION (min-height: 100vh)
- background-image: url('${hero}') with CSS background-size:cover, background-position:center
- Apply gradient overlay for readability (from chosen design option)
- Content centered vertically:
  - Tag line in small caps above H1 (e.g., "— Barasat, West Bengal —")
  - H1: Business name — large, bold, gradient text or white. Size: clamp(2.8rem, 6vw, 5.5rem)
  - Subtitle: one line description based on category
  ${ratingLine ? `- Trust badge: glassmorphism pill showing "${ratingLine}"` : ""}
  - Two CTA buttons: "📞 Call Now" (tel:${phone || "#"}) + "💬 WhatsApp" (${waLink})
  - Animated scroll indicator at bottom (bouncing arrow)

### 3. MARQUEE / TRUST STRIP
- Horizontally scrolling strip (CSS @keyframes marquee, no JS needed)
- Repeating items: ${ratingLine || lead.name} · Premium ${lead.category} · ${city} · Trusted Since · ${services ? services.split(",")[0] : "Quality Service"}
- Dark background, light text — sharp contrast

### 4. ABOUT / STORY SECTION
- Two columns on desktop, stacked on mobile
- Left: ${(lead.photoUrls ?? []).length > 0 ? `the first real business photo (${lead.photoUrls![0]}) in a styled frame with a floating accent badge` : "large stylized brand block with business name and category badge"}
- Right: "Our Story" label, heading, short description about this ${lead.category} in ${city}, list of 3-4 key features with check icons

### 5. SERVICES / MENU SECTION  
- Section title: "What We Offer" or "Our Menu" depending on category
- CSS Grid bento layout — first card spans 2 cols on desktop, rest 1 col
- ${services ? `Use EXACTLY these services: ${services}` : "Create 4 generic service cards appropriate for this category"}
- Each card: icon (emoji), service name, 1-line description, hover lift effect (transform + transition)

### 6. TESTIMONIALS (only if real reviews provided)
${realReviews ? `- 3 glassmorphism cards with the REAL reviews above
- Each: large open-quote "❝" in accent color, review text, star rating, reviewer name
- 3-column grid on desktop, 1 on mobile` : "- Skip this section if no real reviews. Do NOT fabricate testimonials."}

### 7. GALLERY (2-3 photos or placeholders)
- CSS Grid: 3 cols desktop, 2 tablet, 1 mobile
- ${(lead.photoUrls ?? []).length > 0 ? `Use photos: ${(lead.photoUrls ?? []).slice(0, 3).map((u, i) => `Photo ${i + 1}: ${u}`).join(", ")}` : "3 styled placeholder cards with business name and emoji"}
- Hover: scale(1.04) + brightness(1.1) with transition

### 8. CONTACT / LOCATION CTA SECTION
- Dark/accent background (full-width)
- Centered: "Visit Us" heading, address: "${lead.address || city}", phone
- Two buttons: Call + WhatsApp
- If phone provided: embed Google Maps iframe or show styled address card

### 9. FOOTER
- Dark background
- 3 columns desktop: Brand (name + tagline), Links (Home, Services, About, Contact), Contact Info
- Bottom bar: © 2026 ${lead.name}. All rights reserved.
- Floating WhatsApp button: position fixed, bottom 24px, right 24px, green circle with chat emoji, pulsing ring animation

## TECHNICAL REQUIREMENTS
- RESPONSIVE: Use CSS Grid and Flexbox. Every section must look correct at 390px, 768px, 1280px.
- SMOOTH ANIMATIONS: AOS library for scroll sections, CSS transitions on all interactive elements.
- NO BROKEN IMAGES: Never use placeholder.com. Only use the Unsplash URL or the provided business photos.
- PERFORMANCE: lazy load all images below the fold.
- ACCESSIBILITY: alt text on every img, aria-labels on buttons.

## OUTPUT
Output the complete HTML file starting with <!DOCTYPE html>. Nothing else. No explanation. No markdown fences.`;
}
