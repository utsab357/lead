import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScrapeSession, Lead } from "@/lib/types";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

export const DEFAULT_CAFE_UTSAB_SESSION: ScrapeSession = {
  id: "session-cafe-utsab-test",
  niche: "Cafe & Restaurant",
  city: "Barasat, West Bengal",
  timestamp: "2026-10-05T15:30:00.000Z",
  leadsCount: 1,
  noWebsiteCount: 1,
  withPhoneCount: 1,
  expandedTerms: ["cafe", "coffee shop", "bistro", "bakery"],
  leads: [
    {
      id: "lead-cafe-utsab",
      name: "Cafe Utsab",
      category: "Cafe & Restaurant",
      address: "Station Road, Champadali More, Barasat, Kolkata, West Bengal 700124",
      city: "Barasat",
      phone: "9064970761",
      whatsapp: "9064970761",
      email: "cafeutsab@gmail.com",
      website: "",
      mapUrl: "https://maps.google.com/?q=Cafe+Utsab+Barasat",
      rating: 4.7,
      reviewsCount: 182,
      lat: 22.723,
      lng: 88.481,
      priceLevel: "₹₹",
      about: "Barasat's favorite spot for artisanal coffee, handcrafted burgers, woodfired pizzas, and gourmet bakery items. Cozy ambiance with free Wi-Fi.",
      hours: [
        "Monday: 10:00 AM – 10:30 PM",
        "Tuesday: 10:00 AM – 10:30 PM",
        "Wednesday: 10:00 AM – 10:30 PM",
        "Thursday: 10:00 AM – 10:30 PM",
        "Friday: 10:00 AM – 11:00 PM",
        "Saturday: 10:00 AM – 11:00 PM",
        "Sunday: 10:00 AM – 11:00 PM"
      ],
      services: [
        "Artisanal Espresso & Cold Brew",
        "Gourmet Burgers & Sandwiches",
        "Thin Crust Woodfired Pizza",
        "Fresh Pastries & Desserts",
        "Dine-in & Takeaway",
        "Private Birthday Parties"
      ],
      photoUrls: [
        "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80",
        "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80",
        "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&q=80"
      ],
      reviews: [
        {
          author: "Anirban Mukherjee",
          rating: 5,
          timeAgo: "2 weeks ago",
          text: "The hazelnut cappuccino and peri-peri burger are top notch! Cozy ambiance, great music. Only complaint is they don't have an online menu or website to reserve tables."
        },
        {
          author: "Priyanka Roy",
          rating: 4,
          timeAgo: "1 month ago",
          text: "Best cafe in Barasat for evening hangouts with friends. Would love if they had an online website so we could check their weekly dessert specials and order directly."
        },
        {
          author: "Subhajit Das",
          rating: 5,
          timeAgo: "3 weeks ago",
          text: "Superb coffee taste. Staff is very polite. If you are near Station road or Champadali, definitely visit!"
        }
      ],
      source: "Google Maps"
    }
  ],
  audits: {},
  ranked: [],
  conversions: {},
  outreachResults: {},
  buildPrompts: {},
  visualPreviews: {},
  leadStatuses: {},
  leadNotes: {},
  clientDetails: {}
};

async function ensureDir() {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch {
    /* ok */
  }
}

/** GET — list all saved sessions (metadata only, no leads array for speed) */
export async function GET() {
  await ensureDir();
  try {
    const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));

    const LEGACY_OLD_FILES = new Set([
      "session-1787916767589.json",
      "session-1788775790274.json",
      "session-1788868017636.json",
      "session-1790905938840.json",
      "session-1790905938843.json",
    ]);

    // Automatically remove known legacy files or empty/corrupt files
    for (const file of files) {
      if (LEGACY_OLD_FILES.has(file)) {
        try {
          await fs.unlink(path.join(SESSIONS_DIR, file));
        } catch {
          /* ignore */
        }
      }
    }

    // Ensure Cafe Utsab test session exists as seed if no sessions exist
    const utsabPath = path.join(SESSIONS_DIR, "session-cafe-utsab-test.json");
    try {
      await fs.access(utsabPath);
    } catch {
      await fs.writeFile(utsabPath, JSON.stringify(DEFAULT_CAFE_UTSAB_SESSION, null, 2), "utf-8");
    }

    const cleanFiles = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));
    const sessions: Omit<ScrapeSession, "leads">[] = [];

    for (const file of cleanFiles) {
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf-8");
        const s: ScrapeSession = JSON.parse(raw);
        if (!s.id || !s.niche || !s.leadsCount) continue;
        sessions.push({
          id: s.id,
          niche: s.niche,
          city: s.city,
          timestamp: s.timestamp,
          leadsCount: s.leadsCount,
          noWebsiteCount: s.noWebsiteCount,
          withPhoneCount: s.withPhoneCount,
          expandedTerms: s.expandedTerms,
        });
      } catch {
        /* skip corrupt */
      }
    }

    sessions.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
    return NextResponse.json({ sessions });
  } catch (e) {
    console.error("[sessions GET] error:", e);
    return NextResponse.json({ sessions: [] });
  }
}

/** POST — create a new session (for manually added leads) */
export async function POST(req: Request) {
  await ensureDir();
  try {
    const body = (await req.json()) as { leads: Lead[]; niche?: string; city?: string };
    const leads = body.leads ?? [];
    const niche = body.niche ?? "manual";
    const city = body.city ?? leads[0]?.city ?? "mixed";

    const id = `session-${Date.now()}`;
    const session: ScrapeSession = {
      id,
      niche,
      city,
      timestamp: new Date().toISOString(),
      leadsCount: leads.length,
      noWebsiteCount: leads.filter((l) => !l.website).length,
      withPhoneCount: leads.filter((l) => !!l.phone).length,
      expandedTerms: [],
      leads,
      audits: {},
      ranked: [],
      conversions: {},
      outreachResults: {},
      buildPrompts: {},
      visualPreviews: {},
      leadStatuses: {},
      leadNotes: {},
      clientDetails: {},
    };

    await fs.writeFile(
      path.join(SESSIONS_DIR, `${id}.json`),
      JSON.stringify(session, null, 2),
      "utf-8"
    );
    return NextResponse.json({ sessionId: id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE — remove a session by ID or 'all' */
export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json()) as { id: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (id === "all") {
      const files = (await fs.readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          await fs.unlink(path.join(SESSIONS_DIR, f));
        } catch {
          /* ignore */
        }
      }
      const utsabPath = path.join(SESSIONS_DIR, "session-cafe-utsab-test.json");
      await fs.writeFile(utsabPath, JSON.stringify(DEFAULT_CAFE_UTSAB_SESSION, null, 2), "utf-8");
      return NextResponse.json({ success: true, count: files.length });
    }

    await fs.unlink(path.join(SESSIONS_DIR, `${id}.json`));
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
