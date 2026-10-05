/** A single customer review scraped from Google Maps */
export type BusinessReview = {
  text: string;           // review body
  rating: number;         // 1-5 stars
  author: string;         // reviewer name
  timeAgo: string;        // "2 months ago", "1 year ago"
  ownerReply?: string;    // owner's response if any
};

export type Lead = {
  id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  mapUrl?: string;
  rating?: number;
  reviewsCount?: number;
  lat: number;
  lng: number;

  // ── Extended data (scraped from Maps detail panel) ──
  /** Business operating hours, e.g. ["Mon: 6AM–10PM", "Tue: 6AM–10PM", ...] */
  hours?: string[];
  /** URLs of the first 5-8 photos from the listing */
  photoUrls?: string[];
  /** Total number of photos on the listing */
  photosCount?: number;
  /** Business description / about text */
  about?: string;
  /** Services offered, e.g. ["Personal training", "Group classes", "Cardio"] */
  services?: string[];
  /** Price level indicator: "₹", "₹₹", "₹₹₹", or undefined */
  priceLevel?: string;
  /** Social media links found (Facebook, Instagram, YouTube, etc.) */
  socialLinks?: { platform: string; url: string }[];
  /** 15 most relevant + 15 most negative reviews */
  reviews?: BusinessReview[];
  /** Does the owner reply to reviews? (true = tech-savvy, false = needs help) */
  ownerReplies?: boolean;
  /** Data source: "maps", "justdial", or "both" */
  source?: string;
  yearsInBusiness?: number;
};

/** Pipeline status for a lead */
export type LeadStatus =
  | "new"
  | "called"
  | "interested"
  | "demo_sent"
  | "meeting_set"
  | "completed"
  | "not_interested"
  | "no_response";

/** One saved scrape run — stored as data/sessions/<id>.json */
export type ScrapeSession = {
  id: string;           // e.g. "session-1723657200000"
  niche: string;
  city: string;
  timestamp: string;    // ISO string
  leadsCount: number;
  noWebsiteCount: number;
  withPhoneCount: number;
  expandedTerms: string[];
  leads: Lead[];
  /** Audit results saved after Phase 2 completes */
  audits?: Record<string, AuditResult>;
  /** Ranked leads saved after Phase 3 completes */
  ranked?: RankedLead[];
  /** The lead ID selected in Phase 3 */
  selectedId?: string | null;
  /** Conversion points per lead — { [leadId]: ConversionPoints } */
  conversions?: Record<string, ConversionPoints>;
  /** Outreach drafts per lead — { [leadId]: OutreachResult } */
  outreachResults?: Record<string, OutreachResult>;
  /** Build prompts per lead — { [leadId]: BuildPromptResult } */
  buildPrompts?: Record<string, BuildPromptResult>;
  /** Visual preview mockups and metadata per lead */
  visualPreviews?: Record<string, LeadVisualPreviewSet>;
  /** Pipeline status per lead — { [leadId]: LeadStatus } */
  leadStatuses?: Record<string, LeadStatus>;
  /** Freeform notes per lead — { [leadId]: string } */
  leadNotes?: Record<string, string>;
  /** Client deal details per lead — { [leadId]: ClientDetail } */
  clientDetails?: Record<string, ClientDetail>;
};

/** Client deal/project details filled after closing a lead */
export type ClientDetail = {
  clientName?:        string;
  priceAgreed?:       string;
  advanceReceived?:   string;
  balanceDue?:        string;
  domainName?:        string;
  websiteUrl?:        string;
  freeHostingStart?:  string;
  freeHostingEnd?:    string;
  paidHostingStart?:  string;
  paidHostingEnd?:    string;
  remarks?:           string;
};

export type AuditResult = {
  leadId: string;
  pageSpeedScore: number;
  hasWebsite: boolean;
  mobileFriendly: boolean;
  https: boolean;
  hasSchema: boolean;
  loadTimeMs: number;
  gaps: string[];
  biggestGap: string;
  estLostRevenuePerMonth: number;
};

export type ConversionPoints = {
  leadId: string;
  points: string[];
  competitorInsight: string;
  revenueArgument: string;
  urgencyHook: string;
  postCallWhatsApp?: string;
  bestTimeToCall?: string;
  callScript?: {
    opener: string;
    iceBreaker?: string;
    keyPoints: string[];
    objectionHandler: string;
    closer: string;
    doNotSay?: string;
  };

};

export type RankedLead = Lead & {
  audit: AuditResult;
  conversionPoints?: ConversionPoints;
  score: number;
  scoreReasoning?: string;
  scoreBreakdown?: {
    noOrBadSite: number;
    reviewVolume: number;
    rating: number;
    recency: number;
    reachable: number;
    industryFit: number;
  };
};

export type ExtraPage = {
  id: string;
  icon: string;
  label: string;
  desc: string;
};

export type BuildPromptResult = {
  prompt: string;
  pitchPoints: string[];
  extraPages?: ExtraPage[];
  strategy?: BusinessStrategy;
};

export type OutreachResult = {
  first: string;
  followUp: string;
  bestSendTime: string;
};

export type CallScript = {
  openingLine: string;
  painPoints: string[];
  objectionHandlers: { objection: string; response: string }[];
  closingLine: string;
  pricingSuggestion: string;
};

export type ScrapeInput = {
  niche: string;
  city: string;
  noWebsiteOnly?: boolean;
};

export type OutreachChannel = "whatsapp" | "email" | "instagram";
export type OutreachLanguage = "english" | "hinglish";

// ── Visual Preview & WebsiteSpec Architecture ───────────────────────────────

export type VisualVibe =
  | "warm_earthy"
  | "dark_luxury"
  | "sleek_modern"
  | "bold_energy"
  | "professional_clean";

export type VisualDesignTokens = {
  vibe: VisualVibe;
  primaryColor: string;
  secondaryColor: string;
  darkColor: string;
  surfaceColor: string;
  canvasColor: string;
  displayFont: string;
  bodyFont: string;
  borderRadius: string;
  navStyle: "floating_pill" | "sticky_bar" | "clean_split";
  buttonStyle: "rounded_pill" | "rounded_md" | "sharp_glow";
  cardStyle: "soft_bordered" | "glassmorphism" | "solid_shadow";
  spacingDensity: "comfortable" | "compact" | "spacious";
  imageTreatment: "warm_rounded" | "dark_overlay" | "vibrant_sharp";
  decorativeStyle: "botanical" | "geometric" | "minimal" | "kinetic";
};

export type SupportedPageId =
  | "home"
  | "about"
  | "services"
  | "menu"
  | "gallery"
  | "booking"
  | "contact"
  | "location";

export type ComponentBlock =
  | {
      type: "navbar";
      style: "floating_pill" | "sticky_bar";
      brand: string;
      links: string[];
      ctaText: string;
      statusBadge?: string;
    }
  | {
      type: "hero";
      headline: string;
      subtitle: string;
      bgImageUrl: string;
      ratingChip?: string;
      ctaPrimary: string;
      ctaSecondary: string;
      scrollIndicator?: string;
    }
  | {
      type: "trust_bar";
      ratingText: string;
      reviewsText: string;
      highlightScript: string;
      bgColor: string;
    }
  | {
      type: "about";
      tag: string;
      title: string;
      narrative: string;
      imageUrl: string;
      badgeText?: string;
      ctaText: string;
    }
  | {
      type: "highlights";
      tag: string;
      title: string;
      cards: { icon: string; title: string; desc: string; isHighlighted?: boolean }[];
    }
  | {
      type: "visual_grid";
      tag: string;
      title: string;
      subtitle?: string;
      ctaText: string;
      columns: number;
      items: { title: string; imageUrl: string }[];
    }
  | {
      type: "gallery";
      tag: string;
      title: string;
      ctaText: string;
      imageUrls: string[];
    }
  | {
      type: "reviews";
      tag: string;
      title: string;
      cards: { author: string; text: string; rating: number; avatarUrl?: string }[];
    }
  | {
      type: "location";
      tag: string;
      title: string;
      address: string;
      hours: string;
      ctaMap: string;
      ctaCall: string;
      mapType: "vector_svg";
    }
  | {
      type: "cta_banner";
      tag: string;
      title: string;
      subtitle: string;
      ctaText: string;
      ctaUrl: string;
      secondaryCtaText?: string;
      secondaryCtaUrl?: string;
    }
  | {
      type: "footer";
      brand: string;
      links: string[];
      copyright: string;
      waFloating: boolean;
    };

export type BusinessSubCategory =
  | "bengali_heritage_restaurant"
  | "pizzeria"
  | "specialty_cafe"
  | "family_casual_dining"
  | "fast_food_takeaway"
  | "cloud_kitchen_delivery"
  | "bakery_patisserie"
  | "bar_pub_lounge"
  | "strength_hardcore_gym"
  | "wellness_yoga_studio"
  | "crossfit_functional_box"
  | "dental_clinic"
  | "specialist_medical_clinic"
  | "diagnostic_centre"
  | "ayurvedic_wellness_centre"
  | "luxury_salon_spa"
  | "unisex_hair_studio"
  | "boutique_retail"
  | "coaching_academy"
  | "local_repair_service"
  | "general_local_business";

export type PrimaryConversionGoal =
  | "whatsapp_delivery"
  | "table_reservation"
  | "appointment_booking"
  | "direct_call_enquiry"
  | "in_store_visit"
  | "lead_form_quote";

export type WebsitePriority =
  | "food_offerings_first"
  | "trust_reputation_first"
  | "ambience_experience_first"
  | "services_catalog_first"
  | "location_convenience_first";

export type EvidenceSource =
  | "scraped_service"
  | "business_about"
  | "review_text"
  | "business_name"
  | "category_blueprint";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface EvidenceItem<T> {
  value: T;
  evidence: string[];
  confidence: ConfidenceLevel;
}

export interface VerifiedOffering {
  name: string;
  category?: string;
  description?: string;
  source: EvidenceSource;
  evidenceQuote?: string;
  confidence: ConfidenceLevel;
}

export interface ReviewTheme {
  theme: string;
  sentiment: "positive" | "mixed" | "negative";
  mentionCount: number;
  sampleQuotes: string[];
}

export interface PhotoRoleRecommendation {
  photoIndex: number;
  url: string;
  recommendedRole: "hero" | "about" | "gallery" | "offering" | "reject";
  aspectRatioHint?: "landscape" | "portrait" | "square";
  reason: string;
}

export interface SectionRecommendation {
  sectionId:
    | "navbar"
    | "hero"
    | "trust_bar"
    | "about_story"
    | "signature_offerings"
    | "highlights"
    | "gallery"
    | "reviews"
    | "delivery_cta"
    | "booking_cta"
    | "location_hours"
    | "footer";
  priority: number;
  variantPreference?: string;
  headlineOverride?: string;
}

export interface SectionOmission {
  sectionId: string;
  reason: string;
}

export interface ControlledVisualDirection {
  vibeId: "warm_earthy" | "dark_luxury" | "bold_energy" | "professional_clean" | "modern_luxury";
  contentDensity: "compact" | "comfortable" | "spacious";
  layoutPersonality: "editorial" | "asymmetric_bento" | "clean_grid" | "minimal_showcase";
  heroStyle: "full_bleed" | "split_visual" | "editorial_text_first";
}

export interface RecommendedPage {
  id: string;
  label: string;
  reason?: string;
  description?: string;
}

export interface BusinessStrategy {
  leadId: string;
  subCategory: EvidenceItem<BusinessSubCategory>;
  primarySellingPoint: EvidenceItem<string>;
  secondarySellingPoints: string[];
  targetAudience: string;
  primaryConversionGoal: PrimaryConversionGoal;
  websitePriority: WebsitePriority;
  actualOfferings: VerifiedOffering[];
  reviewThemes: ReviewTheme[];
  recommendedSections: SectionRecommendation[];
  omittedSections: SectionOmission[];
  recommendedPages?: RecommendedPage[];
  visualDirection: ControlledVisualDirection;
  photoRoleRecommendations: PhotoRoleRecommendation[];
  generatedAt: string;
  source: "groq" | "deterministic_fallback";
}

export type WebsiteSpec = {
  leadId: string;
  businessName: string;
  category: string;
  city: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  mapUrl?: string;
  rating?: number;
  reviewsCount?: number;
  hours?: string[];
  tokens: VisualDesignTokens;
  supportedPages: { id: SupportedPageId; label: string; desc: string }[];
  sections: ComponentBlock[];
  scrapedPhotos: string[];
  curatedStockPhotos: { hero: string; secondary: string[] };
  strategy?: BusinessStrategy;
};

export type VisualRenderSpec = {
  leadId: string;
  pageId: SupportedPageId;
  pageLabel: string;
  device: "desktop" | "mobile";
  aspectRatio: "1:4" | "1:8" | "9:16" | "16:9" | "3:4";
  imageSize: { width: number; height: number };
  visualPrompt: string;
  referenceImages: string[];
  exactText: {
    businessName: string;
    headline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    ratingText?: string;
    reviewCountText?: string;
    sectionHeadings: string[];
  };
  allowedSections: string[];
  designTokens: VisualDesignTokens;
};

export type PreviewGenerationMethod = "direct-image" | "html-screenshot";

export type VisualPreviewAsset = {
  assetId: string;
  leadId: string;
  pageId: SupportedPageId;
  pageLabel: string;
  device: "desktop" | "mobile";
  aspectRatio: string;
  filePath: string;
  publicUrl: string;
  htmlUrl?: string;
  modelUsed: string;
  generationMethod?: PreviewGenerationMethod;
  provider?: string;
  createdAt: string;
  status: "done" | "error";
  error?: string;
  strategy?: BusinessStrategy;
};

export type LeadVisualPreviewSet = {
  leadId: string;
  status: "idle" | "generating" | "completed" | "error";
  designTokens?: VisualDesignTokens;
  strategy?: BusinessStrategy;
  generationMethod?: PreviewGenerationMethod;
  assets: VisualPreviewAsset[];
  lastGeneratedAt?: string;
  error?: string;
};


