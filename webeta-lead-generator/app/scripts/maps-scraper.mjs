/**
 * Hermes v6 — Incremental Scroll + Phone Enrichment
 *
 * Phase 1: Scroll feed, collect & emit leads incrementally (name, rating, address)
 * Phase 2: Visit each place URL (images/fonts blocked) to extract phone + website
 *
 * Memory-safe for 512 MB Render containers.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const niche      = process.argv[2] || "cafe";
const rawCity    = process.argv[3] || "Barasat, West Bengal";
const sessionId  = process.argv[4] || `session-${Date.now()}`;
const city       = rawCity.includes(",") ? rawCity : `${rawCity}, India`;

const MAX_SCROLL    = 60;    // Phase 1 scroll passes
const SCROLL_DELAY  = 1800;  // ms between scrolls
const ENRICH_LIMIT  = 60;    // max leads to enrich with phone in Phase 2
const ENRICH_DELAY  = 1500;  // ms after navigating to place page

const __dir        = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dir, "..", "data", "sessions");

function emit(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function saveSession(leads) {
  try {
    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
    writeFileSync(
      join(SESSIONS_DIR, `${sessionId}.json`),
      JSON.stringify({
        id: sessionId, niche, city,
        timestamp:      new Date().toISOString(),
        leadsCount:     leads.length,
        noWebsiteCount: leads.filter((l) => !l.website).length,
        withPhoneCount: leads.filter((l) => l.phone).length,
        expandedTerms:  [niche],
        leads,
      }, null, 2)
    );
  } catch {}
}

emit({ type: "status", message: `Searching "${niche}" in "${city}"...` });

async function scrapeGoogleMaps() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-gpu", "--no-first-run", "--no-zygote", "--single-process",
      "--disable-extensions", "--disable-background-networking",
      "--disable-default-apps", "--mute-audio",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1366,900",
    ],
  });

  const context = await browser.newContext({
    viewport:   { width: 1366, height: 900 },
    locale:     "en-US",
    timezoneId: "Asia/Kolkata",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins",   { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Phase 1: allow images/fonts so Maps renders correctly
  await page.route("**/*", async (route) => {
    try {
      if (route.request().resourceType() === "media") await route.abort().catch(() => {});
      else await route.continue().catch(() => {});
    } catch {}
  });

  // ── Open Google Maps ────────────────────────────────────────────────────────
  emit({ type: "status", message: "Opening Google Maps..." });
  const query = encodeURIComponent(`${niche} in ${city}`);
  try {
    await page.goto(
      `https://www.google.com/maps/search/${query}?hl=en&gl=in`,
      { waitUntil: "domcontentloaded", timeout: 40000 }
    );
  } catch (e) {
    emit({ type: "error", message: `Failed to open Maps: ${String(e.message || e).slice(0, 120)}` });
    await browser.close().catch(() => {});
    return [];
  }
  await delay(3000);

  // Accept consent dialog if shown
  for (const sel of [
    'button:has-text("Accept all")', 'button:has-text("I agree")',
    'button:has-text("Agree")', 'form[action*="consent"] button',
  ]) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) { await btn.click(); await delay(2500); break; }
    } catch {}
  }

  emit({ type: "status", message: `Google Maps loaded: "${await page.title().catch(() => "")}"` });

  // Single business redirect?
  if (page.url().includes("/maps/place/")) {
    const lead = await extractPlacePage(page, page.url(), 1);
    if (lead) { emit({ type: "lead", lead, index: 1, total: 1 }); saveSession([lead]); }
    await browser.close().catch(() => {});
    emitDone([lead].filter(Boolean));
    return;
  }

  // Wait for feed
  emit({ type: "status", message: "Loading search results..." });
  try {
    await page.waitForSelector('[role="feed"]', { timeout: 15000 });
  } catch {
    emit({ type: "error", message: "No results feed appeared. Try a different search." });
    await browser.close().catch(() => {});
    return [];
  }
  await delay(1000);

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1 — Incremental scroll: extract cards as they load, emit immediately
  // ════════════════════════════════════════════════════════════════════════════
  emit({ type: "status", message: "Phase 1: Loading all businesses..." });

  const leadsMap = new Map();  // href → lead (dedup key)
  let   stall    = 0;
  let   lastSize = 0;

  async function harvestCurrentCards() {
    const cards = await page.evaluate(({ nicheArg, cityArg }) => {
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return [];

      return Array.from(feed.children).map((card) => {
        const anchor = card.querySelector('a[href*="/maps/place/"]');
        if (!anchor) return null;

        const href = anchor.href || "";
        if (!href || !href.includes("/maps/place/")) return null;

        // Name: try aria-label first, then known class names, then text
        let name =
          anchor.getAttribute("aria-label") ||
          card.querySelector('[class*="fontHeadlineSmall"]')?.textContent?.trim() ||
          card.querySelector(".qBF1Pd")?.textContent?.trim() ||
          anchor.textContent?.trim() ||
          "";
        name = name.replace(/^[·•\s]+/, "").trim();
        if (!name || name.length < 2) return null;

        const text = card.textContent || "";

        // Rating (e.g. "4.3")
        let rating = null;
        const rm = text.match(/\b([1-5]\.\d)\b/);
        if (rm) rating = parseFloat(rm[1]);

        // Reviews count (e.g. "(843)")
        let reviewsCount = null;
        const rvm = text.match(/\(([\d,]+)\)/);
        if (rvm) reviewsCount = parseInt(rvm[1].replace(/,/g, ""), 10);

        // Address from card text — look for street keywords
        let address = cityArg;
        const parts = text.split(/[·•]/).map((s) => s.trim()).filter(Boolean);
        for (const p of parts) {
          if (
            p.length > 5 &&
            p.match(/road|rd\b|street|lane|nagar|colony|bazaar|market|station|more|highway|cross|chowk|block|para|floor|flat|apt\b|building|complex|area/i)
          ) {
            address = p;
            break;
          }
        }

        // Coordinates from href
        let lat = 22.72, lng = 88.48;
        const c1 = href.match(/@(-?[\d.]+),(-?[\d.]+)/);
        if (c1) { lat = parseFloat(c1[1]); lng = parseFloat(c1[2]); }
        else {
          const lat3d = href.match(/!3d(-?[\d.]+)/);
          const lng4d = href.match(/!4d(-?[\d.]+)/);
          if (lat3d && lng4d) { lat = parseFloat(lat3d[1]); lng = parseFloat(lng4d[1]); }
        }

        return { href, name, rating, reviewsCount, address, lat, lng };
      }).filter(Boolean);
    }, { nicheArg: niche, cityArg: city }).catch(() => []);

    let newCount = 0;
    for (const card of cards) {
      if (leadsMap.has(card.href)) continue;

      const lead = {
        id:           `${sessionId}_m${String(leadsMap.size + 1).padStart(3, "0")}`,
        name:         card.name,
        category:     niche,
        address:      card.address || city,
        city,
        mapUrl:       card.href,
        rating:       card.rating  || null,
        reviewsCount: card.reviewsCount || null,
        lat:          card.lat,
        lng:          card.lng,
        source:       "maps",
      };

      leadsMap.set(card.href, lead);
      newCount++;

      // Stream lead to UI immediately — phone/website added in Phase 2
      emit({ type: "lead", lead, index: leadsMap.size, total: leadsMap.size });
    }

    return newCount;
  }

  for (let pass = 0; pass < MAX_SCROLL; pass++) {
    if (page.isClosed()) break;

    await harvestCurrentCards();
    const curSize = leadsMap.size;

    // Check end of list
    const atEnd = await page.locator('text="You\'ve reached the end of the list"').count().catch(() => 0);
    if (atEnd > 0) {
      emit({ type: "status", message: `End of list — ${curSize} businesses loaded ✓` });
      break;
    }

    if (curSize >= 120) {
      emit({ type: "status", message: `Loaded ${curSize} businesses ✓` });
      break;
    }

    if (curSize > lastSize) {
      stall    = 0;
      lastSize = curSize;
      emit({ type: "status", message: `Loading... ${curSize} businesses found so far` });
    } else {
      stall++;
      if (stall >= 5) {
        emit({ type: "status", message: `Feed fully loaded — ${curSize} businesses ✓` });
        break;
      }
    }

    await page.evaluate(() => {
      const feed =
        document.querySelector('[role="feed"]') ||
        document.querySelector(".m6QErb[aria-label]") ||
        document.querySelector(".m6QErb");
      if (feed) feed.scrollTop = feed.scrollHeight;
      else      window.scrollBy(0, 2500);
    }).catch(() => {});

    await delay(SCROLL_DELAY);
  }

  // Final harvest pass to catch anything visible now
  await harvestCurrentCards();
  const allLeads = Array.from(leadsMap.values());
  saveSession(allLeads);
  emit({ type: "status", message: `Phase 1 done — ${allLeads.length} businesses found. Getting phone numbers...` });

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Enrich each lead: navigate to place page, extract phone + website
  // Block images/fonts/css to stay under 512 MB memory limit
  // ════════════════════════════════════════════════════════════════════════════

  // Switch route handler: block heavy resources for enrichment phase
  await page.unroute("**/*").catch(() => {});
  await page.route("**/*", async (route) => {
    try {
      const type = route.request().resourceType();
      if (["image", "stylesheet", "font", "media"].includes(type)) {
        await route.abort().catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    } catch {}
  });

  const toEnrich = allLeads.slice(0, ENRICH_LIMIT);
  let enriched = 0;

  for (const lead of toEnrich) {
    if (page.isClosed()) break;
    enriched++;
    emit({ type: "status", message: `Getting phone: ${lead.name} (${enriched}/${toEnrich.length})` });

    try {
      await page.goto(lead.mapUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await delay(ENRICH_DELAY);

      // Phone via data-item-id attribute
      let phone = null;
      const phoneBtn = page.locator('button[data-item-id^="phone:"]').first();
      if (await phoneBtn.count() > 0) {
        const dataId = await phoneBtn.getAttribute("data-item-id").catch(() => null);
        if (dataId) phone = dataId.replace("phone:tel:", "").replace("phone:", "").trim();
        if (!phone || phone.length < 5) {
          phone = (await phoneBtn.textContent().catch(() => null))?.trim() || null;
        }
      }

      // Normalize Indian phone
      if (phone) {
        let d = phone.replace(/[\s\-().+]/g, "");
        if (d.startsWith("0091") && d.length === 14) d = d.slice(4);
        else if (d.startsWith("910") && d.length === 13) d = d.slice(3);
        else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
        else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
        phone = d.length === 10 && /^[6-9]\d{9}$/.test(d) ? `+91${d}` : phone;
      }

      // Website
      let website = null;
      const siteEl = page.locator('a[data-item-id="authority"]').first();
      if (await siteEl.count() > 0) {
        website = await siteEl.getAttribute("href").catch(() => null);
        if (website && (website.includes("google.com") || website.includes("goo.gl"))) website = null;
      }

      // Update lead if we got anything new
      if (phone || website) {
        if (phone)   { lead.phone = phone; lead.whatsapp = phone; }
        if (website) lead.website = website;

        // Re-emit updated lead so UI reflects phone/website immediately
        emit({ type: "lead", lead, index: enriched, total: allLeads.length });

        // Save every 5 enriched
        if (enriched % 5 === 0) saveSession(allLeads);
      }

      // Navigate to blank to free renderer memory between visits
      await page.goto("about:blank", { timeout: 5000 }).catch(() => {});
      await delay(300);

    } catch {
      // Skip this lead if page fails — keep going
      await page.goto("about:blank", { timeout: 5000 }).catch(() => {});
    }
  }

  saveSession(allLeads);
  await browser.close().catch(() => {});
  emitDone(allLeads);
  return allLeads;
}

async function extractPlacePage(page, href, idx) {
  try {
    const data = await page.evaluate((url) => {
      let name = document.title.split(" - ")[0]?.trim() || "Business";
      const h1 = document.querySelector("h1");
      if (h1?.textContent?.trim()) name = h1.textContent.trim();
      const pb = document.querySelector('button[data-item-id^="phone:"]');
      let phone = null;
      if (pb) phone = (pb.getAttribute("data-item-id") || "").replace("phone:tel:", "").replace("phone:", "").trim();
      const ab = document.querySelector('button[data-item-id="address"]');
      const address = ab?.textContent?.trim() || "";
      const sl = document.querySelector('a[data-item-id="authority"]');
      const website = sl?.href && !sl.href.includes("google.com") ? sl.href : null;
      const rs = document.querySelector("div.fontDisplayLarge, span.MW4etd");
      const rating = rs ? parseFloat(rs.textContent?.trim() || "") || null : null;
      return { name, phone, address, website, rating, mapUrl: url };
    }, href);
    return {
      id: `${sessionId}_m${String(idx).padStart(3, "0")}`,
      name: data.name, category: niche, address: data.address || city, city,
      phone: data.phone || undefined, whatsapp: data.phone || undefined,
      website: data.website || undefined, mapUrl: href,
      rating: data.rating, lat: 22.72, lng: 88.48, source: "maps",
    };
  } catch { return null; }
}

function emitDone(leads) {
  emit({
    type: "done", sessionId,
    total:     leads.length,
    withPhone: leads.filter((l) => l.phone).length,
    noSite:    leads.filter((l) => !l.website).length,
  });
}

scrapeGoogleMaps().catch((err) => {
  emit({ type: "error", message: `Fatal: ${String(err.message || err)}` });
  process.exit(1);
});
