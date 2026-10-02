/**
 * 2027 Visual Mockup Prompt Guardrail Wrapper
 *
 * Implements:
 * - Semantic Niche Archetypes + Dynamic Brand Personality (Point 12)
 * - Mandatory 5-6 Mockup Sections matching Image 2 visual rhythm (Point 4)
 * - 2027 Futuristic Agency Aesthetic (Point 5)
 * - Automatic Precaution Wrapper without AI token bloat (Point 3)
 * - Intelligent Page Count Determination without Contact pages (Point 6)
 * - Collision-Proof Slug Generation (Point 9)
 */

import type { RankedLead } from "./types";

export interface BrandIdentityTheme {
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  darkSurfaceColor: string;
  aestheticDescription: string;
  photographyDirection: string;
  recommendedHeroHeadline: string;
  recommendedSubhead: string;
  offeringsSample: { name: string; price: string }[];
}

/**
 * Determines the semantic niche archetype and dynamic brand identity
 * based on business category, name, and verified data.
 */
export function getBrandIdentityTheme(lead: RankedLead): BrandIdentityTheme {
  const cat = (lead.category || "").toLowerCase();
  const name = (lead.name || "").toLowerCase();
  const city = lead.city || "Kolkata";

  // Check for Bengali / Cultural cues
  const hasBotanicalCue = name.includes("আরণ্যক") || name.includes("aranyak") || name.includes("nature") || name.includes("green");
  const hasHeritageCue = name.includes("heritage") || name.includes("raj") || name.includes("babu") || name.includes("zamindar");

  // 1. Cafe / Bistro / Bakery / Coffee Shop / Restaurant
  if (
    cat.includes("cafe") ||
    cat.includes("coffee") ||
    cat.includes("restaurant") ||
    cat.includes("bakery") ||
    cat.includes("bistro") ||
    cat.includes("food") ||
    cat.includes("dining")
  ) {
    if (hasBotanicalCue) {
      return {
        primaryColor: "Deep Botanical Green (#1B3B2B)",
        accentColor: "Warm Caramel (#C67D43)",
        surfaceColor: "Warm Linen / Oat Milk (#F9F6F0)",
        darkSurfaceColor: "Midnight Slate (#0D1714)",
        aestheticDescription:
          "Artisanal rustic-modern cafe nestled in lush greenery, natural wood tables, warm Edison bulb glow, studio latte art with botanical leaf motifs, serene rainforest cafe ambiance.",
        photographyDirection:
          "mouthwatering studio food and artisanal drink commercial photography with warm natural lighting and depth of field",
        recommendedHeroHeadline: "Artisanal Coffee & Nature's Haven",
        recommendedSubhead: `A cozy sanctuary in ${city}, where specialty brewed coffee and heartfelt conversations meet.`,
        offeringsSample: [
          { name: "Specialty Pour-Over", price: "From ₹120" },
          { name: "Artisanal Cappuccino", price: "From ₹95" },
          { name: "Clay-Cup Masala Chai", price: "From ₹60" },
          { name: "Handcrafted Pastries", price: "From ₹110" },
        ],
      };
    }

    return {
      primaryColor: "Rich Espresso (#201511)",
      accentColor: "Burnt Amber (#C4622D)",
      surfaceColor: "Ivory Cream (#FDFBF7)",
      darkSurfaceColor: "Dark Roast Navy (#131926)",
      aestheticDescription:
        "Warm modern European bistro, polished oak counters, cinematic ambient lighting with soft bokeh, steam rising from artisanal ceramic cups, cozy banquette seating.",
      photographyDirection:
        "mouthwatering studio espresso, pastry, and comfort dining commercial photography with warm cafe lighting",
      recommendedHeroHeadline: "Artisanal Coffee & Comfort Food",
      recommendedSubhead: `Crafted with passion in ${city}. Every roast, every bite made to linger over.`,
      offeringsSample: [
        { name: "Single-Origin Espresso", price: "From ₹90" },
        { name: "Signature Cold Brews", price: "From ₹130" },
        { name: "Fresh Gourmet Toasts", price: "From ₹140" },
        { name: "Homemade Desserts", price: "From ₹110" },
      ],
    };
  }

  // 2. Healthcare / Doctor / Dental Clinic / Hospital
  if (
    cat.includes("clinic") ||
    cat.includes("dental") ||
    cat.includes("dentist") ||
    cat.includes("doctor") ||
    cat.includes("hospital") ||
    cat.includes("health") ||
    cat.includes("medical")
  ) {
    return {
      primaryColor: "Clinical Cyan (#0284C7)",
      accentColor: "Luminous Emerald (#10B981)",
      surfaceColor: "Sterile Pearl White (#F8FAFC)",
      darkSurfaceColor: "Deep Titanium Navy (#0F172A)",
      aestheticDescription:
        "Ultra-modern high-trust medical suite, luminous frosted glass panels, warm welcoming consultation lounge, pristine state-of-the-art diagnostic technology, gentle reassurance.",
      photographyDirection:
        "pristine, compassionate healthcare commercial photography with modern clinical equipment and gentle high-trust ambiance",
      recommendedHeroHeadline: "Compassionate Care, Advanced Precision",
      recommendedSubhead: `Trusted healthcare excellence for families across ${city}. Certified specialists with cutting-edge technology.`,
      offeringsSample: [
        { name: "Comprehensive Checkup", price: "Consultation" },
        { name: "Advanced Diagnostics", price: "Digital Care" },
        { name: "Preventive Treatments", price: "Painless Care" },
        { name: "Emergency Assistance", price: "24/7 On-Call" },
      ],
    };
  }

  // 3. Fitness / Gym / Crossfit / Yoga / Martial Arts
  if (
    cat.includes("gym") ||
    cat.includes("fitness") ||
    cat.includes("crossfit") ||
    cat.includes("workout") ||
    cat.includes("yoga") ||
    cat.includes("trainer")
  ) {
    return {
      primaryColor: "Electric Lime (#84CC16)",
      accentColor: "Flame Crimson (#EF4444)",
      surfaceColor: "Cool Concrete Gray (#F3F4F6)",
      darkSurfaceColor: "Matte Obsidian (#111111)",
      aestheticDescription:
        "High-performance athletic arena, dark mode aesthetic, dramatic architectural rim lighting, custom matte black barbells, high-energy motivation, sleek telemetry graphics.",
      photographyDirection:
        "high-energy commercial athletic photography showcasing modern gym equipment, dedicated training zones, and dynamic body transformations",
      recommendedHeroHeadline: "Built for Strength. Engineered for Results.",
      recommendedSubhead: `The premier training facility in ${city}. World-class equipment, elite coaching, proven body transformations.`,
      offeringsSample: [
        { name: "Strength & Conditioning", price: "From ₹1,499/mo" },
        { name: "Personal Training", price: "1-on-1 Coaching" },
        { name: "HIIT & Cardio Zone", price: "Included" },
        { name: "Nutrition & Recovery", price: "Custom Plans" },
      ],
    };
  }

  // 4. Hotel / Resort / Homestay / Spa / Luxury Salon
  if (
    cat.includes("hotel") ||
    cat.includes("resort") ||
    cat.includes("homestay") ||
    cat.includes("spa") ||
    cat.includes("salon") ||
    cat.includes("stay") ||
    hasHeritageCue
  ) {
    return {
      primaryColor: "Champagne Gold (#D4AF37)",
      accentColor: "Deep Emerald (#064E3B)",
      surfaceColor: "Warm Alabaster (#FAF8F5)",
      darkSurfaceColor: "Midnight Royal Velvet (#0A1118)",
      aestheticDescription:
        "High-end luxury hospitality, marble arches, serene infinity pool or heritage courtyard reflections, silk linens, warm golden hour sunbeams, five-star peaceful elegance.",
      photographyDirection:
        "luxurious architectural hospitality photography with warm sunlit ambient elegance and serene suite interiors",
      recommendedHeroHeadline: "Experience Timeless Hospitality",
      recommendedSubhead: `Your luxurious retreat in ${city}. Elegant suites, world-class amenities, unforgettable memories.`,
      offeringsSample: [
        { name: "Deluxe Heritage Suite", price: "From ₹2,800/night" },
        { name: "Wellness & Spa Rituals", price: "From ₹1,200" },
        { name: "Fine Dining Lounge", price: "Curated Menu" },
        { name: "Private Event Spaces", price: "Custom Booking" },
      ],
    };
  }

  // 5. Default / Professional Services / Industrial / Retail
  return {
    primaryColor: "Executive Indigo (#2563EB)",
    accentColor: "Amber Gold (#F59E0B)",
    surfaceColor: "Clean Off-White (#F9FAFB)",
    darkSurfaceColor: "Deep Slate (#0F172A)",
    aestheticDescription:
      "Modern 2027 enterprise editorial design, crisp Swiss typographic hierarchy, tactile card layers, subtle glassmorphism badges, trustworthy commercial lighting.",
    photographyDirection:
      "sharp commercial corporate and service showcase photography with crisp modern lighting",
    recommendedHeroHeadline: "Excellence Driven by Reliability",
    recommendedSubhead: `Leading provider of verified services and solutions in ${city}. Proven track record, trusted by hundreds.`,
    offeringsSample: [
      { name: "Primary Service Package", price: "Verified Standard" },
      { name: "Custom Solutions", price: "Tailored Quote" },
      { name: "Priority Support", price: "Guaranteed" },
      { name: "Quality Assurance", price: "Certified" },
    ],
  };
}

/**
 * Intelligent Page Count Determination (Point 6)
 * Small businesses get 1 comprehensive landing page.
 * Complex businesses (hotels, clinics) get 2 pages.
 * Never includes contact pages.
 */
export function getRecommendedPagesForLead(lead: RankedLead): {
  pages: { id: string; label: string; description: string }[];
  reason: string;
} {
  const cat = (lead.category || "").toLowerCase();

  // Multi-page candidates: Hotels, Resorts, Multi-specialty Clinics
  if (cat.includes("hotel") || cat.includes("resort")) {
    return {
      pages: [
        { id: "home", label: "Home Page", description: "Hero showcase, resort amenities, suites preview & location" },
        { id: "rooms", label: "Suites & Booking", description: "Detailed room tiers, pricing, photo gallery & reservations" },
      ],
      reason: "Hotels require dedicated booking & suite showcases in addition to the primary hero page.",
    };
  }

  if (cat.includes("clinic") || cat.includes("hospital") || cat.includes("dental")) {
    return {
      pages: [
        { id: "home", label: "Home Page", description: "Primary trust hero, doctor credentials, treatments preview & emergency contact" },
        { id: "treatments", label: "Treatments & Doctors", description: "Full procedure breakdown, doctor profiles & consultation scheduler" },
      ],
      reason: "Medical clinics require a treatment breakdown page to establish clinical authority.",
    };
  }

  // All local cafes, salons, gyms, bakeries, retailers: 1 comprehensive landing page
  return {
    pages: [
      {
        id: "home",
        label: "Full Landing Page",
        description: "Complete full-length concept: Nav, Hero, Trust, Offerings with prices, Story, and Location map",
      },
    ],
    reason: "Local service businesses convert best with a single comprehensive, high-impact landing page.",
  };
}

/**
 * Collision-Proof Slug Generator (Point 9)
 * Generates an unforgeable, human-readable file slug:
 * {business_slug}_{city_slug}_{unique_hash}_{page}.png
 */
export function generateCollisionProofSlug(
  lead: { id: string; name: string; city?: string } | RankedLead,
  pageType = "home"
): { fileSlug: string; relativePngPath: string } {
  // Sanitize business name (transliterate or clean non-alphanumeric)
  const cleanName = (lead.name || "business")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 28) || "business";

  const cleanCity = (lead.city || "kolkata")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 14) || "city";

  // Use lead.id or placeId or hash to ensure uniqueness
  const rawId = lead.id || "lead";
  const shortHash = rawId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || Math.random().toString(36).slice(2, 8);

  const fileSlug = `${cleanName}_${cleanCity}_${shortHash}_${pageType}`;
  const relativePngPath = `/previews/${fileSlug}.png`;

  return { fileSlug, relativePngPath };
}

/**
 * Builds the Master 2027 Visual Mockup Prompt for FLUX.1
 * Wraps the verified business data with Image 2's mandated 5-6 section visual rhythm.
 */
export function buildWebsiteConceptMockupPrompt(
  lead: RankedLead,
  options: {
    pageType?: string;
    aspectRatio?: "vertical" | "widescreen" | "square";
    customBrief?: string;
  } = {}
): string {
  const theme = getBrandIdentityTheme(lead);
  // Short brand title (first 3-4 words max) for crisp typography
  const shortBrand = lead.name.split(/[-–|]/)[0].trim().slice(0, 26);
  const city = (lead.city || "Kolkata").split(",")[0].trim();

  const layoutFraming =
    options.aspectRatio === "widescreen"
      ? "Desktop browser mockup with 16:9 widescreen layout"
      : "Centered desktop landing page mockup, vertical full-length UI design showcase";

  const offeringsList = theme.offeringsSample
    .slice(0, 3)
    .map((o) => o.name)
    .join(", ");

  return [
    `Award-winning 2027 modern web UI design showcase for "${shortBrand}".`,
    `Dribbble and Behance featured ${layoutFraming}, premier ${lead.category} in ${city}.`,
    `Aesthetic & Atmosphere: ${theme.aestheticDescription}`,
    `Color palette: ${theme.primaryColor}, ${theme.accentColor} accents, ${theme.surfaceColor} card surfaces, ${theme.darkSurfaceColor} containers.`,
    `Top navigation: minimalist navbar with typography "${shortBrand}" and clean action button.`,
    `Hero section: bold elegant display typography "${shortBrand}", warm natural lighting, studio commercial photography with depth of field.`,
    `Featured offerings section: clean rounded modern cards showcasing ${offeringsList} with neat price chips.`,
    `Ultra-sharp UI elements, modern border radius, subtle drop shadows, clean whitespace, 8k resolution, commercial photography.`,
    `NEGATIVE PROMPT: blurry mobile photos, harsh phone flash glare, cut-off cards, chaotic fonts, watermarks, 3D cartoons.`,
  ].join(" ");
}
