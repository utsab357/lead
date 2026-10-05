import type {
  RankedLead,
  WebsiteSpec,
  VisualDesignTokens,
  SupportedPageId,
  ComponentBlock,
  BusinessStrategy,
} from "./types";
import { buildDeterministicBusinessStrategy } from "./businessStrategy";

/**
 * Curated stock photo mappings by business category for hero and showcase.
 */
export function getCategoryHeroPhoto(category: string): string {
  const c = category.toLowerCase();

  if (/gym|fitness|sport|yoga|dance|zumba|aerobic|pilates|crossfit|workout|martial|mma|boxing/.test(c))
    return "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1920&q=85";

  if (/pizza|pizzeria/.test(c))
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1920&q=85";

  if (/restaurant|dining|biryani|dhaba|mughlai|chinese|burger|fast food|eatery|canteen|mess|kitchen|polao|mangsho/.test(c))
    return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=85";

  if (/cafe|coffee|tea|chai|bakery|pastry|dessert|sweet|mithai|snack|brew|restro/.test(c))
    return "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1920&q=85";

  if (/salon|beauty|hair|barber|grooming|makeup|cosmetic|nail|threading|spa|massage|wellness|ayurveda|therapy/.test(c))
    return "https://images.unsplash.com/photo-1560066984-138daaa1183f?auto=format&fit=crop&w=1920&q=85";

  if (/clinic|doctor|physician|medical|hospital|health centre|healthcare|nursing/.test(c))
    return "https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=1920&q=85";

  if (/dental|dentist|orthodontic|teeth/.test(c))
    return "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1920&q=85";

  if (/pharmacy|chemist|medical store|drug store/.test(c))
    return "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1920&q=85";

  if (/school|college|coaching|tuition|academy|institute|university|education|classes|tutorial/.test(c))
    return "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1920&q=85";

  if (/hotel|lodge|resort|guest house|hostel|inn|accommodation|banquet|convention/.test(c))
    return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=85";

  if (/jewel|jewellery|gold|diamond|silver|ornament/.test(c))
    return "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1920&q=85";

  if (/clothing|fashion|boutique|garment|textile|saree|readymade|tailor|apparel/.test(c))
    return "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1920&q=85";

  if (/car|auto|vehicle|motor|garage|workshop|bike|motorcycle|tyre|service centre/.test(c))
    return "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1920&q=85";

  if (/real estate|property|builder|apartment|flat|office space|construction/.test(c))
    return "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1920&q=85";

  if (/tech|software|it company|digital|computer|development|startup|agency/.test(c))
    return "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1920&q=85";

  if (/travel|tour|tourism|holiday|trip|adventure|trekking|safari/.test(c))
    return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1920&q=85";

  if (/event|catering|caterer|wedding|banquet|party|decorator|function|celebration/.test(c))
    return "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1920&q=85";

  if (/law|lawyer|advocate|legal|solicitor|attorney|ca |chartered accountant|accountant|tax|audit/.test(c))
    return "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1920&q=85";

  if (/architect|interior design|interior decorator|design studio|renovation/.test(c))
    return "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1920&q=85";

  if (/hardware|building material|plumbing|electrician|construction supply|paint|cement/.test(c))
    return "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1920&q=85";

  if (/retail|shop|store|supermarket|grocery|departmental|kirana|general store/.test(c))
    return "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1920&q=85";

  return "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1920&q=85";
}

/**
 * Curated category-specific gallery photo sets for businesses without scraped Maps photos.
 * Ensures gyms get gym photos, clinics get clinic photos, hotels get hotel photos, etc.
 */
export function getCategoryGalleryPhotos(category: string): string[] {
  const c = category.toLowerCase();

  // 1. Gym / Fitness / Crossfit / Yoga / Martial Arts
  if (/gym|fitness|sport|yoga|dance|zumba|aerobic|pilates|crossfit|workout|martial|mma|boxing/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 2. Dental Clinic
  if (/dental|dentist|orthodontic|teeth/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 3. Healthcare / Medical Clinic / Hospital
  if (/clinic|doctor|physician|medical|hospital|health centre|healthcare|nursing/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 4. Salon / Beauty / Spa
  if (/salon|beauty|hair|barber|grooming|makeup|cosmetic|nail|threading|spa|massage|wellness|ayurveda|therapy/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1560066984-138daaa1183f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 5. Pizza / Pizzeria
  if (/pizza|pizzeria/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 6. Restaurant / Dining / Biryani / Food
  if (/restaurant|dining|biryani|dhaba|mughlai|chinese|burger|fast food|eatery|canteen|mess|kitchen|polao|mangsho/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 7. Cafe / Coffee / Bakery / Pastry
  if (/cafe|coffee|tea|chai|bakery|pastry|dessert|sweet|mithai|snack|brew|restro/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 8. Hotel / Resort / Lodge
  if (/hotel|lodge|resort|guest house|hostel|inn|accommodation|banquet|convention/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 9. Auto / Car / Garage
  if (/car|auto|vehicle|motor|garage|workshop|bike|motorcycle|tyre|service centre/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 10. Tech / IT / Agency
  if (/tech|software|it company|digital|computer|development|startup|agency/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 11. Travel / Tour
  if (/travel|tour|tourism|holiday|trip|adventure|trekking|safari/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1500835556837-99ac94a94552?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 12. Event / Catering / Wedding
  if (/event|catering|caterer|wedding|banquet|party|decorator|function|celebration/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 13. Law / Accountant / Professional
  if (/law|lawyer|advocate|legal|ca |chartered|accountant|tax|audit/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 14. Architect / Interior Design
  if (/architect|interior design|interior decorator|design studio|renovation/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 15. Hardware / Building Supply
  if (/hardware|building material|plumbing|electrician|construction supply|paint|cement/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 16. Retail / General Store / Supermarket
  if (/retail|shop|store|supermarket|grocery|departmental|kirana|general store/.test(c)) {
    return [
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=800&q=80",
    ];
  }

  // 17. Default / Professional Services
  return [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80",
  ];
}

export function cleanPhone(raw: string | null | undefined): string {
  if (!raw) return "n/a";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12 && digits[2] === "0") return `+91 ${digits.slice(3)}`;
  if (digits.length === 11 && digits[0] === "0") return `+91 ${digits.slice(1)}`;
  if (digits.length === 10) return `+91 ${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+91 ${digits.slice(2)}`;
  return `+91 ${digits}`;
}

export function cleanWaNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return cleanPhone(raw).replace(/[^\d]/g, "");
}

export function normalizeGooglePhotoUrl(url: string): string {
  if (!url || !url.includes("googleusercontent.com")) return url;
  return url
    .replace(/=w\d+-h\d+[^"]*/, "=w1600-h1000-k-no")
    .replace(/=s\d+[^"]*/, "=s1600");
}


/**
 * Deterministic hash from a string → number in [0,1)
 * Used to generate unique-per-business design tokens without randomness.
 */
function deterministicHash(input: string): number {
  let hash = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep unsigned 32-bit
  }
  return hash / 4294967295; // normalize to [0,1)
}

/** Convert HSL to hex color string */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * Category hue ranges — each category gets a specific range of the color wheel.
 * This ensures cafes are always warm, gyms always energetic, salons always luxurious,
 * but EACH INDIVIDUAL business gets a unique hue within that range.
 */
const CATEGORY_HUE_RANGES: Record<string, [number, number]> = {
  cafe:         [18, 42],   // warm oranges to ambers
  restaurant:   [0, 25],    // reds to warm oranges
  pizzeria:     [10, 30],   // tomato red to orange
  bengali:      [28, 50],   // warm amber to golden
  gym:          [0, 20],    // hot reds to orange-red (energy)
  salon:        [270, 310], // purples to magentas (luxury)
  luxury:       [35, 55],   // gold to champagne
  hotel:        [195, 230], // teals to blues (trust)
  clinic:       [170, 210], // green-teals (health)
  dental:       [190, 220], // clean blues
  tech:         [240, 280], // blue-violet to purple
  modern:       [220, 260], // indigo to violet
  education:    [200, 240], // blue range
  pharmacy:     [155, 185], // fresh greens
  jewellery:    [40, 55],   // golden ambers
  clothing:     [290, 340], // rose to magenta
  real_estate:  [210, 240], // professional blues
  auto:         [15, 35],   // orange-red energy
  travel:       [185, 220], // ocean blues to teals
  event:        [290, 330], // vibrant rose to magenta
  legal:        [210, 240], // trust blues
  architect:    [35, 65],   // warm earthy tones
  hardware:     [20, 45],   // industrial orange-amber
  retail:       [160, 200], // fresh greens to teal
  default:      [200, 250], // cool blue range
};

/**
 * Font pairing pool — 8 distinct personalities.
 * Chosen by deterministic hash so each business gets a consistent, unique pair.
 */
const FONT_PAIRINGS = [
  { display: "Playfair Display", body: "Plus Jakarta Sans" },   // editorial warm
  { display: "Outfit", body: "Inter" },                         // modern clean luxury
  { display: "Montserrat", body: "Manrope" },                   // contemporary clean
  { display: "Plus Jakarta Sans", body: "DM Sans" },            // ultra modern geometric
  { display: "Fraunces", body: "Nunito" },                      // organic editorial
  { display: "Urbanist", body: "Plus Jakarta Sans" },           // sleek cafe & lifestyle
  { display: "Lora", body: "Work Sans" },                       // classic warm
  { display: "Space Grotesk", body: "Barlow" },                 // creative modern
];

/**
 * Uniqueness layers per business:
 * 1. Unique primary hue (within category range) derived from business name hash
 * 2. Unique saturation/lightness variation
 * 3. Unique font pairing (8 options)
 * 4. Unique layout variant (A/B/C/D) used by htmlTemplate.ts
 * 5. Dark vs light canvas (some are light cream, some dark, some white)
 */
export function resolveVisualDesignTokens(
  category: string,
  requestedStyle: string = "ai-decides",
  businessId: string = "",
  businessName: string = ""
): VisualDesignTokens {
  const c = category.toLowerCase();
  const seed = businessName + businessId + category;

  // Different hash seeds for different design dimensions
  const h1 = deterministicHash(seed);                  // primary hue
  const h2 = deterministicHash(seed + "_sat");          // saturation shift
  const h3 = deterministicHash(seed + "_font");         // font pair
  const h4 = deterministicHash(seed + "_dark");         // dark vs light canvas
  const h5 = deterministicHash(seed + "_layout");       // layout variant

  // 1. Determine category hue range
  let hueRange: [number, number] = CATEGORY_HUE_RANGES.default;
  let baseVibe = "professional_clean";
  let isDark = h4 < 0.35; // ~35% of businesses get dark canvas

  if (/cafe|coffee|tea|chai|bakery|pastry|dessert|sweet|snack|brew|restro/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.cafe; baseVibe = "warm_earthy"; isDark = false;
  } else if (/restaurant|dining|food|eatery|dhaba|bistro|canteen|kitchen/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.restaurant; baseVibe = "warm_earthy"; isDark = h4 < 0.3;
  } else if (/pizza|pizzeria/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.pizzeria; baseVibe = "bold_energy"; isDark = false;
  } else if (/biryani|bengali|polao|mangsho|mughlai|thali/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.bengali; baseVibe = "warm_earthy"; isDark = h4 < 0.4;
  } else if (/gym|fitness|crossfit|workout|martial|mma|boxing|sport/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.gym; baseVibe = "bold_energy"; isDark = h4 < 0.6;
  } else if (/salon|beauty|hair|barber|grooming|makeup|cosmetic|nail|threading|spa|massage|wellness/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.salon; baseVibe = "dark_luxury"; isDark = h4 < 0.5;
  } else if (/hotel|resort|lodge|guest house/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.hotel; baseVibe = "dark_luxury"; isDark = h4 < 0.4;
  } else if (/jewel|jewellery|gold|diamond|silver|ornament/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.jewellery; baseVibe = "dark_luxury"; isDark = h4 < 0.5;
  } else if (/clinic|doctor|physician|medical|hospital|health/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.clinic; baseVibe = "professional_clean"; isDark = false;
  } else if (/dental|dentist|teeth|orthodontic/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.dental; baseVibe = "professional_clean"; isDark = false;
  } else if (/tech|software|it|digital|startup|agency|media/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.tech; baseVibe = "sleek_modern"; isDark = h4 < 0.65;
  } else if (/school|college|coaching|tuition|academy|education/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.education; baseVibe = "professional_clean"; isDark = false;
  } else if (/pharmacy|chemist|medical store/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.pharmacy; baseVibe = "professional_clean"; isDark = false;
  } else if (/clothing|fashion|boutique|garment|saree|apparel/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.clothing; baseVibe = "dark_luxury"; isDark = h4 < 0.45;
  } else if (/real estate|property|builder|apartment/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.real_estate; baseVibe = "professional_clean"; isDark = h4 < 0.3;
  } else if (/car|auto|vehicle|motor|garage|bike/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.auto; baseVibe = "bold_energy"; isDark = h4 < 0.5;
  } else if (/travel|tour|tourism|holiday|trip|adventure|trekking/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.travel; baseVibe = "sleek_modern"; isDark = h4 < 0.4;
  } else if (/event|catering|caterer|wedding|banquet|party|decorator|celebration/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.event; baseVibe = "dark_luxury"; isDark = h4 < 0.5;
  } else if (/law|lawyer|advocate|legal|solicitor|ca |chartered|accountant|tax|audit/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.legal; baseVibe = "professional_clean"; isDark = false;
  } else if (/architect|interior design|interior decorator|design studio|renovation/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.architect; baseVibe = "warm_earthy"; isDark = h4 < 0.35;
  } else if (/hardware|building material|plumbing|electrician|construction supply|paint|cement/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.hardware; baseVibe = "bold_energy"; isDark = false;
  } else if (/retail|shop|store|supermarket|grocery|departmental|kirana|general store/.test(c)) {
    hueRange = CATEGORY_HUE_RANGES.retail; baseVibe = "professional_clean"; isDark = false;
  }

  // 2. Generate unique primary hue within range
  const [hMin, hMax] = hueRange;
  const hueSpan = hMax > hMin ? hMax - hMin : (360 - hMin + hMax);
  let primaryHue = hMin + h1 * hueSpan;
  if (primaryHue >= 360) primaryHue -= 360;

  // 3. Unique saturation — vary between 55% and 85%
  const primarySat = Math.round(55 + h2 * 30);

  // 4. Primary color lightness
  const primaryL = isDark ? Math.round(52 + h2 * 14) : Math.round(42 + h2 * 16);
  const primaryColor = hslToHex(primaryHue, primarySat, primaryL);

  // 5. Secondary color — complementary/analogous (30-50° away)
  const secondaryHue = (primaryHue + 28 + h2 * 22) % 360;
  const secondaryColor = hslToHex(secondaryHue, Math.round(primarySat - 10), primaryL + 12);

  // 6. Dark color — very dark version of the primary hue
  const darkColor = isDark
    ? hslToHex(primaryHue, Math.round(primarySat * 0.4), 6)   // near black with hue tint
    : hslToHex(primaryHue, Math.round(primarySat * 0.6), 12); // dark with hue tint

  // 7. Canvas (page background)
  const canvasColor = isDark
    ? hslToHex(primaryHue, Math.round(primarySat * 0.35), 8)
    : hslToHex(primaryHue, Math.round(primarySat * 0.12), 97); // very light tint of primary

  // 8. Surface (cards)
  const surfaceColor = isDark
    ? hslToHex(primaryHue, Math.round(primarySat * 0.3), 13)
    : hslToHex(primaryHue, Math.round(primarySat * 0.08), 99);

  // 9. Pick unique font pair
  const fontIndex = Math.floor(h3 * FONT_PAIRINGS.length);
  const fonts = FONT_PAIRINGS[fontIndex];

  // 10. Layout variant A/B/C/D (used by htmlTemplate.ts)
  const layoutVariants = ["A", "B", "C", "D"] as const;
  const layoutVariant = layoutVariants[Math.floor(h5 * 4)];

  const result = {
    vibe: baseVibe as any,
    primaryColor,
    secondaryColor,
    darkColor,
    surfaceColor,
    canvasColor,
    displayFont: fonts.display,
    bodyFont: fonts.body,
    borderRadius: isDark ? "12px" : "20px",
    navStyle: "floating_pill",
    buttonStyle: "rounded_pill",
    cardStyle: isDark ? "glassmorphism" : "soft_bordered",
    spacingDensity: "comfortable",
    imageTreatment: isDark ? "dark_overlay" : "warm_rounded",
    decorativeStyle: "minimal",
  } as VisualDesignTokens;

  // Attach layout variant metadata (used by htmlTemplate.ts)
  (result as any).layoutVariant = layoutVariant;
  (result as any).isDark = isDark;
  return result;
}




/**
 * Constructs the WebsiteSpec representation.
 * Ingests BusinessStrategy to tailor offerings, CTAs, headings, and section sequence.
 * Canonical single source of truth for both Website Compiler and Visual Renderer.
 */
export function buildWebsiteSpec(
  lead: RankedLead,
  requestedStyle: string = "ai-decides",
  businessStrategy?: BusinessStrategy
): WebsiteSpec {
  const strategy = businessStrategy || buildDeterministicBusinessStrategy(lead);
  const chosenStyle = requestedStyle !== "ai-decides" ? requestedStyle : strategy.visualDirection.vibeId;
  const tokens = resolveVisualDesignTokens(lead.category, chosenStyle, lead.id, lead.name);
  const city = lead.city?.split(",")[0] || "Your City";
  const phone = cleanPhone(lead.phone);
  const waNumber = cleanWaNumber(lead.whatsapp ?? lead.phone);
  const waLink = `https://wa.me/${waNumber}?text=Hello%20${encodeURIComponent(lead.name)}`;
  const heroPhoto = getCategoryHeroPhoto(lead.category);

  const photoUrls = (lead.photoUrls ?? []).map(normalizeGooglePhotoUrl);
  const primaryScrapedPhoto = photoUrls[0] || heroPhoto;

  const realReviews = (lead.reviews ?? [])
    .filter((r) => r.rating >= 4)
    .slice(0, 3)
    .map((r) => ({
      author: r.author.split(/\d/)[0].trim(),
      text: r.text.slice(0, 150),
      rating: r.rating,
      avatarUrl: undefined,
    }));

  const ratingVal = lead.rating ? Number(lead.rating.toFixed(1)) : 4.8;
  const reviewCountVal = lead.reviewsCount || 150;

  // Determine CTA labels based on primary conversion goal
  let primaryCtaText = "Chat on WhatsApp →";
  let secondaryCtaText = "Call Now";

  switch (strategy.primaryConversionGoal) {
    case "whatsapp_delivery":
      primaryCtaText = "Order on WhatsApp →";
      secondaryCtaText = "Call for Delivery";
      break;
    case "table_reservation":
      primaryCtaText = "Reserve a Table →";
      secondaryCtaText = "View Menu";
      break;
    case "appointment_booking":
      primaryCtaText = "Book Appointment →";
      secondaryCtaText = "Call Direct";
      break;
    case "in_store_visit":
      primaryCtaText = "Get Directions →";
      secondaryCtaText = "WhatsApp Us";
      break;
    case "direct_call_enquiry":
      primaryCtaText = "Call Now";
      secondaryCtaText = "WhatsApp Enquiry";
      break;
  }

  // Determine headlines influenced by strategy
  const defaultHeadline =
    strategy.subCategory.value === "bengali_heritage_restaurant"
      ? `Authentic Bengali Feasts & Signature Polao Mangsho in ${city}`
      : strategy.subCategory.value === "pizzeria"
      ? `Artisan Stone-Baked Pizzas in ${city}`
      : strategy.subCategory.value === "specialty_cafe"
      ? `Artisanal Coffee & Cozy Atmosphere in ${city}`
      : strategy.subCategory.value === "strength_hardcore_gym"
      ? `Elite Training & Fitness Facility in ${city}`
      : strategy.subCategory.value === "dental_clinic"
      ? `Gentle, Advanced Dental Care in ${city}`
      : strategy.subCategory.value === "luxury_salon_spa"
      ? `Premier Luxury Salon & Makeover Experience in ${city}`
      : `Trusted ${lead.category} in ${city}`;

  const heroHeadline =
    strategy.recommendedSections.find((s) => s.sectionId === "hero")?.headlineOverride ||
    defaultHeadline;

  const heroSubtitle =
    strategy.primarySellingPoint?.value ||
    "Dedicated to authentic quality and exceptional service.";

  // Determine supported pages based on subcategory / category
  const supportedPages: { id: SupportedPageId; label: string; desc: string }[] = [
    { id: "home", label: "Home Page", desc: "Full-page flagship landing experience with high-impact hero and trust elements." },
  ];

  if (
    strategy.subCategory.value.includes("restaurant") ||
    strategy.subCategory.value.includes("pizzeria") ||
    strategy.subCategory.value.includes("cafe") ||
    strategy.subCategory.value.includes("dining")
  ) {
    supportedPages.push(
      { id: "menu", label: "Our Menu", desc: "Explore our signature dishes, specialties, and fresh selections." },
      { id: "about", label: "About Us", desc: "Our story, dedication, and culinary passion." },
      { id: "gallery", label: "Gallery", desc: "Atmosphere, seating, and culinary highlights." },
      { id: "contact", label: "Find Us", desc: "Location, hours, directions, and instant WhatsApp booking." }
    );
  } else if (strategy.subCategory.value.includes("gym")) {
    supportedPages.push(
      { id: "services", label: "Training Programs", desc: "Strength, cardio, functional fitness, and personal coaching." },
      { id: "about", label: "Our Mission", desc: "Elite coaching, Olympic-grade equipment, and member community." },
      { id: "gallery", label: "Facility Gallery", desc: "Training zones, equipment, and member transformations." },
      { id: "booking", label: "Free Day Pass", desc: "Claim an introductory session and consultation." }
    );
  } else {
    supportedPages.push(
      { id: "services", label: "What We Offer", desc: "Core services and professional solutions for clients." },
      { id: "about", label: "About Us", desc: "Our commitment to quality, trust, and client satisfaction." },
      { id: "gallery", label: "Showcase", desc: "Photos of work, facilities, and client experiences." },
      { id: "contact", label: "Contact Us", desc: "Direct phone, hours, and interactive directions." }
    );
  }

  // Build ComponentBlocks dynamically influenced by strategy
  const sections: ComponentBlock[] = [];
  const omittedIds = new Set(strategy.omittedSections.map((o) => o.sectionId));

  // 1. Navbar
  sections.push({
    type: "navbar",
    style: "floating_pill",
    brand: lead.name,
    links: ["Home", "About", "Offerings", "Gallery", "Contact"],
    ctaText: primaryCtaText.replace(" →", ""),
    statusBadge: "● Open Now",
  });

  // 2. Hero
  sections.push({
    type: "hero",
    headline: heroHeadline,
    subtitle: heroSubtitle,
    bgImageUrl: heroPhoto,
    ratingChip: `★ ${ratingVal} • ${reviewCountVal}+ Google Reviews`,
    ctaPrimary: primaryCtaText,
    ctaSecondary: secondaryCtaText,
    scrollIndicator: "Scroll to Explore",
  });

  // 3. Trust Bar
  if (!omittedIds.has("trust_bar")) {
    sections.push({
      type: "trust_bar",
      ratingText: `${ratingVal} ★ Google Rating`,
      reviewsText: `${reviewCountVal}+ Real Customer Reviews`,
      highlightScript: `Loved in ${city} 🌿`,
      bgColor: tokens.darkColor,
    });
  }

  // 4. Dynamic Signature Offerings / Catalog (Evidence-backed)
  if (!omittedIds.has("signature_offerings")) {
    const offeringsTitle =
      strategy.subCategory.value.includes("pizzeria")
        ? "Handcrafted Pizzas & Specialties"
        : strategy.subCategory.value.includes("bengali")
        ? "Signature Pulao & Meat Combos"
        : strategy.subCategory.value.includes("cafe")
        ? "Artisanal Coffee & Fresh Bakes"
        : strategy.subCategory.value.includes("gym")
        ? "Elite Training Programs"
        : strategy.subCategory.value.includes("clinic")
        ? "Specialized Care & Treatments"
        : strategy.subCategory.value.includes("salon")
        ? "Signature Salon Services"
        : "Our Signature Offerings";

    const offeringsTag =
      strategy.subCategory.value.includes("restaurant") ||
      strategy.subCategory.value.includes("pizzeria") ||
      strategy.subCategory.value.includes("cafe")
        ? "OUR MENU"
        : strategy.subCategory.value.includes("gym")
        ? "TRAINING PROGRAMS"
        : "OUR SERVICES";

    const categoryDefaults = getCategoryGalleryPhotos(lead.category);
    const offeringItems =
      strategy.actualOfferings.length > 0
        ? strategy.actualOfferings.map((o, idx) => ({
            title: o.name,
            desc: o.description || (o.evidenceQuote ? `"${o.evidenceQuote.slice(0, 70)}..."` : undefined),
            imageUrl: photoUrls[idx] || categoryDefaults[idx % categoryDefaults.length] || heroPhoto,
          }))
        : [
            { title: "Signature Specialty", imageUrl: heroPhoto },
            { title: "Client Favorite", imageUrl: categoryDefaults[1] || heroPhoto },
            { title: "Premium Quality Offering", imageUrl: categoryDefaults[2] || heroPhoto },
          ];

    sections.push({
      type: "visual_grid",
      tag: offeringsTag,
      title: offeringsTitle,
      subtitle: `Explore verified specialties curated with exceptional quality at ${lead.name}.`,
      ctaText: primaryCtaText,
      columns: offeringItems.length >= 6 ? 6 : 3,
      items: offeringItems,
    });
  }

  // 5. Delivery or Booking CTA Banner (if recommended by strategy)
  if (strategy.primaryConversionGoal === "whatsapp_delivery" && !omittedIds.has("delivery_cta")) {
    sections.push({
      type: "cta_banner",
      tag: "ONLINE ORDERING",
      title: `Fast WhatsApp Delivery Across ${city}`,
      subtitle: `Craving ${strategy.actualOfferings[0]?.name || "fresh food"}? Order directly on WhatsApp for prompt service.`,
      ctaText: "Order on WhatsApp →",
      ctaUrl: waLink,
    });
  } else if (strategy.primaryConversionGoal === "appointment_booking" && !omittedIds.has("booking_cta")) {
    sections.push({
      type: "cta_banner",
      tag: "INSTANT BOOKING",
      title: `Book Your Appointment in ${city}`,
      subtitle: `Schedule your preferred time slot directly with our team.`,
      ctaText: "Book Appointment →",
      ctaUrl: waLink,
    });
  }

  // 6. About Us
  if (!omittedIds.has("about_story")) {
    const narrative = lead.about
      ? lead.about.slice(0, 300)
      : strategy.secondarySellingPoints.length > 0
      ? `${lead.name} is a renowned ${lead.category} in ${city}. ${strategy.primarySellingPoint.value}. ${strategy.secondarySellingPoints.slice(0, 2).join(". ")}.`
      : `${lead.name} is dedicated to serving the ${city} community with exceptional service, quality craftsmanship, and trusted customer care.`;

    sections.push({
      type: "about",
      tag: "ABOUT US",
      title: `Experience ${lead.name}`,
      narrative,
      imageUrl: primaryScrapedPhoto,
      badgeText: `🌿 Trusted in ${city}`,
      ctaText: primaryCtaText,
    });
  }

  // 7. Highlights (if not omitted)
  if (!omittedIds.has("highlights")) {
    sections.push({
      type: "highlights",
      tag: "WHY CHOOSE US",
      title: "What Sets Us Apart",
      cards: [
        { icon: "✦", title: "Verified Quality", desc: strategy.secondarySellingPoints[0] || "Committed to the highest service standards.", isHighlighted: true },
        { icon: "★", title: "Top Reputation", desc: `${ratingVal} ★ rating backed by ${reviewCountVal}+ real customer reviews.` },
        { icon: "📍", title: "Prime Location", desc: `Centrally situated in ${city} for easy convenience.` },
        { icon: "💬", title: "Direct Communication", desc: "Instant response and support via WhatsApp and phone." },
      ],
    });
  }

  // 8. Gallery
  if (!omittedIds.has("gallery")) {
    const categoryGalleryDefaults = getCategoryGalleryPhotos(lead.category);
    const galleryPhotos =
      photoUrls.length > 1
        ? photoUrls.slice(1, 5)
        : categoryGalleryDefaults;

    sections.push({
      type: "gallery",
      tag: "GALLERY",
      title: `A Glimpse of ${lead.name}`,
      ctaText: "View More Photos →",
      imageUrls: galleryPhotos,
    });
  }

  // 9. Customer Reviews
  if (!omittedIds.has("reviews")) {
    sections.push({
      type: "reviews",
      tag: "CUSTOMER REVIEWS",
      title: "What Our Clients Say",
      cards:
        realReviews.length > 0
          ? realReviews
          : [
              { author: "Priya S.", text: "Exceptional experience! High quality and friendly service.", rating: 5 },
              { author: "Rohit M.", text: `Best ${lead.category} in ${city}. Highly recommended.`, rating: 5 },
              { author: "Sneha K.", text: "Truly wonderful service and great hospitality.", rating: 5 },
            ],
    });
  }

  // 10. Location & Contact
  sections.push({
    type: "location",
    tag: "VISIT US",
    title: `Find Us in ${city}`,
    address: lead.address || `${city}, West Bengal`,
    hours: lead.hours?.[0] || "Open Now: Mon - Sun 11:00 AM - 11:00 PM",
    ctaMap: "Get Directions →",
    ctaCall: "Call Now",
    mapType: "vector_svg",
  });

  // 11. Footer
  sections.push({
    type: "footer",
    brand: lead.name,
    links: ["Home", "About", "Offerings", "Gallery", "Contact"],
    copyright: `© 2026 ${lead.name}. All Rights Reserved.`,
    waFloating: true,
  });

  return {
    leadId: lead.id,
    businessName: lead.name,
    category: lead.category,
    city,
    address: lead.address,
    phone,
    whatsapp: waLink,
    mapUrl: lead.mapUrl ?? `https://maps.google.com/?q=${encodeURIComponent(lead.name + " " + city)}`,
    rating: lead.rating,
    reviewsCount: lead.reviewsCount,
    hours: lead.hours,
    tokens,
    supportedPages,
    sections,
    scrapedPhotos: photoUrls,
    curatedStockPhotos: {
      hero: heroPhoto,
      secondary: photoUrls.slice(1, 5),
    },
    strategy,
  };
}

/**
 * Transforms a WebsiteSpec into the exact Markdown compiler prompt required by
 * the code-generation workflow. Dynamically incorporates BusinessStrategy offerings,
 * custom section sequence, and customized hero messaging.
 */
export function specToCompilerMarkdown(spec: WebsiteSpec): string {
  const city = spec.city;
  const ratingStr = spec.rating ? `${spec.rating.toFixed(1)} ★` : "4.8 ★";
  const reviewCountStr = spec.reviewsCount ? `${spec.reviewsCount}+` : "150+";
  const waLink = spec.whatsapp || "#";
  const telLink = spec.phone ? `tel:${spec.phone.replace(/\s/g, "")}` : "#";

  const heroBlock = spec.sections.find((s) => s.type === "hero") as any;
  const gridBlock = spec.sections.find((s) => s.type === "visual_grid") as any;
  const aboutBlock = spec.sections.find((s) => s.type === "about") as any;
  const ctaBannerBlock = spec.sections.find((s) => s.type === "cta_banner") as any;

  const headline = heroBlock?.headline || `Trusted ${spec.category} in ${city}`;
  const subtitle = heroBlock?.subtitle || "Dedicated to authentic quality and exceptional service.";
  const ctaPrimary = heroBlock?.ctaPrimary || "Chat on WhatsApp →";
  const ctaSecondary = heroBlock?.ctaSecondary || "Call Now";

  // Section list in order
  let sectionIndex = 1;
  const sectionListMarkdown: string[] = [];

  for (const block of spec.sections) {
    if (block.type === "navbar") {
      sectionListMarkdown.push(`### ${sectionIndex++}. FLOATING GLASS PILL NAVBAR
- Centered floating glass pill: max-w-4xl mx-auto px-6 py-2.5 rounded-full bg-white/90 backdrop-blur-md border border-[#F0E0D0] flex items-center justify-between shadow-sm sticky top-4 z-50.
- Brand name as stylized wordmark: "${spec.businessName}".
- Nav links (hidden on mobile, visible md+): Home, About, Offerings, Gallery, Contact.
- Status badge: "● Open Now" (emerald pulsing dot).
- Action CTA: Pill button <a href="${waLink}">${ctaPrimary.replace(" →", "")}</a>.
- NO mobile hamburger overlays, drawer panels, or checkbox menus!`);
    } else if (block.type === "hero") {
      sectionListMarkdown.push(`### ${sectionIndex++}. HERO SECTION (100dvh)
- Background: ${spec.curatedStockPhotos.hero} (full-bleed, rich multi-stop overlay).
- Top frosted pill chip: "★ ${ratingStr} • ${reviewCountStr} Google Reviews".
- H1: Bold typography: "${headline}".
- Subtitle: "${subtitle}".
- Dual CTA Buttons: ${ctaPrimary} (<a href="${waLink}">) + ${ctaSecondary} (<a href="${telLink}">).
- Scroll indicator: "Scroll to Explore" with circular down-chevron icon.
- Bottom organic curved wave divider connecting smoothly to the cream section below.`);
    } else if (block.type === "trust_bar") {
      sectionListMarkdown.push(`### ${sectionIndex++}. FLOATING DARK TRUST BAR
- Floating dark pill bar overlapping the bottom seam of the hero:
  bg-[${spec.tokens.darkColor}] text-white rounded-full py-3.5 px-8 max-w-4xl mx-auto shadow-2xl flex flex-wrap items-center justify-center gap-6.
- Static values: ${ratingStr} Google Rating | ${reviewCountStr} Real Customer Reviews | Loved by Clients in ${city} 🌿.`);
    } else if (block.type === "visual_grid") {
      const itemsText = (block.items || [])
        .map(
          (item: any, i: number) =>
            `  ${i + 1}. ${item.title}${item.desc ? ` (${item.desc})` : ""}: ${item.imageUrl || spec.curatedStockPhotos.hero}`
        )
        .join("\n");

      sectionListMarkdown.push(`### ${sectionIndex++}. ${block.tag.toUpperCase()} — ${block.title.toUpperCase()}
- Header: Tag: "${block.tag}", Heading: "${block.title}", Subtitle: "${block.subtitle}", Action button: <a href="${waLink}">${ctaPrimary}</a>
- ${block.items?.length || 3} visual cards (grid grid-cols-2 md:grid-cols-3 ${block.columns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-3"} gap-4):
${itemsText}`);
    } else if (block.type === "cta_banner") {
      sectionListMarkdown.push(`### ${sectionIndex++}. ${block.tag.toUpperCase()} — ${block.title.toUpperCase()}
- High-conversion banner: bg-[${spec.tokens.primaryColor}] text-white rounded-3xl p-8 lg:p-12 text-center max-w-5xl mx-auto shadow-xl my-12.
- Tag: "${block.tag}"
- Heading: "${block.title}"
- Subtitle: "${block.subtitle}"
- Direct Action Button: <a href="${block.ctaUrl}" class="bg-white text-[${spec.tokens.darkColor}] px-8 py-3 rounded-full font-bold shadow-md hover:bg-neutral-100">${block.ctaText}</a>`);
    } else if (block.type === "about") {
      sectionListMarkdown.push(`### ${sectionIndex++}. ABOUT US (${spec.businessName.toUpperCase()})
- Background: ${spec.tokens.canvasColor}, text: ${spec.tokens.darkColor}.
- Narrative: "${block.narrative || `${spec.businessName} is dedicated to serving ${city} with trusted quality.`}"
- Photo: <img src="${block.imageUrl || spec.scrapedPhotos[0] || spec.curatedStockPhotos.hero}" class="rounded-2xl shadow-lg object-cover w-full h-[320px]">
- Badge: "${block.badgeText || `🌿 Trusted in ${city}`}".`);
    } else if (block.type === "highlights") {
      sectionListMarkdown.push(`### ${sectionIndex++}. HIGHLIGHTS — WHAT SETS US APART
- 4 benefit cards showcasing quality, verified reputation, prime location, and dedicated customer care.`);
    } else if (block.type === "gallery") {
      sectionListMarkdown.push(`### ${sectionIndex++}. GALLERY — A GLIMPSE OF ${spec.businessName.toUpperCase()}
- 4 wide ambient photos in a row.`);
    } else if (block.type === "reviews") {
      sectionListMarkdown.push(`### ${sectionIndex++}. CUSTOMER REVIEWS — WHAT OUR CLIENTS SAY
- 3 clean review cards with 5 stars, real reviews, and reviewer avatars.`);
    } else if (block.type === "location") {
      sectionListMarkdown.push(`### ${sectionIndex++}. VISIT US — FIND US IN ${city.toUpperCase()}
- Dark container: bg-[#1D2E24] text-white rounded-3xl p-8 lg:p-10 shadow-xl grid md:grid-cols-2 gap-8 items-center.
- Address: "${spec.address || city}".
- Hours: "${spec.hours?.[0] || "Open Now: Mon - Sun 11:00 AM - 11:00 PM"}".
- Visual Google Maps preview card: styled vector map graphic with street lines, park patches, and red location pin badge.`);
    } else if (block.type === "footer") {
      sectionListMarkdown.push(`### ${sectionIndex++}. 2026 AGENCY FOOTER & FLOATING WHATSAPP
- Minimalist dark footer with quick links, copyright © 2026 ${spec.businessName}, and floating WhatsApp button.`);
    }
  }

  const galleryPhotos = getCategoryGalleryPhotos(spec.category);
  const photoList = spec.scrapedPhotos.length > 0
    ? spec.scrapedPhotos.slice(0, 5).map((u, i) => `  Photo ${i + 1}: ${u}`).join("\n")
    : galleryPhotos.slice(0, 4).map((u, i) => `  Photo ${i + 1}: ${u}`).join("\n");

  return `You are an elite frontend engineer. Build a COMPLETE, production-ready, single-file HTML5 website.

CRITICAL - READ FIRST:
- The COLOR PALETTE below is MANDATORY. Do NOT use blue #1E3A8A or #2563EB. Use ONLY the hex codes listed.
- Output MUST be a FULL website. Minimum 8 complete sections. Minimum 25KB of HTML. Short output = FAILURE.
- Every business must look completely different. Use the unique colors, fonts, and photos provided.

BUSINESS: ${spec.businessName}
TYPE: ${spec.category} | CITY: ${spec.city}

MANDATORY COLOR PALETTE - USE ONLY THESE HEX CODES:
  Page background: ${spec.tokens.canvasColor}
  Cards/panels: ${spec.tokens.surfaceColor}
  PRIMARY color: ${spec.tokens.primaryColor}
  SECONDARY color: ${spec.tokens.secondaryColor}
  Dark (text/footer): ${spec.tokens.darkColor}
  Design vibe: ${spec.tokens.vibe.replace(/_/g, " ")}
  Heading font: ${spec.tokens.displayFont}
  Body font: ${spec.tokens.bodyFont}

HERO IMAGE (use as CSS background-image on the full-viewport hero section):
  ${spec.curatedStockPhotos.hero}

BUSINESS PHOTOS (use in gallery, about, offerings sections):
${photoList}

CONTACT:
  Phone: ${spec.phone}  WhatsApp: ${waLink}  Maps: ${spec.mapUrl}
  Address: ${spec.address || spec.city}
  Rating: ${ratingStr} (${reviewCountStr} reviews)

SECTIONS TO BUILD (ALL required):
${sectionListMarkdown.join("\n\n")}

TECHNICAL REQUIREMENTS:
1. Single HTML5 file starting with <!DOCTYPE html>
2. Include: <script src="https://cdn.tailwindcss.com"></script>
3. Right after CDN, add Tailwind config:
   <script>tailwind.config={theme:{extend:{colors:{primary:'${spec.tokens.primaryColor}',secondary:'${spec.tokens.secondaryColor}',dark:'${spec.tokens.darkColor}',surface:'${spec.tokens.surfaceColor}',canvas:'${spec.tokens.canvasColor}'}}}}</script>
4. Add <style> block with inline CSS fallback (loads before Tailwind):
   <style>
   *,*::before,*::after{box-sizing:border-box}
   html{scroll-behavior:smooth}
   body{background:${spec.tokens.canvasColor};color:${spec.tokens.darkColor};font-family:'${spec.tokens.bodyFont}',system-ui,sans-serif;margin:0}
   h1,h2,h3,h4{font-family:'${spec.tokens.displayFont}',Georgia,serif}
   a{text-decoration:none}
   .btn-primary{background:${spec.tokens.primaryColor};color:#fff;padding:14px 32px;border-radius:999px;font-weight:700;display:inline-block;transition:opacity .2s}
   .btn-primary:hover{opacity:.85}
   .card{background:${spec.tokens.surfaceColor};border-radius:16px;overflow:hidden;transition:transform .25s,box-shadow .25s}
   .card:hover{transform:translateY(-5px);box-shadow:0 24px 48px rgba(0,0,0,.12)}
   .tag{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${spec.tokens.primaryColor};display:block;margin-bottom:12px}
   .wa-fab{position:fixed;bottom:28px;right:28px;z-index:9999;background:#25D366;border-radius:50%;width:60px;height:60px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(37,211,102,.5)}
   </style>
5. Import Google Fonts: ${spec.tokens.displayFont} and ${spec.tokens.bodyFont}
6. HERO section: 100dvh, use hero image as CSS background-image, dark gradient overlay
7. Write "${ratingStr}" and "${reviewCountStr}" directly in HTML. NO countUp JS showing "0"
8. Floating WhatsApp button: fixed bottom-right, always visible, link: ${waLink}
9. Mobile responsive: 375px to 1440px. No horizontal scroll.
10. ALL content visible by default. No opacity:0 or hidden scroll-reveal on sections.
11. Dark section text = white. Light section text = ${spec.tokens.darkColor}. Never white text on light background.

Output ONLY the complete HTML starting with <!DOCTYPE html>. No markdown. No explanation.`;
}


/**
 * Convenience canonical buildPrompt function.
 */

export function buildPrompt(
  lead: RankedLead,
  style: string = "ai-decides",
  businessStrategy?: BusinessStrategy
): string {
  const spec = buildWebsiteSpec(lead, style, businessStrategy);
  return specToCompilerMarkdown(spec);
}


