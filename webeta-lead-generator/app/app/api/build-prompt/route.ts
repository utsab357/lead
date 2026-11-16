import { NextResponse } from "next/server";
import { runGeminiJSON } from "@/lib/gemini";
import type { RankedLead, BuildPromptResult, ExtraPage, BusinessStrategy } from "@/lib/types";
import { buildWebsiteSpec, specToCompilerMarkdown } from "@/lib/websiteSpec";
import { extractBusinessStrategyWithGroq } from "@/lib/businessStrategy";

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
  return url
    .replace(/=w\d+-h\d+[^"]*/, "=w1600-h1000-k-no")
    .replace(/=s\d+[^"]*/, "=s1600");
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

  if (/cafe|coffee|tea|chai|bakery|pastry|dessert|sweet|mithai|snack|brew|restro/.test(c))
    return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1920&q=85";

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

const COMPILER_OUTPUT_SPEC = `Output ONE complete, self-contained HTML5 file.
- Framework/Styling: Tailwind CSS via CDN (<script src="https://cdn.tailwindcss.com"></script>).
- Theme Configuration: You MUST include the exact <script>tailwind.config = { ... }</script> block in <head> immediately after the CDN script as specified in the DESIGN SYSTEM.
- Fallback CSS: In the <style> block in <head>, include the exact fallback CSS rules provided in the DESIGN SYSTEM so colors NEVER fail even if Tailwind CDN takes time to initialize.
- STRICT CONTRAST RULES:
  * On light cream/white backgrounds, ALL text MUST be dark (#2A1D15 or #0F172A). NEVER use text-white on cream!
  * Sections with white text (Hero, Trust Bar, Location card, Footer) MUST have explicit dark backgrounds (#2A1D15, #1E2B20, or dark overlays).
- Navigation: Use a centered Floating Glass Pill Header (bg-white/90 backdrop-blur-md rounded-full px-6 py-2.5 shadow-sm border border-[#F0E0D0] flex items-center justify-between). NO mobile hamburger overlays or uncollapsed checkbox menus.
- Static Numbers: Write the exact verified numbers directly in the HTML (e.g. 4.7★ and 152+). DO NOT render "0" with countUp JavaScript that fails in screenshots.
- Output format: Output ONLY the complete valid HTML file starting immediately with <!DOCTYPE html>. No markdown fences, no explanations.`;

// 2026-level design system per style
const STYLE_SYSTEM: Record<string, string> = {
  professional: `
DESIGN SYSTEM — PROFESSIONAL TRUST (2026):
- Fonts: Import from Google Fonts: "Plus Jakarta Sans" (weights 400,500,600,700,800) for body, "Instrument Serif" or "Playfair Display" for display headings.
- Colors:
  * Canvas/Body: #F8FAFC
  * Surface/Cards: #FFFFFF
  * Primary Accent: #1E3A8A (deep navy blue for buttons and accents)
  * Secondary Accent: #2563EB (cobalt blue)
  * Dark Accent: #0F172A (slate black for footer and dark containers)
  * Main Text: #0F172A (dark slate for crisp legibility)
  * Muted Text: #64748B
  * Border: #E2E8F0
- Tailwind Configuration Script (REQUIRED IN <head>):
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#1E3A8A',
            secondary: '#2563EB',
            dark: '#0F172A',
            surface: '#FFFFFF',
            muted: '#64748B',
            border: '#E2E8F0',
          }
        }
      }
    };
  </script>
- Fallback CSS in <style>:
  body { background-color: #F8FAFC; color: #0F172A; font-family: 'Plus Jakarta Sans', sans-serif; }
  h1, h2, h3 { font-family: 'Playfair Display', serif; }
  .bg-primary { background-color: #1E3A8A !important; }
  .text-primary { color: #1E3A8A !important; }
  .bg-dark { background-color: #0F172A !important; }
  .text-dark { color: #0F172A !important; }
  .bg-surface { background-color: #FFFFFF !important; }
  .border-border { border-color: #E2E8F0 !important; }
- Hero: full-viewport-height (100dvh). Use the HERO STOCK PHOTO URL with dark-blue gradient overlay (linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,58,138,0.7) 100%)). White headline text, font-size clamp(2.5rem,5vw,4.5rem).`,

  modern: `
DESIGN SYSTEM — SLEEK MODERN DARK (2026):
- Fonts: Import "Inter" (weights 400,500,600,700,900) and "Syne" (700,800) from Google Fonts. Headlines use Syne, body uses Inter.
- Colors:
  * Canvas/Body: #0A0A0F (deep cosmic black)
  * Surface/Cards: #14141E (frosted obsidian)
  * Primary Accent: #6C63FF (electric indigo)
  * Secondary Accent: #00D4AA (neon mint)
  * Dark Accent: #060608
  * Main Text: #F0F0F5 (crisp white)
  * Muted Text: #8B8B9E
  * Border: rgba(255,255,255,0.08)
- Tailwind Configuration Script (REQUIRED IN <head>):
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#6C63FF',
            secondary: '#00D4AA',
            dark: '#0A0A0F',
            surface: '#14141E',
            muted: '#8B8B9E',
            border: 'rgba(255,255,255,0.08)',
          }
        }
      }
    };
  </script>
- Fallback CSS in <style>:
  body { background-color: #0A0A0F; color: #F0F0F5; font-family: 'Inter', sans-serif; }
  h1, h2, h3 { font-family: 'Syne', sans-serif; }
  .bg-primary { background-color: #6C63FF !important; }
  .text-primary { color: #6C63FF !important; }
  .bg-dark { background-color: #0A0A0F !important; }
  .text-dark { color: #F0F0F5 !important; }
  .bg-surface { background-color: #14141E !important; }`,

  animated: `
DESIGN SYSTEM — ANIMATED KINETIC (2026):
- Fonts: "Plus Jakarta Sans" (weights 400,600,700,800) for headlines, "Inter" for body from Google Fonts.
- Colors:
  * Canvas/Body: #0B0F19
  * Surface/Cards: #111827
  * Primary Accent: #3B82F6
  * Secondary Accent: #10B981
  * Dark Accent: #080B12
  * Main Text: #F9FAFB
  * Muted Text: #9CA3AF
- Tailwind Configuration Script (REQUIRED IN <head>):
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#3B82F6',
            secondary: '#10B981',
            dark: '#0B0F19',
            surface: '#111827',
            muted: '#9CA3AF',
          }
        }
      }
    };
  </script>
- KINETIC ENERGY: Pure CSS keyframe animations (@keyframes fadeInUp, @keyframes float, @keyframes pulseGlow).`,

  warm: `
DESIGN SYSTEM — WARM COZY CAFE & DINING (2026):
- Fonts: Import from Google Fonts: "Playfair Display" (weights 600,700,900) or "Lora" (weights 500,600,700) for headings, "Plus Jakarta Sans" (weights 400,500,600,700) for body.
- Colors:
  * Canvas/Body: #FDF8F3 (warm artisanal cream)
  * Surface/Cards: #FFFBF7 (soft warm ivory)
  * Primary Accent: #C4622D (terracotta orange for primary buttons & highlights)
  * Secondary Accent: #E8A87C (soft peach/terracotta)
  * Dark Accent: #2A1D15 (deep roasted espresso/chocolate for Trust Bar, Location card, and Footer)
  * Main Text: #2A1D15 (rich dark brown for all headings and text on light surfaces — NEVER use white text on cream!)
  * Muted Text: #7A6252
  * Border: #F0E0D0
- CONTRAST & LEGIBILITY RULES:
  * Every section with a light cream background (#FDF8F3 / #FFFBF7) MUST have dark brown text (#2A1D15).
  * White text is STRICTLY RESERVED for explicit dark containers (Hero with dark overlay, Trust Bar bg-[#2A1D15], Location container bg-[#1D2E24], Footer bg-[#201610]).
  * Under NO circumstance use text-white or white text on cream!
- Tailwind Configuration Script (REQUIRED IN <head>):
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#C4622D',
            secondary: '#E8A87C',
            dark: '#2A1D15',
            surface: '#FFFBF7',
            cream: '#FDF8F3',
            muted: '#7A6252',
            border: '#F0E0D0',
          }
        }
      }
    };
  </script>
- Fallback CSS in <style>:
  body { background-color: #FDF8F3; color: #2A1D15; font-family: 'Plus Jakarta Sans', sans-serif; }
  h1, h2, h3, .font-serif { font-family: 'Playfair Display', 'Lora', serif; }
  .bg-primary { background-color: #C4622D !important; }
  .text-primary { color: #C4622D !important; }
  .bg-secondary { background-color: #E8A87C !important; }
  .text-secondary { color: #E8A87C !important; }
  .bg-dark { background-color: #2A1D15 !important; }
  .text-dark { color: #2A1D15 !important; }
  .bg-surface { background-color: #FFFBF7 !important; }
  .border-border { border-color: #F0E0D0 !important; }`,

  luxury: `
DESIGN SYSTEM — DARK LUXURY PREMIUM (2026):
- Fonts: "Cormorant Garamond" (weights 300,400,600,700) for headings, "Plus Jakarta Sans" or "Montserrat" for body from Google Fonts.
- Colors:
  * Canvas/Body: #080808 (pure onyx black)
  * Surface/Cards: #121214 (deep charcoal)
  * Primary Accent: #C9A84C (refined metallic gold)
  * Secondary Accent: #E8C870 (champagne gold)
  * Dark Accent: #050505
  * Main Text: #F5F0E8 (warm ivory white on dark surfaces)
  * Muted Text: #948A78
  * Border: rgba(201,168,76,0.2)
- Tailwind Configuration Script (REQUIRED IN <head>):
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#C9A84C',
            secondary: '#E8C870',
            dark: '#080808',
            surface: '#121214',
            muted: '#948A78',
            border: 'rgba(201,168,76,0.2)',
          }
        }
      }
    };
  </script>
- Fallback CSS in <style>:
  body { background-color: #080808; color: #F5F0E8; font-family: 'Plus Jakarta Sans', sans-serif; }
  h1, h2, h3, .font-serif { font-family: 'Cormorant Garamond', serif; }
  .bg-primary { background-color: #C9A84C !important; }
  .text-primary { color: #C9A84C !important; }
  .bg-dark { background-color: #080808 !important; }
  .text-dark { color: #F5F0E8 !important; }
  .bg-surface { background-color: #121214 !important; }`,

  bold: `
DESIGN SYSTEM — BOLD HIGH-ENERGY (2026):
- Fonts: "Bebas Neue" for giant display headlines, "Manrope" (weights 500,600,700,800) for body from Google Fonts.
- Colors:
  * Canvas/Body: #FFFFFF (stark white)
  * Surface/Cards: #F5F5F7 (light gray)
  * Primary Accent: #FF3300 (fire red)
  * Secondary Accent: #FFB800 (cyber yellow)
  * Dark Accent: #0D0D0D (pure solid black for headers, dark cards, footer)
  * Main Text: #0D0D0D (bold black)
  * Muted Text: #555555
  * Border: #E5E5E5
- Tailwind Configuration Script (REQUIRED IN <head>):
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#FF3300',
            secondary: '#FFB800',
            dark: '#0D0D0D',
            surface: '#F5F5F7',
            muted: '#555555',
            border: '#E5E5E5',
          }
        }
      }
    };
  </script>
- Fallback CSS in <style>:
  body { background-color: #FFFFFF; color: #0D0D0D; font-family: 'Manrope', sans-serif; }
  h1, h2, h3 { font-family: 'Bebas Neue', sans-serif; }
  .bg-primary { background-color: #FF3300 !important; }
  .text-primary { color: #FF3300 !important; }
  .bg-dark { background-color: #0D0D0D !important; }
  .text-dark { color: #FFFFFF !important; }
  .bg-surface { background-color: #F5F5F7 !important; }`,
};

/**
 * Intelligently resolves the optimal design system if "ai-decides" is selected,
 * or applies the user's chosen style.
 */
function resolveStyle(category: string, requestedStyle: string = "ai-decides"): { styleKey: string; styleName: string; system: string } {
  let key = requestedStyle;
  if (!key || key === "ai-decides") {
    const c = category.toLowerCase();
    if (/salon|beauty|hair|spa|massage|wellness|ayurveda|jewel|gold|diamond|hotel|resort|boutique/.test(c)) {
      key = "luxury";
    } else if (/cafe|coffee|tea|restaurant|dining|food|bakery|pastry|sweet|kitchen|dhaba|bar/.test(c)) {
      key = "warm";
    } else if (/gym|fitness|crossfit|workout|martial|mma|boxing|sport/.test(c)) {
      key = "bold";
    } else if (/tech|software|it|digital|startup|agency|co-working|media/.test(c)) {
      key = "modern";
    } else if (/dance|event|club|entertainment/.test(c)) {
      key = "animated";
    } else {
      key = "professional";
    }
  }

  const keys = key.split("+").filter(Boolean);
  const system = keys.map((k) => STYLE_SYSTEM[k] ?? STYLE_SYSTEM.professional).join("\n\nADDITIONAL STYLE LAYER:\n");
  const names: Record<string, string> = {
    luxury: "Dark Luxury Premium",
    warm: "Warm Earthy Premium",
    bold: "Bold High-Energy",
    modern: "Sleek Modern Dark",
    animated: "Animated Kinetic",
    professional: "Professional Trust",
  };
  const styleName = keys.map((k) => names[k] || k).join(" + ");
  return { styleKey: key, styleName, system };
}

function buildPrompt(
  lead: RankedLead,
  style: string = "ai-decides",
  businessStrategy?: BusinessStrategy
): string {
  const spec = buildWebsiteSpec(lead, style, businessStrategy);
  return specToCompilerMarkdown(spec);
}

/**
 * Builds a specific extra page prompt (booking, menu, gallery, etc.) — pure code, no AI.
 */
function buildExtraPagePrompt(
  lead: RankedLead,
  style: string = "professional",
  pageType: string,
  pageLabel: string,
): string {
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
- Self-contained: all CSS in <style>, all JS in <script>.
- Mobile-first: 375px, 768px, 1280px breakpoints.
- Smooth scroll, hover effects, micro-interactions.
- WCAG AA contrast, aria-labels, min 44px touch targets.
- Pure CSS keyframe animations only (@keyframes fadeInUp, @keyframes float). No external JavaScript animation libraries.
- Floating WhatsApp button (bottom-right, pulsing glow).
- Back link to homepage (href="index.html").

OUTPUT SPECIFICATION:
${COMPILER_OUTPUT_SPEC}`;
}



export async function POST(req: Request) {
  try {
    const { lead, style, pageType, pageLabel } = (await req.json()) as {
      lead: RankedLead;
      platform?: string;
      style?: string;
      pageType?: string;   // provided when generating an extra page prompt
      pageLabel?: string;
    };
    if (!lead) return NextResponse.json({ error: "No lead provided." }, { status: 400 });

    // ── Extra page: on-demand, per-click, instant ─────────────────────────────
    if (pageType && pageLabel) {
      const prompt = buildExtraPagePrompt(lead, style || "professional", pageType, pageLabel);
      return NextResponse.json({ source: "code", prompt });
    }

    // ── Main landing page (Option A) ──────────────────────────────────────────
    // 1. Extract business strategy with Groq (or deterministic fallback)
    let businessStrategy;
    try {
      businessStrategy = await extractBusinessStrategyWithGroq(lead);
    } catch {
      const { buildDeterministicBusinessStrategy } = await import("@/lib/businessStrategy");
      businessStrategy = buildDeterministicBusinessStrategy(lead);
    }

    // 2. Build the website prompt instantly in JavaScript using the validated strategy
    let websitePrompt = "";
    try {
      websitePrompt = buildPrompt(lead, style || "ai-decides", businessStrategy);
    } catch (specErr) {
      console.warn("Failed to build full spec prompt, using base prompt:", specErr);
      websitePrompt = `Build a high-converting modern 2026 website for ${lead.name} (${lead.category || "Local Business"} in ${lead.city?.split(",")[0] || "India"}). Focus on WhatsApp conversions and trust.`;
    }

    // 3. Ask AI ONLY for the small creative parts (~500 tokens total)
    let pitchPoints: string[] = [];
    let extraPages: ExtraPage[] = [];
    try {
      const insights = await getCreativeInsights(lead);
      pitchPoints = insights.pitchPoints;
      extraPages = insights.extraPages;
    } catch {
      pitchPoints = [
        `${lead.name} has strong local demand but no modern website — competitors are capturing their search traffic.`,
        `A dedicated high-speed mobile website converts online visitors into direct paying customers on WhatsApp.`,
        `A custom digital presence builds instant credibility and captures 24/7 enquiries in ${lead.city?.split(",")[0] || "their local area"}.`,
      ];
    }

    return NextResponse.json({
      source: "code",
      style: style || "professional",
      prompt: websitePrompt,
      pitchPoints,
      extraPages,
      strategy: businessStrategy,
    });
  } catch (e) {
    console.error("Critical error in /api/build-prompt:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Generation error" },
      { status: 500 }
    );
  }
}
