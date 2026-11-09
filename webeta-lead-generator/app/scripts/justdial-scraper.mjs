/**
 * JustDial Scraper — India's #1 business directory
 * Finds businesses NOT on Google Maps. Second data source for Lead-to-Launch.
 *
 * Usage: node scripts/justdial-scraper.mjs "gym" "Barasat" [sessionId]
 *
 * Emits JSON lines to stdout (same format as maps-scraper.mjs):
 *   {"type":"status","message":"..."}
 *   {"type":"lead","lead":{...}}
 *   {"type":"done","total":N,...}
 *   {"type":"error","message":"..."}
 *
 * JustDial phone numbers are obfuscated with CSS font tricks.
 * We extract them from data attributes and CSS class → digit mapping.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const niche     = process.argv[2] || "gym";
const city      = process.argv[3] || "Barasat";
const sessionId = process.argv[4] || `jd-session-${Date.now()}`;
const MAX_SCROLL = 10;

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, "..");

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

emit({ type: "status", message: `[JustDial] Searching "${niche}" in "${city}"...` });

// JustDial CSS class → digit mapping (their obfuscation system)
// These classes render as specific digits using a custom webfont
const JD_DIGIT_MAP = {
  "icon-acb":  "0",
  "icon-abb":  "1",
  "icon-aeb":  "2",
  "icon-adb":  "3",
  "icon-agb":  "4",
  "icon-afb":  "5",
  "icon-aib":  "6",
  "icon-ahb":  "7",
  "icon-akb":  "8",
  "icon-ajb":  "9",
  // Alternative mapping (JustDial changes these periodically)
  "icon-dc":   "0",
  "icon-ba":   "1",
  "icon-fe":   "2",
  "icon-ed":   "3",
  "icon-hg":   "4",
  "icon-gf":   "5",
  "icon-ji":   "6",
  "icon-ih":   "7",
  "icon-lk":   "8",
  "icon-kj":   "9",
};

async function scrapeJustDial() {
  const isHeadless = !!process.env.RENDER || process.env.NODE_ENV === "production" || process.env.HEADLESS === "true";
  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ],
  });

  const context = await browser.newContext({
    locale: "en-IN",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  // JustDial URL format: https://www.justdial.com/Barasat/Gyms
  // Capitalize city and pluralize/format niche for URL
  const citySlug = city.split(",")[0].trim().replace(/\s+/g, "-");
  const nicheSlug = niche.charAt(0).toUpperCase() + niche.slice(1).toLowerCase();
  const searchUrl = `https://www.justdial.com/${citySlug}/${nicheSlug}/nct-10000000`;

  const leads = [];

  try {
    emit({ type: "status", message: `[JustDial] Opening justdial.com/${citySlug}/${nicheSlug}...` });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);

    // Handle popups/modals
    try {
      const closeBtn = page.locator('span.jdicon-close, button.close, [class*="modalClose"]').first();
      if (await closeBtn.isVisible({ timeout: 2000 })) await closeBtn.click();
    } catch { /* no popup */ }
    try {
      // Login popup
      const skipLogin = page.locator('span:has-text("Not now"), button:has-text("Skip"), span.jdicon-close').first();
      if (await skipLogin.isVisible({ timeout: 1000 })) await skipLogin.click();
    } catch { /* no login popup */ }

    // Scroll to load more results
    emit({ type: "status", message: "[JustDial] Loading results..." });
    for (let i = 0; i < MAX_SCROLL; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(1500);
    }

    // Find all business listing cards
    // JustDial uses various class patterns for listing cards
    const listingSelectors = [
      'li.cntanr',                    // Classic layout
      'div[class*="resultbox"]',       // New layout
      'div[class*="store-details"]',   // Another variant
      'div[class*="jsx-"] > div[class*="resultbox_info"]', // React layout
    ];

    let listingEls = null;
    let listingCount = 0;
    for (const sel of listingSelectors) {
      const els = page.locator(sel);
      const c = await els.count();
      if (c > 0) {
        listingEls = els;
        listingCount = c;
        break;
      }
    }

    // Fallback: try to find any cards with business-like data
    if (!listingEls || listingCount === 0) {
      // Try a broader approach: any element that has a rating + name
      listingEls = page.locator('[class*="resultbox"], [class*="store-details"], li[class*="cntanr"]');
      listingCount = await listingEls.count();
    }

    if (listingCount === 0) {
      emit({ type: "status", message: "[JustDial] No listings found — trying search form..." });
      // Try using the search form instead
      try {
        const searchInput = page.locator('input#srchbx, input[name="what"], input[placeholder*="search"]').first();
        if (await searchInput.isVisible({ timeout: 3000 })) {
          await searchInput.clear();
          await searchInput.fill(niche);
          await delay(500);

          const locInput = page.locator('input#locclear, input[name="where"], input[placeholder*="location"]').first();
          if (await locInput.isVisible({ timeout: 2000 })) {
            await locInput.clear();
            await locInput.fill(city.split(",")[0].trim());
            await delay(500);
          }

          // Submit
          const submitBtn = page.locator('button[type="submit"], input[type="submit"], span.jdicon-search').first();
          if (await submitBtn.isVisible({ timeout: 2000 })) await submitBtn.click();
          await delay(3000);

          // Re-scroll
          for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await delay(1000);
          }

          // Re-check listings
          for (const sel of listingSelectors) {
            const els = page.locator(sel);
            const c = await els.count();
            if (c > 0) {
              listingEls = els;
              listingCount = c;
              break;
            }
          }
        }
      } catch { /* search form failed */ }
    }

    emit({ type: "status", message: `[JustDial] Found ${listingCount} listings — extracting data...` });

    // Extract data from each listing
    for (let idx = 0; idx < listingCount; idx++) {
      try {
        const el = listingEls.nth(idx);

        // Business name
        let name = "";
        try {
          const nameEl = el.locator('span[class*="lng_cont_name"], a[class*="lng_cont_name"], h2, span.store-name, [class*="resultbox_title"]').first();
          name = ((await nameEl.textContent()) || "").trim();
        } catch { /* no name */ }
        if (!name) continue;

        // Rating
        let rating = null;
        try {
          const ratingEl = el.locator('[class*="green-box"], [class*="rating"], span[class*="star"]').first();
          const rText = (await ratingEl.textContent()) || "";
          const rMatch = rText.match(/([\d.]+)/);
          if (rMatch) rating = parseFloat(rMatch[1]);
        } catch { /* no rating */ }

        // Review count
        let reviewsCount = null;
        try {
          const votesEl = el.locator('[class*="rating_count"], [class*="votes"], span:has-text("Votes"), span:has-text("Rating")').first();
          const vText = (await votesEl.textContent()) || "";
          const vMatch = vText.match(/([\d,]+)/);
          if (vMatch) reviewsCount = parseInt(vMatch[1].replace(/,/g, ""), 10);
        } catch { /* no review count */ }

        // Address
        let address = "";
        try {
          const addrEl = el.locator('[class*="cont_sw_addr"], [class*="address"], span[class*="moreinfo"]').first();
          address = ((await addrEl.textContent()) || "").trim();
        } catch { /* no address */ }

        // Phone number — the tricky part
        // JustDial hides numbers using CSS font classes
        let phone = null;
        try {
          // Method 1: Look for visible phone text
          const phoneContainer = el.locator('[class*="contact-info"] span, [class*="mobilesv"] span, a[href^="tel:"]');
          if (await phoneContainer.count() > 0) {
            // Try tel: link first
            const telLink = el.locator('a[href^="tel:"]');
            if (await telLink.count() > 0) {
              const href = await telLink.first().getAttribute("href");
              if (href) phone = href.replace("tel:", "").trim();
            }
          }

          // Method 2: Decode CSS font classes
          if (!phone) {
            const digitSpans = el.locator('[class*="icon-ac"], [class*="icon-ab"], [class*="icon-ae"], [class*="icon-ad"], [class*="icon-ag"], [class*="icon-af"], [class*="icon-ai"], [class*="icon-ah"], [class*="icon-ak"], [class*="icon-aj"], [class*="icon-dc"], [class*="icon-ba"], [class*="icon-fe"], [class*="icon-ed"], [class*="icon-hg"], [class*="icon-gf"], [class*="icon-ji"], [class*="icon-ih"], [class*="icon-lk"], [class*="icon-kj"]');
            const digitCount = await digitSpans.count();
            if (digitCount >= 10) {
              let phoneDigits = "";
              for (let d = 0; d < Math.min(digitCount, 12); d++) {
                const cls = await digitSpans.nth(d).getAttribute("class") || "";
                // Find matching digit
                for (const [clsName, digit] of Object.entries(JD_DIGIT_MAP)) {
                  if (cls.includes(clsName)) {
                    phoneDigits += digit;
                    break;
                  }
                }
              }
              if (phoneDigits.length >= 10) phone = phoneDigits;
            }
          }

          // Method 3: Click "Show number" button
          if (!phone) {
            const showBtn = el.locator('button:has-text("Show"), span:has-text("Show Number"), a:has-text("Show Number")').first();
            if (await showBtn.isVisible({ timeout: 1000 })) {
              await showBtn.click();
              await delay(1000);
              // Re-try phone extraction
              const telLink = el.locator('a[href^="tel:"]');
              if (await telLink.count() > 0) {
                const href = await telLink.first().getAttribute("href");
                if (href) phone = href.replace("tel:", "").trim();
              }
            }
          }

          // Normalize phone
          if (phone) {
            phone = phone.replace(/[\s\-().+]/g, "");
            // Remove leading 91 or 0
            if (phone.length > 10 && phone.startsWith("91")) phone = phone.slice(2);
            if (phone.length > 10 && phone.startsWith("0")) phone = phone.slice(1);
            // Add +91
            if (phone.length === 10) phone = "+91" + phone;
            else if (!phone.startsWith("+")) phone = "+91" + phone;
          }
        } catch { /* phone extraction failed */ }

        // Website
        let website = null;
        try {
          const siteLink = el.locator('a[href*="website"], a:has-text("Website"), a[class*="website"]').first();
          if (await siteLink.isVisible({ timeout: 500 })) {
            website = await siteLink.getAttribute("href");
          }
        } catch { /* no website */ }

        // Category
        let jdCategory = niche;
        try {
          const catEl = el.locator('[class*="category"], [class*="result_category"]').first();
          if (await catEl.isVisible({ timeout: 500 })) {
            jdCategory = (await catEl.textContent())?.trim() || niche;
          }
        } catch { /* use default */ }

        // Map URL (JustDial doesn't give Maps links directly)
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + address + " " + city)}`;

        const lead = {
          id:           `jd-${String(leads.length + 1).padStart(3, "0")}`,
          name:         name,
          category:     jdCategory,
          address,
          city,
          phone:        phone || undefined,
          whatsapp:     phone || undefined,
          website:      website || undefined,
          mapUrl,
          rating,
          reviewsCount,
          lat:          22.72, // Default — can't easily get GPS from JustDial
          lng:          88.48,
          source:       "justdial",
        };

        leads.push(lead);
        emit({ type: "lead", lead, index: idx + 1, total: listingCount });

      } catch (e) {
        emit({ type: "status", message: `[JustDial] Skipped #${idx + 1}: ${e.message?.slice(0, 50)}` });
      }
    }
  } catch (e) {
    emit({ type: "error", message: `[JustDial] ${e.message}` });
  } finally {
    await browser.close();
  }

  return leads;
}

// ─── Run ─────────────────────────────────────────────────────────────────────
try {
  const leads = await scrapeJustDial();

  // Deduplicate by name
  const seen   = new Set();
  const unique = leads.filter((l) => {
    const key = l.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.forEach((l, i) => { l.id = `jd-${String(i + 1).padStart(3, "0")}`; });

  const noSite    = unique.filter((l) => !l.website);
  const withPhone = unique.filter((l) => l.phone);

  emit({
    type: "done",
    source: "justdial",
    total: unique.length,
    withPhone: withPhone.length,
    noSite: noSite.length,
  });

  // Output leads as a final JSON blob for the API to read
  emit({ type: "leads_dump", leads: unique });

} catch (e) {
  emit({ type: "error", message: e.message });
  process.exit(1);
}
