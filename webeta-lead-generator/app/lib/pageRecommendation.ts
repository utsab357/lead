import type { RankedLead, BusinessStrategy, RecommendedPage } from "./types";

/**
 * Intelligently determines the exact pages a business deserves (from 1 to 5).
 * 1 is the lowest (every business gets at least Home).
 *
 * Rather than a rigid category rule (e.g. "all hotels = 3"), this examines the true scale,
 * photo count, review volume, price tier, and offerings depth of THIS SPECIFIC business.
 */
export function getIntelligentPagesForLead(
  lead: RankedLead,
  strategy?: BusinessStrategy
): RecommendedPage[] {
  // If strategy already has valid recommended pages from Groq analysis, use them!
  if (strategy?.recommendedPages && strategy.recommendedPages.length > 0) {
    const hasHome = strategy.recommendedPages.some(p => p.id === "home");
    if (!hasHome) {
      return [{ id: "home", label: "🏠 Home", reason: "Core conversion landing page" }, ...strategy.recommendedPages];
    }
    return strategy.recommendedPages;
  }

  const cat = `${lead.category || ""} ${lead.name || ""}`.toLowerCase();
  const about = `${lead.about || ""} ${lead.services?.join(" ") || ""}`.toLowerCase();
  const allReviewsText = (lead.reviews || []).map((r) => r?.text || "").join(" ").toLowerCase();
  const combinedContext = `${cat} ${about} ${allReviewsText}`;

  const reviewsCount = lead.reviewsCount || 0;
  const photosCount = lead.photosCount || lead.photoUrls?.length || 0;
  const isHighVisual = photosCount >= 12 || reviewsCount >= 80 || /ambience|aesthetic|interior|decor|vibe|cozy|atmosphere|lookbook/i.test(allReviewsText);
  const isLuxuryOrLarge = lead.priceLevel === "₹₹₹" || lead.priceLevel === "₹₹₹₹" || /resort|luxury|banquet|multi-specialty|hospital|villas|suites|rooftop|heritage/i.test(combinedContext);
  const isSmallOrTakeaway = /takeaway|takeout|stall|counter|kiosk|dhaba|fast food|puncture|plumber|electrician|locksmith|repair|towing/i.test(combinedContext) && reviewsCount < 40;

  const pages: RecommendedPage[] = [
    { id: "home", label: "🏠 Home", reason: "Primary conversion landing page" }
  ];

  // ── 1. FOOD & DINING ─────────────────────────────────────────────────────────────
  if (/cafe|coffee|restaurant|dining|food|pizza|burger|bistro|bakery|bar|lounge|pub|biryani|sweets/i.test(cat)) {
    if (isSmallOrTakeaway) {
      // Small fast-food counter / tea stall -> 1 page is best!
      return pages;
    }

    // Standard or popular restaurant/cafe -> Deserves Menu
    pages.push({
      id: "menu",
      label: "🍽️ Menu",
      reason: "Showcase signature dishes, beverage prices, and direct WhatsApp orders"
    });

    // If large facility with banquets / events / catering
    if (/banquet|catering|party|event|celebration|rooftop|private dining/i.test(combinedContext)) {
      pages.push({
        id: "services",
        label: "🎉 Banquets & Events",
        reason: "Private dining, banquet hall bookings, and group party packages"
      });
    }

    // If strong visual presence
    if (isHighVisual) {
      pages.push({
        id: "gallery",
        label: "📸 Gallery",
        reason: `${photosCount > 0 ? photosCount + " customer photos" : "Strong reviews praising atmosphere and food plating"}`
      });
    }

    return pages;
  }

  // ── 2. LODGING & HOTELS ────────────────────────────────────────────────────────
  if (/hotel|resort|lodge|homestay|inn|guest house|motel|villa/i.test(cat)) {
    if (isSmallOrTakeaway || (/lodge|guest house/i.test(cat) && reviewsCount < 25)) {
      // Small budget lodge -> 1 or 2 pages
      pages.push({
        id: "rooms",
        label: "🛏️ Rooms",
        reason: "Room tariff and direct WhatsApp booking"
      });
      return pages;
    }

    // Standard Hotel -> Home + Rooms
    pages.push({
      id: "rooms",
      label: "🛏️ Rooms & Suites",
      reason: "Showcase room categories, amenities, and instant reservations"
    });

    // Luxury Resort / Full Hotel -> Dining, Amenities, Gallery
    if (isLuxuryOrLarge || /pool|dining|restaurant|spa|conference|wedding/i.test(combinedContext)) {
      pages.push({
        id: "services",
        label: "🍽️ Dining & Amenities",
        reason: "In-house restaurant, swimming pool, and guest facilities"
      });
    }

    if (isHighVisual || isLuxuryOrLarge) {
      pages.push({
        id: "gallery",
        label: "📸 Photo Gallery",
        reason: "Resort grounds, room interiors, and property views"
      });
    }

    return pages;
  }

  // ── 3. HEALTHCARE & MEDICAL ──────────────────────────────────────────────────
  if (/clinic|doctor|dental|dentist|hospital|pharmacy|eye|health|ortho|ayurveda|physio/i.test(cat)) {
    const isBigHospital = /hospital|nursing home|multi-specialty|surgical|diagnostic/i.test(cat) || reviewsCount > 100;

    if (!isBigHospital && reviewsCount < 30) {
      // Solo doctor / small dental chamber -> Home + Treatments (2 pages)
      pages.push({
        id: "services",
        label: "🩺 Treatments & Consultations",
        reason: "Core treatment list, doctor qualifications, and appointment booking"
      });
      return pages;
    }

    // Hospital / Multi-Doctor Centre -> 3 to 4 pages
    pages.push({
      id: "services",
      label: "🩺 Specialities & Doctors",
      reason: "Medical departments, specialist profiles, and OPD hours"
    });

    const hasPhotos = photosCount >= 3 || (lead.photoUrls && lead.photoUrls.length >= 3);
    if (hasPhotos && (isHighVisual || isBigHospital || /diagnostic|pathology|scan|x-ray|blood|lab|icu|emergency/i.test(combinedContext))) {
      pages.push({
        id: "gallery",
        label: "📸 Facility Tour",
        reason: "Patient rooms, diagnostic equipment, and reception"
      });
    }

    return pages;
  }

  // ── 4. FITNESS & GYMS ─────────────────────────────────────────────────────────
  if (/gym|fitness|crossfit|yoga|pilates|zumba|martial|mma|workout/i.test(cat)) {
    if (reviewsCount < 20 && !isHighVisual) {
      // Local neighborhood gym -> 1 or 2 pages
      pages.push({
        id: "programs",
        label: "💪 Memberships & Timings",
        reason: "Monthly fees, gym equipment, and open hours"
      });
      return pages;
    }

    pages.push({
      id: "programs",
      label: "💪 Programs & Training",
      reason: "Strength training, personal coaching, and fitness classes"
    });

    if (isHighVisual) {
      pages.push({
        id: "gallery",
        label: "📸 Gym & Transformation Gallery",
        reason: "Equipment showcase and member workout atmosphere"
      });
    }

    return pages;
  }

  // ── 5. EMERGENCY SERVICES & LOCAL TRADES ──────────────────────────────────────
  if (/plumber|electrician|locksmith|repair|ac service|pest|towing|mechanic|carpenter/i.test(cat)) {
    // High-converting single-page landing converts best for emergency trades!
    return pages;
  }

  // ── 6. SALONS & BEAUTY ────────────────────────────────────────────────────────
  if (/salon|beauty|spa|hair|makeup|parlour|grooming/i.test(cat)) {
    pages.push({
      id: "services",
      label: "✨ Services & Rate Card",
      reason: "Haircuts, bridal packages, and styling menu"
    });

    if (isHighVisual) {
      pages.push({
        id: "gallery",
        label: "📸 Hair & Makeup Lookbook",
        reason: "Real client transformations and bridal showcase"
      });
    }

    return pages;
  }

  // ── 7. INTERIOR DESIGN & ARCHITECTURE ─────────────────────────────────────────
  if (/interior|architect|renovation|decorator|design studio/i.test(cat)) {
    pages.push({
      id: "services",
      label: "✨ Design Services",
      reason: "Turnkey residential and commercial interior solutions"
    });

    pages.push({
      id: "portfolio",
      label: "📸 Completed Projects Portfolio",
      reason: "Before/after living room, kitchen, and office project photos"
    });

    return pages;
  }

  // ── 8. DEFAULT GENERAL LOCAL BUSINESS ─────────────────────────────────────────
  if (isHighVisual) {
    pages.push({
      id: "services",
      label: "⚙️ Services & Pricing",
      reason: "Clear breakdown of customer services and rates"
    });
    pages.push({
      id: "gallery",
      label: "📸 Gallery",
      reason: "Visual proof of quality and premises"
    });
  } else if (reviewsCount >= 30) {
    pages.push({
      id: "services",
      label: "⚙️ Services & Solutions",
      reason: "Key business offerings and customer benefits"
    });
  }

  return pages;
}
