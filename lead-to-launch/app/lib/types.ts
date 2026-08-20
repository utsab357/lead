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
  | "closed"
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
  /** Pipeline status per lead — { [leadId]: LeadStatus } */
  leadStatuses?: Record<string, LeadStatus>;
  /** Freeform notes per lead — { [leadId]: string } */
  leadNotes?: Record<string, string>;
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
  callScript?: {
    opener: string;
    keyPoints: string[];
    objectionHandler: string;
    closer: string;
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

export type BuildPromptResult = {
  prompt: string;
  pitchPoints: string[];
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
