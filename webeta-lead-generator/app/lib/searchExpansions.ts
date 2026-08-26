/**
 * Search term expansion — when user types "gym", we also search for 
 * related business types to ensure NOTHING is missed.
 */

export const SEARCH_EXPANSIONS: Record<string, string[]> = {
  // Fitness
  gym: ["gym", "fitness center", "fitness studio", "crossfit", "health club", "workout studio", "bodybuilding gym"],
  yoga: ["yoga studio", "yoga center", "yoga classes", "meditation center"],
  fitness: ["fitness center", "gym", "health club", "personal trainer", "crossfit"],

  // Food & Hospitality
  restaurant: ["restaurant", "dhaba", "family restaurant", "fine dining", "biryani", "thali restaurant", "food court"],
  cafe: ["cafe", "coffee shop", "bakery", "tea stall", "cake shop", "dessert shop"],
  hotel: ["hotel", "guest house", "lodge", "homestay", "resort", "dharamshala", "oyo"],
  bar: ["bar", "pub", "lounge", "brewery", "wine shop", "liquor shop"],

  // Beauty & Wellness
  salon: ["salon", "beauty parlour", "hair salon", "spa", "nail salon", "bridal makeup", "unisex salon", "mens salon"],
  spa: ["spa", "wellness center", "massage center", "ayurveda center"],

  // Medical
  clinic: ["clinic", "doctor", "hospital", "medical center", "diagnostic center", "pathology lab"],
  dentist: ["dentist", "dental clinic", "dental hospital", "orthodontist"],
  pharmacy: ["pharmacy", "medical store", "medicine shop", "chemist"],
  eye: ["eye clinic", "optical shop", "optician", "eye hospital"],

  // Education
  coaching: ["coaching center", "tuition center", "coaching institute", "coaching classes", "tutorial"],
  school: ["school", "play school", "nursery school", "preschool", "montessori"],
  "computer classes": ["computer classes", "computer institute", "IT training", "coding classes"],

  // Retail & Services
  shop: ["shop", "store", "showroom", "retail store", "wholesale"],
  "mobile shop": ["mobile shop", "mobile repair", "phone shop", "mobile accessories"],
  clothing: ["clothing store", "fashion store", "boutique", "garment shop", "saree shop"],
  jewellery: ["jewellery shop", "gold shop", "jewellery store", "imitation jewellery"],
  electronics: ["electronics shop", "electronics store", "appliance store", "computer shop"],
  furniture: ["furniture shop", "furniture store", "home decor", "interior designer"],

  // Automotive
  garage: ["car garage", "auto repair", "car service", "mechanic", "two wheeler service"],
  "car wash": ["car wash", "car detailing", "car cleaning"],

  // Professional Services
  lawyer: ["lawyer", "advocate", "legal services", "law firm"],
  ca: ["chartered accountant", "CA", "tax consultant", "GST consultant", "accountant"],
  photographer: ["photographer", "photo studio", "videographer", "photography studio"],

  // Home Services
  plumber: ["plumber", "plumbing services"],
  electrician: ["electrician", "electrical services", "electrical contractor"],
  pest: ["pest control", "pest control service", "termite treatment"],

  // Real Estate
  "real estate": ["real estate agent", "property dealer", "real estate", "builder", "flat for sale"],

  // Pet
  pet: ["pet shop", "pet store", "veterinary", "vet clinic", "dog grooming", "pet care"],

  // Travel
  travel: ["travel agency", "travel agent", "tour operator", "ticket booking"],

  // Event
  event: ["event planner", "event management", "wedding planner", "caterer", "tent house", "banquet hall"],

  // Printing
  printing: ["printing press", "printing shop", "flex printing", "digital printing", "photocopy shop"],
};

/**
 * Given a user's search term, returns expanded search queries.
 * If no expansion found, returns the original term as-is.
 */
export function expandSearchTerms(input: string): string[] {
  const lower = input.toLowerCase().trim();

  // Direct match
  if (SEARCH_EXPANSIONS[lower]) {
    return SEARCH_EXPANSIONS[lower];
  }

  // Partial match — if user types "dental", match "dentist"
  for (const [key, expansions] of Object.entries(SEARCH_EXPANSIONS)) {
    if (key.includes(lower) || lower.includes(key)) {
      return expansions;
    }
  }

  // Check if the input matches any expansion value
  for (const expansions of Object.values(SEARCH_EXPANSIONS)) {
    if (expansions.some((exp) => exp.includes(lower) || lower.includes(exp))) {
      return expansions;
    }
  }

  // No match — return original term as-is
  return [lower];
}

/**
 * Get all available business categories for the UI dropdown.
 */
export function getAllCategories(): string[] {
  return Object.keys(SEARCH_EXPANSIONS).sort();
}
