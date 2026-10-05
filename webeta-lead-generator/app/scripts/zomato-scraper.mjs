/**
 * Zomato Scraper v2 — handles location autocomplete dropdown
 * For suburbs like Barasat (which are inside Kolkata metro on Zomato),
 * we navigate to the parent city (Kolkata) and filter by area.
 *
 * Usage: node scripts/zomato-scraper.mjs "restaurant" "Barasat" [sessionId]
 */
import { chromium } from "playwright";
import { dirname } from "path";
import { fileURLToPath } from "url";

const niche     = process.argv[2] || "restaurant";
const city      = process.argv[3] || "Barasat";
const sessionId = process.argv[4] || `zomato-${Date.now()}`;

const __dir = dirname(fileURLToPath(import.meta.url));

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

emit({ type: "status", message: `[Zomato] Searching "${niche}" in "${city}"...` });

/** Normalize phone to +91XXXXXXXXXX */
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("910") && digits.length === 13) digits = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits.length === 10 ? `+91${digits}` : null;
}

/** Extract just the area/locality from city string e.g. "Barasat, West Bengal" → "Barasat" */
function getLocality(cityStr) {
  return cityStr.split(",")[0].trim();
}

async function scrapeZomato() {
  const isHeadless = !!process.env.RENDER || process.env.NODE_ENV === "production" || process.env.HEADLESS === "true";
  const browser = await chromium.launch({
    headless: isHeadless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    locale: "en-IN",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const leads = [];
  const seenNames = new Set();
  const locality = getLocality(city);

  try {
    // ── Step 1: Go to Zomato homepage ─────────────────────────────────
    emit({ type: "status", message: "[Zomato] Opening zomato.com..." });
    await page.goto("https://www.zomato.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);

    // ── Step 2: Handle location input & autocomplete ───────────────────
    emit({ type: "status", message: `[Zomato] Setting location to "${locality}"...` });

    // Find location input (Zomato has several possible selectors)
    const locationInputSelectors = [
      'input[placeholder*="location"]',
      'input[placeholder*="Location"]',
      'input[id*="location"]',
      'input[name*="location"]',
      '[data-testid="location-input"]',
      'input[placeholder*="Search"]',
    ];

    let locationInput = null;
    for (const sel of locationInputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        locationInput = el;
        break;
      }
    }

    if (locationInput) {
      await locationInput.click();
      await delay(500);
      await locationInput.clear();
      await locationInput.type(locality, { delay: 80 });
      await delay(2000); // wait for dropdown

      // Click the FIRST suggestion that contains our locality name
      const suggestion = page.locator(`[role="option"]:has-text("${locality}"), li:has-text("${locality}"), div[class*="suggestion"]:has-text("${locality}")`).first();
      if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
        await suggestion.click();
        emit({ type: "status", message: `[Zomato] Selected location: ${locality}` });
        await delay(2000);
      } else {
        emit({ type: "status", message: "[Zomato] Dropdown not found — trying direct URL..." });
      }
    }

    // ── Step 3: Navigate to restaurant search results ──────────────────
    // Try multiple URL patterns Zomato uses for suburbs
    const localitySlug = locality.toLowerCase().replace(/\s+/g, "-");
    const urlsToTry = [
      `https://www.zomato.com/kolkata/restaurants/${localitySlug}-area`,
      `https://www.zomato.com/kolkata/${localitySlug}/restaurants`,
      `https://www.zomato.com/kolkata/restaurants?place_name=${encodeURIComponent(locality)}`,
      `https://www.zomato.com/search?q=${encodeURIComponent(niche + " " + locality + " Kolkata")}`,
    ];

    let found = false;
    for (const url of urlsToTry) {
      emit({ type: "status", message: `[Zomato] Trying ${url}` });
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await delay(3000);

        // Check if we actually got results
        const resCount = await page.locator('[data-testid="restaurant-card"], div[class*="sc-"] a[href*="/order-food"], div[class*="ResCard"]').count();
        if (resCount > 0) {
          emit({ type: "status", message: `[Zomato] Found results at ${url}` });
          found = true;
          break;
        }
      } catch { /* try next */ }
    }

    if (!found) {
      emit({ type: "status", message: "[Zomato] Could not find Zomato results for this area. Skipping." });
      await browser.close();
      emit({ type: "done", total: 0, withPhone: 0, noSite: 0 });
      return;
    }

    // ── Step 4: Scroll to load all results ────────────────────────────
    emit({ type: "status", message: "[Zomato] Loading all results..." });
    let lastCount = 0;
    let sameCountTimes = 0;
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await delay(1200);
      const cur = await page.locator('[data-testid="restaurant-card"], div[class*="sc-"] a[href*="/order-food"]').count();
      if (cur === lastCount) { sameCountTimes++; if (sameCountTimes >= 3) break; }
      else { sameCountTimes = 0; lastCount = cur; }
    }

    // ── Step 5: Extract all restaurant cards ──────────────────────────
    // Get all restaurant links from the page
    const allLinks = await page.evaluate(() => {
      const links = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/order-food"], a[href*="/info"]')) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        if (!href.includes("zomato.com")) continue;
        seen.add(href);

        // Walk up to find the card container
        let card = a;
        for (let i = 0; i < 5; i++) {
          card = card.parentElement;
          if (!card) break;
        }

        const name = (a.querySelector("h4, h3, [class*='name'], [class*='title']") || a).textContent?.trim() || a.getAttribute("aria-label") || "";
        const ratingEl = card?.querySelector("[class*='rating'], [class*='score']");
        const addrEl = card?.querySelector("[class*='address'], [class*='location'], [class*='subtitle']");

        links.push({
          href,
          name,
          rating: ratingEl?.textContent?.match(/(\d+\.?\d*)/)?.[1] || null,
          address: addrEl?.textContent?.trim() || "",
        });
      }
      return links.slice(0, 80); // max 80 per search
    });

    emit({ type: "status", message: `[Zomato] Found ${allLinks.length} restaurants — getting details...` });

    // ── Step 6: For each restaurant, get phone from detail page ────────
    for (const item of allLinks) {
      if (!item.name || item.name.length < 2) continue;

      const normalized = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenNames.has(normalized)) continue;
      seenNames.add(normalized);

      let phone = null;
      let website = null;

      // Open detail page for phone number (quick, close after)
      try {
        const detailPage = await context.newPage();
        await detailPage.goto(item.href, { waitUntil: "domcontentloaded", timeout: 12000 });
        await delay(1500);

        // Phone — look for tel: links or phone text
        const telLink = await detailPage.locator('a[href^="tel:"]').first().getAttribute("href").catch(() => null);
        if (telLink) {
          phone = normalizePhone(telLink.replace("tel:", ""));
        }
        if (!phone) {
          const pageText = await detailPage.textContent("body").catch(() => "");
          const m = pageText.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b)/);
          if (m) phone = normalizePhone(m[0]);
        }

        // Website — external link (not Zomato, not social media)
        const extLinks = await detailPage.locator('a[href*="http"]:not([href*="zomato"]):not([href*="facebook"]):not([href*="instagram"]):not([href*="google"])').all();
        for (const link of extLinks.slice(0, 3)) {
          const href = await link.getAttribute("href").catch(() => null);
          if (href && href.startsWith("http") && !href.includes("zomato")) { website = href; break; }
        }

        await detailPage.close();
      } catch { /* no detail — still add the lead */ }

      const lead = {
        id: `zomato-${leads.length + 1}`,
        name: item.name,
        category: niche,
        address: item.address || locality,
        city: locality,
        phone,
        website,
        rating: item.rating ? parseFloat(item.rating) : null,
        reviewsCount: null,
        lat: 0,
        lng: 0,
        source: "zomato",
        mapUrl: item.href,
      };

      leads.push(lead);
      emit({ type: "lead", lead, index: leads.length, total: allLinks.length });
    }

  } catch (err) {
    emit({ type: "error", message: `[Zomato] ${err.message}` });
  } finally {
    await browser.close();
  }

  const withPhone = leads.filter((l) => l.phone).length;
  const noSite    = leads.filter((l) => !l.website).length;
  emit({ type: "done", total: leads.length, withPhone, noSite });
}

scrapeZomato().catch((err) => {
  emit({ type: "error", message: `[Zomato] Fatal: ${err.message}` });
  process.exit(1);
});
