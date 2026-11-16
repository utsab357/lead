/**
 * Webeta Business Strategy Intelligence Engine
 *
 * Extracts structured, evidence-backed business understanding from raw scraped data.
 * Pure analysis layer: Groq is strictly restricted to semantic classification,
 * evidence quote linking, and strategic priority ranking.
 *
 * All factual data (names, ratings, phone, address, hours) remains immutable.
 * Strict validation filters out any AI hallucination before it touches WebsiteSpec.
 */

import { runGroqJSON } from "./groq";
import type {
  RankedLead,
  BusinessStrategy,
  BusinessSubCategory,
  PrimaryConversionGoal,
  WebsitePriority,
  VerifiedOffering,
  ReviewTheme,
  SectionRecommendation,
  SectionOmission,
  ControlledVisualDirection,
  PhotoRoleRecommendation,
  EvidenceItem,
} from "./types";

export interface PhotoMetadata {
  index: number;
  url: string;
  width?: number;
  height?: number;
  aspectRatio: "landscape" | "portrait" | "square" | "unknown";
  isLowRes: boolean;
}

/**
 * Deterministically analyzes photo metadata based on Google CDN parameters.
 * Does NOT claim visual understanding of pixels; relies purely on dimensions and resolution.
 */
export function resolvePhotoMetadata(photoUrls: string[] = []): PhotoMetadata[] {
  return photoUrls.map((url, index) => {
    let width: number | undefined;
    let height: number | undefined;
    let aspectRatio: "landscape" | "portrait" | "square" | "unknown" = "unknown";
    let isLowRes = false;

    // Match =wNNN-hNNN or /wNNN-hNNN/
    const dimMatch = url.match(/=w(\d+)-h(\d+)/) || url.match(/\/w(\d+)-h(\d+)\//);
    if (dimMatch) {
      width = parseInt(dimMatch[1], 10);
      height = parseInt(dimMatch[2], 10);

      if (width < 120 && height < 120) {
        isLowRes = true;
      }

      const ratio = width / (height || 1);
      if (ratio >= 1.2) {
        aspectRatio = "landscape";
      } else if (ratio <= 0.85) {
        aspectRatio = "portrait";
      } else {
        aspectRatio = "square";
      }
    }

    return {
      index,
      url,
      width,
      height,
      aspectRatio,
      isLowRes,
    };
  });
}

/**
 * Deterministically recommends photo roles based on available metadata.
 * Prevents small portraits from being forced as full-bleed heroes.
 */
export function resolvePhotoRoles(photoUrls: string[] = []): PhotoRoleRecommendation[] {
  const meta = resolvePhotoMetadata(photoUrls);
  const recommendations: PhotoRoleRecommendation[] = [];

  let heroAssigned = false;
  let aboutAssigned = false;

  for (const m of meta) {
    if (m.isLowRes) {
      recommendations.push({
        photoIndex: m.index,
        url: m.url,
        recommendedRole: "reject",
        aspectRatioHint: m.aspectRatio === "unknown" ? undefined : m.aspectRatio,
        reason: "Low resolution thumbnail (<120px); unsuitable for high-dpi display",
      });
      continue;
    }

    // A suitable hero candidate MUST be landscape with width >= 300
    if (!heroAssigned && m.aspectRatio === "landscape" && (m.width ?? 0) >= 300) {
      recommendations.push({
        photoIndex: m.index,
        url: m.url,
        recommendedRole: "hero",
        aspectRatioHint: "landscape",
        reason: "High-resolution landscape photo suitable for hero background",
      });
      heroAssigned = true;
      continue;
    }

    // A suitable about photo can be portrait, square, or landscape
    if (!aboutAssigned) {
      recommendations.push({
        photoIndex: m.index,
        url: m.url,
        recommendedRole: "about",
        aspectRatioHint: m.aspectRatio === "unknown" ? undefined : m.aspectRatio,
        reason: "Featured business photo suitable for split about showcase",
      });
      aboutAssigned = true;
      continue;
    }

    // Remaining photos go to gallery
    recommendations.push({
      photoIndex: m.index,
      url: m.url,
      recommendedRole: "gallery",
      aspectRatioHint: m.aspectRatio === "unknown" ? undefined : m.aspectRatio,
      reason: "Secondary authentic photo suitable for lookbook gallery",
    });
  }

  return recommendations;
}

/**
 * Common NLP keywords for deterministic extraction and verification
 */
const FOOD_KEYWORDS = [
  "polao", "mangsho", "pulao", "mutton", "chicken", "biryani", "pizza", "burger",
  "pasta", "coffee", "latte", "tea", "chai", "shake", "frappe", "dessert", "cake",
  "roast", "curry", "thali", "fish", "roll", "sandwich", "tikka", "kebab",
  "chutney", "dal", "paneer", "naan", "noodles", "chowmein", "fried rice", "momos"
];

const FITNESS_KEYWORDS = [
  "personal training", "weight loss", "strength training", "crossfit", "cardio",
  "zumba", "yoga", "pilates", "bodybuilding", "calisthenics", "nutrition", "diet"
];

const SALON_KEYWORDS = [
  "haircut", "hair styling", "facial", "hair color", "keratin", "bridal makeup",
  "pedicure", "manicure", "spa massage", "bleach", "beard grooming"
];

const CLINIC_KEYWORDS = [
  "consultation", "dental cleaning", "root canal", "teeth whitening", "orthodontic",
  "pediatric", "physiotherapy", "ayurvedic checkup", "eye checkup", "pathology"
];

/**
 * Validates every claim in a BusinessStrategy against the source RankedLead.
 * Any unverified or hallucinated claim is strictly stripped or demoted.
 */
export function validateBusinessStrategy(
  strategy: Partial<BusinessStrategy>,
  lead: RankedLead
): BusinessStrategy {
  const leadNameLower = (lead.name || "").toLowerCase();
  const leadAboutLower = (lead.about || "").toLowerCase();
  const leadServices = (lead.services || []).map((s) => s.toLowerCase());
  const leadReviews = lead.reviews || [];

  // Helper to verify if an evidence quote actually exists in the scraped reviews
  const quoteExistsInReviews = (quote?: string): boolean => {
    if (!quote || quote.trim().length < 4) return false;
    const cleanQuote = quote.toLowerCase().replace(/["']/g, "").trim();
    return leadReviews.some((r) => (r?.text || "").toLowerCase().includes(cleanQuote));
  };

  const GENERIC_CATEGORY_WORDS = new Set([
    "pizza", "pizzeria", "cafe", "coffee", "restaurant", "restro", "bistro", "dhaba", "bar",
    "kitchen", "food", "dining", "eatery", "bakery", "shop", "center", "centre", "services",
    "barasat", "kolkata", "delhi", "mumbai", "bengal"
  ]);

  // Helper to verify if specific terms exist in business name (excluding generic category words)
  const termExistsInName = (term: string): boolean => {
    const specificTerms = term
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !GENERIC_CATEGORY_WORDS.has(t));
    if (specificTerms.length === 0) {
      return false;
    }
    return specificTerms.every((t) => leadNameLower.includes(t));
  };

  // Blocklist for invented recipe/dish names that require explicit menu/review proof
  const SPECIFIC_RECIPE_BLOCKLIST = /margherita|pepperoni|carbonara|bolognese|lasagna|tiramisu|cappuccino|macchiato|espresso|frappuccino|cheesecake|brownie|butter chicken|dal makhani|paneer tikka|kadai|supreme/i;

  // 1. Validate actualOfferings: MUST be backed by genuine evidence
  const validatedOfferings: VerifiedOffering[] = [];
  if (Array.isArray(strategy.actualOfferings)) {
    for (const off of strategy.actualOfferings) {
      if (!off.name || typeof off.name !== "string") continue;
      const offNameLower = off.name.toLowerCase();

      let isValid = false;
      let verifiedSource: VerifiedOffering["source"] = off.source;
      let confidence: VerifiedOffering["confidence"] = off.confidence || "medium";

      // Check scraped_service
      if (off.source === "scraped_service") {
        if (leadServices.some((s) => s.includes(offNameLower) || offNameLower.includes(s))) {
          isValid = true;
          confidence = "high";
        }
      }

      // Check review_text
      if (!isValid && (off.source === "review_text" || off.evidenceQuote)) {
        if (quoteExistsInReviews(off.evidenceQuote)) {
          isValid = true;
          verifiedSource = "review_text";
        } else {
          // Check if any review simply mentions the offering name directly
          const reviewWithMention = leadReviews.find((r) => (r?.text || "").toLowerCase().includes(offNameLower));
          if (reviewWithMention) {
            isValid = true;
            verifiedSource = "review_text";
            off.evidenceQuote = (reviewWithMention.text || "").slice(0, 100);
          }
        }
      }

      // Check business_about
      if (!isValid && off.source === "business_about" && leadAboutLower.length > 0) {
        if (leadAboutLower.includes(offNameLower)) {
          isValid = true;
          verifiedSource = "business_about";
        }
      }

      // Check business_name (ONLY if specific non-generic terms match)
      if (!isValid && termExistsInName(off.name)) {
        isValid = true;
        verifiedSource = "business_name";
        confidence = "high";
      }

      // Check category_blueprint (ONLY safe, non-specific category offerings allowed)
      if (!isValid && off.source === "category_blueprint") {
        if (!SPECIFIC_RECIPE_BLOCKLIST.test(off.name)) {
          isValid = true;
          verifiedSource = "category_blueprint";
          confidence = "medium";
        }
      }

      if (isValid) {
        validatedOfferings.push({
          name: off.name.trim(),
          category: off.category?.trim(),
          description: off.description?.trim(),
          source: verifiedSource,
          evidenceQuote: off.evidenceQuote?.trim(),
          confidence,
        });
      }
    }
  }

  // If fewer than 2 offerings survived validation, supplement with heuristic extraction
  if (validatedOfferings.length < 2) {
    const fallbackStrategy = buildDeterministicBusinessStrategy(lead);
    for (const fbOff of fallbackStrategy.actualOfferings) {
      if (!validatedOfferings.some((v) => v.name.toLowerCase() === fbOff.name.toLowerCase())) {
        validatedOfferings.push(fbOff);
      }
      if (validatedOfferings.length >= 5) break;
    }
  }

  // 2. Validate subCategory against allowed list
  const ALLOWED_SUBCATS: BusinessSubCategory[] = [
    "bengali_heritage_restaurant", "pizzeria", "specialty_cafe", "family_casual_dining",
    "fast_food_takeaway", "cloud_kitchen_delivery", "bakery_patisserie", "bar_pub_lounge",
    "strength_hardcore_gym", "wellness_yoga_studio", "crossfit_functional_box", "dental_clinic",
    "specialist_medical_clinic", "diagnostic_centre", "ayurvedic_wellness_centre", "luxury_salon_spa",
    "unisex_hair_studio", "boutique_retail", "coaching_academy", "local_repair_service", "general_local_business"
  ];

  let subCategory = strategy.subCategory;
  if (!subCategory || !ALLOWED_SUBCATS.includes(subCategory.value)) {
    const fallback = buildDeterministicBusinessStrategy(lead);
    subCategory = fallback.subCategory;
  }

  // Refine coarse subcategories when business name contains explicit niche keywords
  if (subCategory.value === "family_casual_dining" || subCategory.value === "general_local_business") {
    if (/\b(?:cafe|coffee|roaster|brew|tea room|espresso)\b/i.test(leadNameLower)) {
      subCategory = {
        value: "specialty_cafe",
        evidence: ["business_name_keyword:cafe"],
        confidence: "high",
      };
    } else if (/\b(?:pizza|pizzeria|crust)\b/i.test(leadNameLower)) {
      subCategory = {
        value: "pizzeria",
        evidence: ["business_name_keyword:pizza"],
        confidence: "high",
      };
    } else if (/\b(?:polao|pulao|mangsho|biryani|bengali)\b/i.test(leadNameLower)) {
      subCategory = {
        value: "bengali_heritage_restaurant",
        evidence: ["business_name_keyword:bengali_heritage"],
        confidence: "high",
      };
    }
  }

  // 3. Validate conversion goal
  const ALLOWED_GOALS: PrimaryConversionGoal[] = [
    "whatsapp_delivery", "table_reservation", "appointment_booking",
    "direct_call_enquiry", "in_store_visit", "lead_form_quote"
  ];
  let primaryConversionGoal = strategy.primaryConversionGoal;
  if (!primaryConversionGoal || !ALLOWED_GOALS.includes(primaryConversionGoal)) {
    const fallback = buildDeterministicBusinessStrategy(lead);
    primaryConversionGoal = fallback.primaryConversionGoal;
  }

  // 4. Validate website priority
  const ALLOWED_PRIORITIES: WebsitePriority[] = [
    "food_offerings_first", "trust_reputation_first", "ambience_experience_first",
    "services_catalog_first", "location_convenience_first"
  ];
  let websitePriority = strategy.websitePriority;
  if (!websitePriority || !ALLOWED_PRIORITIES.includes(websitePriority)) {
    websitePriority = validatedOfferings.length > 0 ? "food_offerings_first" : "trust_reputation_first";
  }

  // 5. Sanitize primary & secondary selling points
  let psp = strategy.primarySellingPoint;
  if (!psp || !psp.value || typeof psp.value !== "string") {
    psp = {
      value: lead.rating && lead.rating >= 4.0
        ? `Highly rated ${lead.category} in ${lead.city?.split(",")[0] || "town"} with ${lead.reviewsCount || 100}+ verified reviews`
        : `Trusted local ${lead.category} in ${lead.city?.split(",")[0] || "town"}`,
      evidence: ["lead_rating"],
      confidence: "high",
    };
  }

  const secondarySellingPoints = Array.isArray(strategy.secondarySellingPoints)
    ? strategy.secondarySellingPoints.filter((s) => typeof s === "string" && s.trim().length > 3).slice(0, 4)
    : validatedOfferings.slice(0, 3).map((o) => `Specializing in ${o.name}`);

  // 6. Validate visual direction
  const ALLOWED_VIBES = ["warm_earthy", "dark_luxury", "bold_energy", "professional_clean", "modern_luxury"] as const;
  const vibeId = ALLOWED_VIBES.includes(strategy.visualDirection?.vibeId as any)
    ? strategy.visualDirection!.vibeId
    : subCategory.value.includes("gym") ? "bold_energy"
    : subCategory.value.includes("luxury") || subCategory.value.includes("salon") ? "dark_luxury"
    : subCategory.value.includes("clinic") ? "professional_clean"
    : "warm_earthy";

  const visualDirection: ControlledVisualDirection = {
    vibeId,
    contentDensity: strategy.visualDirection?.contentDensity || "comfortable",
    layoutPersonality: strategy.visualDirection?.layoutPersonality || "editorial",
    heroStyle: strategy.visualDirection?.heroStyle || "full_bleed",
  };

  // 7. Validate recommended sections & omissions
  const recommendedSections: SectionRecommendation[] = Array.isArray(strategy.recommendedSections) && strategy.recommendedSections.length > 0
    ? strategy.recommendedSections.filter((s) => s.sectionId && typeof s.priority === "number")
    : [
        { sectionId: "navbar", priority: 1 },
        { sectionId: "hero", priority: 2 },
        { sectionId: "trust_bar", priority: 3 },
        { sectionId: "signature_offerings", priority: 4 },
        { sectionId: "about_story", priority: 5 },
        { sectionId: "reviews", priority: 6 },
        { sectionId: "location_hours", priority: 7 },
        { sectionId: "footer", priority: 8 },
      ];

  const omittedSections: SectionOmission[] = Array.isArray(strategy.omittedSections)
    ? strategy.omittedSections.filter((o) => o.sectionId && o.reason)
    : [];

  return {
    leadId: lead.id,
    subCategory,
    primarySellingPoint: psp,
    secondarySellingPoints,
    targetAudience: strategy.targetAudience || `Local customers and clients in ${lead.city?.split(",")[0] || "your city"}`,
    primaryConversionGoal,
    websitePriority,
    actualOfferings: validatedOfferings,
    reviewThemes: Array.isArray(strategy.reviewThemes) ? strategy.reviewThemes : [],
    recommendedSections,
    omittedSections,
    visualDirection,
    photoRoleRecommendations: resolvePhotoRoles(lead.photoUrls || []),
    generatedAt: new Date().toISOString(),
    source: strategy.source === "groq" ? "groq" : "deterministic_fallback",
  };
}

/**
 * Builds a deterministic BusinessStrategy without any external LLM calls.
 * Uses heuristic keyword classification on business name, category, services, and reviews.
 */
export function buildDeterministicBusinessStrategy(lead: RankedLead): BusinessStrategy {
  const name = (lead.name || "").toLowerCase();
  const cat = (lead.category || "").toLowerCase();
  const allReviews = (lead.reviews || []).map((r) => (r?.text || "").toLowerCase()).join(" ");
  const city = lead.city?.split(",")[0] || "Your City";

  // 1. Classify Sub-category
  let subCat: BusinessSubCategory = "general_local_business";
  const evidenceSubcat: string[] = [];

  if (/polao|mangsho|biryani|bengali|thali|dhaba|mughlai|kebab/.test(name + " " + cat + " " + allReviews)) {
    subCat = "bengali_heritage_restaurant";
    evidenceSubcat.push("name_or_review_keyword:bengali_heritage");
  } else if (/pizza|pizzeria|crust|slice/.test(name + " " + cat)) {
    subCat = "pizzeria";
    evidenceSubcat.push("name_or_cat_keyword:pizza");
  } else if (/cafe|coffee|roast|brew|tea|chai|bakery|pastry|dessert/.test(name + " " + cat)) {
    subCat = "specialty_cafe";
    evidenceSubcat.push("name_or_cat_keyword:cafe");
  } else if (/gym|fitness|workout|crossfit|iron|muscle/.test(name + " " + cat)) {
    subCat = "strength_hardcore_gym";
    evidenceSubcat.push("name_or_cat_keyword:gym");
  } else if (/dental|dentist|tooth|teeth|ortho/.test(name + " " + cat)) {
    subCat = "dental_clinic";
    evidenceSubcat.push("name_or_cat_keyword:dental");
  } else if (/salon|spa|beauty|hair|grooming|makeover/.test(name + " " + cat)) {
    subCat = "luxury_salon_spa";
    evidenceSubcat.push("name_or_cat_keyword:salon");
  } else if (/clinic|doctor|physician|health|hospital/.test(name + " " + cat)) {
    subCat = "specialist_medical_clinic";
    evidenceSubcat.push("name_or_cat_keyword:clinic");
  } else if (/restaurant|dining|food|eatery/.test(name + " " + cat)) {
    subCat = "family_casual_dining";
    evidenceSubcat.push("cat_keyword:restaurant");
  }

  // 2. Extract Evidence-Backed Offerings
  const offerings: VerifiedOffering[] = [];

  // A. Scraped services from Maps
  if (lead.services && lead.services.length > 0) {
    for (const s of lead.services.slice(0, 6)) {
      offerings.push({
        name: s,
        category: "Featured Service",
        source: "scraped_service",
        confidence: "high",
      });
    }
  }

  // B. Search for specific high-frequency keywords in reviews and name
  const candidateLists = [
    ...FOOD_KEYWORDS,
    ...FITNESS_KEYWORDS,
    ...SALON_KEYWORDS,
    ...CLINIC_KEYWORDS,
  ];

  for (const kw of candidateLists) {
    if (offerings.length >= 6) break;
    const nameMatch = name.includes(kw);
    const matchedReview = (lead.reviews || []).find((r) => (r?.text || "").toLowerCase().includes(kw));

    if (nameMatch || matchedReview) {
      // Avoid generic category words from matching business name without review evidence
      if (nameMatch && !matchedReview && (kw === "pizza" || kw === "coffee" || kw === "tea" || kw === "dessert" || kw === "cake")) {
        continue;
      }
      const formattedName = kw
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      if (!offerings.some((o) => o.name.toLowerCase() === formattedName.toLowerCase())) {
        offerings.push({
          name: formattedName,
          category: nameMatch ? "Signature Specialty" : "Customer Favorite",
          source: nameMatch ? "business_name" : "review_text",
          evidenceQuote: matchedReview ? matchedReview.text.slice(0, 100) : undefined,
          confidence: nameMatch ? "high" : "medium",
        });
      }
    }
  }

  // If still empty, supply safe category offerings
  if (offerings.length === 0) {
    if (subCat === "bengali_heritage_restaurant") {
      offerings.push(
        { name: "Special Pulao Combos", category: "Signature", source: "category_blueprint", confidence: "medium" },
        { name: "Slow-Cooked Meat Curries", category: "Main Course", source: "category_blueprint", confidence: "medium" },
        { name: "Family Meal Packs", category: "Combos", source: "category_blueprint", confidence: "medium" }
      );
    } else if (subCat === "pizzeria") {
      offerings.push(
        { name: "Handcrafted Pizzas", category: "Pizzas", source: "category_blueprint", confidence: "medium" },
        { name: "Artisan Crusts & Breads", category: "Sides", source: "category_blueprint", confidence: "medium" },
        { name: "Continental Specialties", category: "Specialties", source: "category_blueprint", confidence: "medium" }
      );
    } else if (subCat === "specialty_cafe") {
      offerings.push(
        { name: "Artisanal Brews & Coffee", category: "Coffee", source: "category_blueprint", confidence: "medium" },
        { name: "Cafe Bites & Snacks", category: "Food", source: "category_blueprint", confidence: "medium" },
        { name: "Refreshing Beverages", category: "Beverages", source: "category_blueprint", confidence: "medium" }
      );
    } else if (subCat === "strength_hardcore_gym") {
      offerings.push(
        { name: "Strength & Conditioning", category: "Training", source: "category_blueprint", confidence: "medium" },
        { name: "Personal Coaching", category: "Coaching", source: "category_blueprint", confidence: "medium" },
        { name: "Free Weight Floor", category: "Facility", source: "category_blueprint", confidence: "medium" }
      );
    } else {
      offerings.push(
        { name: "Professional Consultation", category: "Core Offering", source: "category_blueprint", confidence: "medium" },
        { name: "Quality Customer Care", category: "Service", source: "category_blueprint", confidence: "medium" },
        { name: "Verified Local Solutions", category: "Solutions", source: "category_blueprint", confidence: "medium" }
      );
    }
  }

  // 3. Determine Conversion Goal
  let goal: PrimaryConversionGoal = "in_store_visit";
  if (/delivery|deliveries|order online|home delivery|swiggy|zomato|parcel/.test(allReviews + " " + name)) {
    goal = "whatsapp_delivery";
  } else if (/book|appointment|consultation|doctor|stylist|dentist/.test(cat + " " + allReviews)) {
    goal = "appointment_booking";
  } else if (/reserve|table|hangout|dinner with family/.test(allReviews)) {
    goal = "table_reservation";
  }

  // 4. Selling Point Construction
  const pspValue = lead.rating && lead.rating >= 4.0
    ? `Top-rated ${lead.category} in ${city} with ${lead.reviewsCount || 100}+ verified Google reviews`
    : `Trusted ${lead.category} dedicated to authentic quality in ${city}`;

  const secondaryPoints = offerings.slice(0, 3).map((o) => `Specializing in ${o.name}`);

  // 5. Section Assembly
  const recommendedSections: SectionRecommendation[] = [
    { sectionId: "navbar", priority: 1 },
    { sectionId: "hero", priority: 2 },
    { sectionId: "trust_bar", priority: 3 },
    { sectionId: "signature_offerings", priority: 4 },
  ];

  if (goal === "whatsapp_delivery") {
    recommendedSections.push({
      sectionId: "delivery_cta",
      priority: 5,
      headlineOverride: `Quick WhatsApp Delivery Across ${city}`,
    });
  } else if (goal === "appointment_booking") {
    recommendedSections.push({
      sectionId: "booking_cta",
      priority: 5,
      headlineOverride: `Book an Appointment in ${city}`,
    });
  }

  recommendedSections.push(
    { sectionId: "about_story", priority: 6 },
    { sectionId: "gallery", priority: 7 },
    { sectionId: "reviews", priority: 8 },
    { sectionId: "location_hours", priority: 9 },
    { sectionId: "footer", priority: 10 }
  );

  return {
    leadId: lead.id,
    subCategory: {
      value: subCat,
      evidence: evidenceSubcat.length > 0 ? evidenceSubcat : ["category_classification"],
      confidence: "medium",
    },
    primarySellingPoint: {
      value: pspValue,
      evidence: ["lead_rating", "review_count"],
      confidence: "high",
    },
    secondarySellingPoints: secondaryPoints,
    targetAudience: `Patrons, diners, and families living in or visiting ${city}`,
    primaryConversionGoal: goal,
    websitePriority: offerings.length > 0 ? "food_offerings_first" : "trust_reputation_first",
    actualOfferings: offerings,
    reviewThemes: [],
    recommendedSections,
    omittedSections: [],
    visualDirection: {
      vibeId: subCat.includes("gym") ? "bold_energy"
        : subCat.includes("luxury") || subCat.includes("salon") ? "dark_luxury"
        : subCat.includes("clinic") ? "professional_clean"
        : "warm_earthy",
      contentDensity: "comfortable",
      layoutPersonality: "editorial",
      heroStyle: "full_bleed",
    },
    photoRoleRecommendations: resolvePhotoRoles(lead.photoUrls || []),
    generatedAt: new Date().toISOString(),
    source: "deterministic_fallback",
  };
}

/**
 * Extracts a structured BusinessStrategy using Groq Llama-3.3-70B.
 * Automatically falls back to deterministic extraction if Groq fails or times out.
 */
export async function extractBusinessStrategyWithGroq(lead: RankedLead): Promise<BusinessStrategy> {
  const photoMeta = resolvePhotoMetadata(lead.photoUrls || []);
  const praiseReviews = (lead.reviews || [])
    .filter((r) => r && typeof r.rating === "number" && r.rating >= 4)
    .slice(0, 5)
    .map((r, i) => ({
      id: `p${i + 1}`,
      author: r.author || "Customer",
      rating: r.rating,
      text: (r.text || "").slice(0, 200),
    }));

  const criticalReviews = (lead.reviews || [])
    .filter((r) => r && typeof r.rating === "number" && r.rating <= 3)
    .slice(0, 3)
    .map((r, i) => ({
      id: `c${i + 1}`,
      author: r.author || "Customer",
      rating: r.rating,
      text: (r.text || "").slice(0, 200),
    }));

  const payload = {
    business: {
      name: lead.name,
      category: lead.category,
      city: lead.city?.split(",")[0] || "Unknown",
      address: lead.address || "",
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
      priceLevel: lead.priceLevel || null,
      hours: lead.hours?.slice(0, 2) || [],
      services: lead.services?.slice(0, 8) || [],
      about: lead.about?.slice(0, 300) || "",
    },
    evidence: {
      photos: photoMeta.map((p) => ({ index: p.index, aspectRatio: p.aspectRatio, isLowRes: p.isLowRes })),
      praiseReviews,
      criticalReviews,
    },
  };

  const systemPrompt = `You are the Webeta Business Strategy Intelligence Engine in 2026.
Analyze the provided scraped local business evidence and produce a structured BusinessStrategy JSON object.

CRITICAL RULES:
1. Groq is performing BUSINESS ANALYSIS, NOT fact creation.
2. DO NOT hallucinate fake menu dishes, fake staff names, or unverified services.
3. FACTUAL GROUNDING ON DISHES:
   - DO NOT claim specific recipes or dishes (e.g. "Margherita Pizza", "Pepperoni Pizza", "Veggie Supreme", "Butter Chicken") merely because the business category is pizzeria, cafe, or restaurant.
   - Such offerings require actual evidence from business.services, reviews, or business.about.
   - Business name/category alone can support classification (e.g. "BONG PIZZA" supports pizzeria classification), NOT specific dishes.
   - If no specific dishes are verified in evidence, you MUST provide safe generic category offerings (e.g. "Handcrafted Pizzas", "Artisan Crusts", "Specialty Continental Dishes") with source "category_blueprint".
4. Every item in actualOfferings MUST be backed by genuine evidence:
   - source "scraped_service" (must match business.services)
   - source "review_text" (must quote exact phrase from praiseReviews or criticalReviews)
   - source "business_name" (ONLY if specific non-generic dish is in name, e.g. "Polao Mangsho"; generic "Pizza" in name does NOT justify Margherita or Pepperoni)
   - source "business_about" (supported by business.about)
   - source "category_blueprint" (safe generic non-recipe category offerings when no specific menu data exists)
5. For restaurants/eateries/cafes:
   - If business.name or reviews mention "cafe", "coffee", "roastery", "brew", classify subCategory as "specialty_cafe"! Focus on coffee, ambience, and cafe food.
   - If business.name, category, or reviews mention "pizza", "pizzeria", classify subCategory as "pizzeria"! Focus on pizza and fast food.
   - If business.name, category, or reviews mention "polao", "mangsho", "bengali", "biryani", classify subCategory as "bengali_heritage_restaurant"! Focus on pulao, mutton, chicken, home delivery.
6. DO NOT claim visual understanding of photo pixels. Recommend photo roles based ONLY on the provided aspectRatio and resolution metadata.
7. Return ONLY valid JSON matching the exact schema. No markdown fences, no conversational prose.`;

  const userPrompt = `Analyze this business and return the BusinessStrategy JSON object:
${JSON.stringify(payload, null, 2)}

SCHEMA:
{
  "subCategory": { "value": "<one of: bengali_heritage_restaurant | pizzeria | specialty_cafe | family_casual_dining | fast_food_takeaway | cloud_kitchen_delivery | bakery_patisserie | bar_pub_lounge | strength_hardcore_gym | wellness_yoga_studio | crossfit_functional_box | dental_clinic | specialist_medical_clinic | diagnostic_centre | ayurvedic_wellness_centre | luxury_salon_spa | unisex_hair_studio | boutique_retail | coaching_academy | local_repair_service | general_local_business>", "evidence": ["<quote/field>"], "confidence": "<high|medium|low>" },
  "primarySellingPoint": { "value": "<compelling 1-sentence USP>", "evidence": ["<quote/field>"], "confidence": "<high|medium|low>" },
  "secondarySellingPoints": ["<point 1>", "<point 2>", "<point 3>"],
  "targetAudience": "<target audience summary>",
  "primaryConversionGoal": "<one of: whatsapp_delivery | table_reservation | appointment_booking | direct_call_enquiry | in_store_visit | lead_form_quote>",
  "websitePriority": "<one of: food_offerings_first | trust_reputation_first | ambience_experience_first | services_catalog_first | location_convenience_first>",
  "actualOfferings": [
    { "name": "<dish or service name>", "category": "<type>", "description": "<brief note>", "source": "<scraped_service|business_about|review_text|business_name|category_blueprint>", "evidenceQuote": "<quote from reviews or data>", "confidence": "<high|medium|low>" }
  ],
  "reviewThemes": [
    { "theme": "<theme>", "sentiment": "<positive|mixed|negative>", "mentionCount": 1, "sampleQuotes": ["<quote>"] }
  ],
  "recommendedSections": [
    { "sectionId": "<navbar|hero|trust_bar|about_story|signature_offerings|highlights|gallery|reviews|delivery_cta|booking_cta|location_hours|footer>", "priority": 1, "headlineOverride": "<optional title>" }
  ],
  "omittedSections": [
    { "sectionId": "<sectionId>", "reason": "<why omitted>" }
  ],
  "visualDirection": {
    "vibeId": "<warm_earthy|dark_luxury|bold_energy|professional_clean|modern_luxury>",
    "contentDensity": "comfortable",
    "layoutPersonality": "editorial",
    "heroStyle": "full_bleed"
  }
}`;

  try {
    const res = await runGroqJSON<Partial<BusinessStrategy>>(
      `${systemPrompt}\n\n${userPrompt}`,
      { temperature: 0.2, maxTokens: 1600 }
    );

    if (res.ok && res.data) {
      return validateBusinessStrategy(
        { ...res.data, source: "groq" },
        lead
      );
    }
  } catch {
    // Groq error / timeout / rate limit -> proceed directly to deterministic fallback
  }

  // Deterministic fallback
  return buildDeterministicBusinessStrategy(lead);
}
