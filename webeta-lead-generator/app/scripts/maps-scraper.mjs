/**
 * Hermes v5 — Two-Phase Google Maps Scraper
 *
 * Phase 1: Scroll feed → collect all business cards (name, href, rating, address)
 * Phase 2: Click each card → extract phone + website from detail panel
 *
 * Memory-safe: single page, no new tabs, no page.goto() in a loop.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const niche     = process.argv[2] || "cafe";
const rawCity   = process.argv[3] || "Barasat, West Bengal";
const sessionId = process.argv[4] || `session-${Date.now()}`;
const city      = rawCity.includes(",") ? rawCity : `${rawCity}, India`;

const MAX_SCROLL   = 60;    // scroll passes to load cards
const SCROLL_DELAY = 1800;  // ms between scrolls
const DETAIL_WAIT  = 2200;  // ms after clicking card to let panel load

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
    viewport: { width: 1366, height: 900 },
    locale:   "en-US",
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

  // Block only media — keep images + fonts + vector tiles for Maps to work
  await page.route("**/*", async (route) => {
    try {
      if (route.request().resourceType() === "media") {
        await route.abort().catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    } catch {}
  });

  const query     = encodeURIComponent(`${niche} in ${city}`);
  const targetUrl = `https://www.google.com/maps/search/${query}?hl=en&gl=in`;

  // ── Open Maps ───────────────────────────────────────────────────────────────
  emit({ type: "status", message: "Opening Google Maps..." });
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
  } catch (e) {
    emit({ type: "error", message: `Navigation failed: ${String(e.message || e).slice(0, 150)}` });
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
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await delay(2500);
        break;
      }
    } catch {}
  }

  // Single-business redirect?
  if (page.url().includes("/maps/place/")) {
    const lead = await extractDetailPanel(page, page.url());
    if (lead) {
      emit({ type: "lead", lead, index: 1, total: 1 });
      saveSession([lead]);
    }
    await browser.close().catch(() => {});
    emitDone([lead].filter(Boolean));
    return;
  }

  emit({ type: "status", message: `Google Maps loaded: "${await page.title().catch(() => "")}"` });
  emit({ type: "status", message: "Loading search results..." });

  // Wait for feed
  try {
    await page.waitForSelector('[role="feed"]', { timeout: 15000 });
  } catch {
    emit({ type: "error", message: "Google Maps feed did not load. Try a different city or niche." });
    await browser.close().catch(() => {});
    return [];
  }
  await delay(1000);

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1: Scroll feed to load all cards
  // ════════════════════════════════════════════════════════════════════════════
  emit({ type: "status", message: "Phase 1: Scrolling to load all businesses..." });

  const seenHrefs = new Set();
  let   lastCount = 0;
  let   stall     = 0;

  for (let pass = 0; pass < MAX_SCROLL; pass++) {
    if (page.isClosed()) break;

    // Count unique place links in feed right now
    const currentHrefs = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return [];
      return Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'))
        .map((a) => a.href)
        .filter(Boolean);
    }).catch(() => []);

    for (const h of currentHrefs) seenHrefs.add(h);
    const curCount = seenHrefs.size;

    // Check end-of-list
    const atEnd = await page.locator('text="You\'ve reached the end of the list"').count().catch(() => 0);
    if (atEnd > 0) {
      emit({ type: "status", message: `Reached end of list — ${curCount} businesses found ✓` });
      break;
    }

    if (curCount >= 120) {
      emit({ type: "status", message: `Loaded ${curCount} businesses ✓` });
      break;
    }

    if (curCount > lastCount) {
      stall     = 0;
      lastCount = curCount;
      emit({ type: "status", message: `Loading... ${curCount} businesses found so far` });
    } else {
      stall++;
      if (stall >= 5) {
        emit({ type: "status", message: `Feed fully loaded — ${curCount} businesses ✓` });
        break;
      }
    }

    // Scroll the feed
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]') ||
                   document.querySelector(".m6QErb[aria-label]") ||
                   document.querySelector(".m6QErb");
      if (feed) feed.scrollTop = feed.scrollHeight;
      else      window.scrollBy(0, 2500);
    }).catch(() => {});

    await delay(SCROLL_DELAY);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2: Read each feed card, click it for detail panel (phone/website)
  // ════════════════════════════════════════════════════════════════════════════
  emit({ type: "status", message: "Phase 2: Extracting business details..." });

  // Collect all unique card info from feed DOM
  const cardData = await page.evaluate(({ nicheArg, cityArg }) => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return [];

    // Each direct child of the feed is one business card
    return Array.from(feed.children).map((card) => {
      // Main anchor = first link with /maps/place/ in href
      const anchor = card.querySelector('a[href*="/maps/place/"]');
      if (!anchor) return null;

      const href = anchor.href || "";
      if (!href) return null;

      // Name: prefer aria-label on the main anchor
      let name =
        anchor.getAttribute("aria-label") ||
        card.querySelector('[class*="fontHeadlineSmall"]')?.textContent?.trim() ||
        card.querySelector(".qBF1Pd")?.textContent?.trim() ||
        anchor.textContent?.trim() ||
        "";
      name = name.replace(/^[·•\s]+/, "").trim();
      if (!name || name.length < 2) return null;

      const text = card.textContent || "";

      // Rating
      let rating = null;
      const rm = text.match(/\b([1-5]\.\d)\b/);
      if (rm) rating = parseFloat(rm[1]);

      // Reviews count
      let reviewsCount = null;
      const rvm = text.match(/\(([\d,]+)\)/);
      if (rvm) reviewsCount = parseInt(rvm[1].replace(/,/g, ""), 10);

      // Category/type snippet (usually after first "·")
      let category = nicheArg;
      const catMatch = text.match(/[·•]\s*([A-Za-z ]{3,30})\s*[·•]/);
      if (catMatch) category = catMatch[1].trim();

      // Address snippet
      let address = cityArg;
      const parts = text.split(/[·•]/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.length > 5 &&
            p.match(/road|rd|st\b|street|lane|nagar|colony|bazaar|market|station|more|highway|cross|chowk|block|para|floor|flat|apt|building|complex/i)) {
          address = p;
          break;
        }
      }

      // Coordinates from href
      let lat = null, lng = null;
      const c1 = href.match(/@(-?[\d.]+),(-?[\d.]+)/);
      if (c1) { lat = parseFloat(c1[1]); lng = parseFloat(c1[2]); }
      else {
        const lat3d = href.match(/!3d(-?[\d.]+)/);
        const lng4d = href.match(/!4d(-?[\d.]+)/);
        if (lat3d && lng4d) { lat = parseFloat(lat3d[1]); lng = parseFloat(lng4d[1]); }
      }

      return { href, name, rating, reviewsCount, category, address, lat, lng };
    }).filter(Boolean);
  }, { nicheArg: niche, cityArg: city }).catch(() => []);

  emit({ type: "status", message: `Extracted ${cardData.length} business cards — fetching phone numbers...` });

  // Deduplicate by href
  const uniqueCards = [];
  const seenCardHrefs = new Set();
  for (const card of cardData) {
    if (!seenCardHrefs.has(card.href)) {
      seenCardHrefs.add(card.href);
      uniqueCards.push(card);
    }
  }

  const allLeads = [];

  for (let i = 0; i < uniqueCards.length; i++) {
    if (page.isClosed()) break;
    const card = uniqueCards[i];

    emit({ type: "status", message: `Getting details: ${card.name} (${i + 1}/${uniqueCards.length})` });

    // Click the card link in the feed to open detail panel
    let phone   = null;
    let website = null;

    try {
      // Click the place link to open detail panel on the right
      const link = page.locator(`[role="feed"] a[href="${card.href}"]`).first();
      await link.click({ timeout: 5000 });
      await delay(DETAIL_WAIT);

      // Extract phone from detail panel
      const phoneBtn = page.locator('button[data-item-id^="phone:"]').first();
      if (await phoneBtn.count() > 0) {
        const dataId = await phoneBtn.getAttribute("data-item-id").catch(() => null);
        if (dataId) {
          phone = dataId.replace("phone:tel:", "").replace("phone:", "").trim();
        }
        if (!phone) {
          phone = await phoneBtn.textContent().catch(() => null);
          if (phone) phone = phone.trim();
        }
      }

      // Extract website from detail panel
      const siteLink = page.locator('a[data-item-id="authority"]').first();
      if (await siteLink.count() > 0) {
        website = await siteLink.getAttribute("href").catch(() => null);
        if (website && website.includes("google.com")) website = null;
      }

      // If panel didn't show phone, try other selectors
      if (!phone) {
        const altPhone = page.locator('[data-tooltip="Copy phone number"], [aria-label*="phone" i]').first();
        if (await altPhone.count() > 0) {
          phone = await altPhone.textContent().catch(() => null);
          if (phone) phone = phone.trim().replace(/\s+/g, "");
        }
      }
    } catch {
      // Panel click failed — still emit with what we have from card
    }

    // Normalize Indian phone number
    if (phone) {
      let d = phone.replace(/[\s\-().]/g, "");
      if (d.startsWith("0091") && d.length === 14) d = d.slice(4);
      else if (d.startsWith("910") && d.length === 13) d = d.slice(3);
      else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
      else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
      phone = d.length === 10 && /^[6-9]\d{9}$/.test(d) ? `+91${d}` : (phone || null);
    }

    const lead = {
      id:           `${sessionId}_m${String(i + 1).padStart(3, "0")}`,
      name:         card.name,
      category:     card.category || niche,
      address:      card.address || city,
      city,
      phone:        phone || undefined,
      whatsapp:     phone || undefined,
      website:      website || undefined,
      mapUrl:       card.href,
      rating:       card.rating || null,
      reviewsCount: card.reviewsCount || null,
      lat:          card.lat || 22.72,
      lng:          card.lng || 88.48,
      source:       "maps",
    };

    allLeads.push(lead);
    emit({ type: "lead", lead, index: i + 1, total: uniqueCards.length });

    // Save every 5 leads
    if ((i + 1) % 5 === 0) saveSession(allLeads);
  }

  saveSession(allLeads);
  await browser.close().catch(() => {});
  emitDone(allLeads);
  return allLeads;
}

function emitDone(leads) {
  emit({
    type:      "done",
    total:     leads.length,
    withPhone: leads.filter((l) => l.phone).length,
    noSite:    leads.filter((l) => !l.website).length,
    sessionId,
  });
}

scrapeGoogleMaps().catch((err) => {
  emit({ type: "error", message: `Fatal: ${String(err.message || err)}` });
  process.exit(1);
});
