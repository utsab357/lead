/**
 * Hermes v7 — Complete Production Google Maps Engine
 *
 * Full extraction restored:
 *   - Basic: Name, Verified Phone (+91/local), Address, Website, Rating, Review Count, Coords
 *   - Extended: Business Hours, Services/Amenities, Photos Count, Photo URLs, About summary
 *   - Contact Enrichment: Free website/bio crawler for Email & Social Links
 *   - 4-Layer Phone Detection: data-item-id, aria-label, pane text RegEx, button contents
 *   - 512MB RAM Safe: Sequential clean place navigation, progressive SSE emission, disk persistence
 *
 * Usage: node scripts/maps-scraper.mjs "cafe" "Barasat, West Bengal" [sessionId]
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { enrichLeadContacts } from "./contact-extractor.mjs";

const niche      = process.argv[2] || "cafe";
const rawCity    = process.argv[3] || "Barasat, West Bengal";
const sessionId  = process.argv[4] || `session-${Date.now()}`;
const city       = rawCity.includes(",") ? rawCity : `${rawCity}, India`;

const MAX_SCROLL      = 40;   // scroll passes to harvest search feed
const SCROLL_DELAY    = 1500; // ms between feed scrolls
const HYDRATION_DELAY = 2500; // ms to let Google Maps hydrate place dynamic DOM

const __dir        = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dir, "..", "data", "sessions");

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function saveSession(leads) {
  try {
    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
    writeFileSync(
      join(SESSIONS_DIR, `${sessionId}.json`),
      JSON.stringify(
        {
          id: sessionId,
          niche,
          city,
          timestamp: new Date().toISOString(),
          leadsCount: leads.length,
          noWebsiteCount: leads.filter((l) => !l.website).length,
          withPhoneCount: leads.filter((l) => l.phone).length,
          expandedTerms: [niche],
          leads,
        },
        null,
        2
      )
    );
  } catch {}
}

emit({ type: "status", message: `Searching "${niche}" in "${city}"...` });

async function scrapeGoogleMaps() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--mute-audio",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1366,850",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 850 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-IN,en;q=0.9",
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  // Abort only heavy video/audio streaming, allow images, fonts, styles, and vector tiles
  await page.route("**/*", async (route) => {
    try {
      if (route.request().resourceType() === "media") {
        await route.abort().catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    } catch {}
  });

  const query = encodeURIComponent(`${niche} in ${city}`);
  const targetUrl = `https://www.google.com/maps/search/${query}?hl=en&gl=in`;

  emit({ type: "status", message: "Opening Google Maps..." });

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
  } catch (e) {
    emit({ type: "error", message: `Navigation error: ${String(e.message || e).slice(0, 120)}` });
    await browser.close().catch(() => {});
    return [];
  }

  await delay(2500);

  // Dismiss consent if present
  for (const sel of [
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'form[action*="consent"] button',
  ]) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await delay(2000);
        break;
      }
    } catch {}
  }

  // Check if search directly opened a single place page
  if (page.url().includes("/maps/place/")) {
    emit({ type: "status", message: "Direct place match detected — extracting full profile..." });
    const singleLead = await extractSinglePlaceDetails(page, page.url(), 1);
    if (singleLead) {
      emit({ type: "lead", lead: singleLead, index: 1, total: 1 });
      saveSession([singleLead]);
    }
    await browser.close().catch(() => {});
    emitDone([singleLead].filter(Boolean));
    return;
  }

  emit({ type: "status", message: "Loading search results..." });

  try {
    await page.waitForSelector('[role="feed"], a[href*="/maps/place/"]', { timeout: 18000 });
  } catch {
    emit({ type: "error", message: "Google Maps feed did not appear. Please check search parameters." });
    await browser.close().catch(() => {});
    return [];
  }

  await delay(1000);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1: Scroll feed and harvest targets
  // ════════════════════════════════════════════════════════════════════════════
  emit({ type: "status", message: "Harvesting businesses from Google Maps feed..." });

  const targetsMap = new Map(); // href -> { href, name, cardRating, cardReviews, cardAddress, lat, lng }
  let stallCount = 0;
  let lastCount = 0;

  async function harvestVisibleListings() {
    try {
      const items = await page.evaluate(({ cityArg }) => {
        const feed = document.querySelector('[role="feed"]') || document;
        const anchors = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));

        return anchors
          .map((a) => {
            const href = a.href || "";
            if (!href || !href.includes("/maps/place/")) return null;

            // Name
            let name =
              a.getAttribute("aria-label") ||
              a.querySelector('[class*="fontHeadlineSmall"]')?.textContent?.trim() ||
              a.textContent?.trim() ||
              "";
            name = name.replace(/^[·•\s]+/, "").trim();
            if (!name || name.length < 2) return null;

            // Walk up to card
            let card = a.parentElement;
            for (let i = 0; i < 5; i++) {
              if (card && (card.getAttribute("role") === "article" || card.children.length > 2)) break;
              if (card?.parentElement) card = card.parentElement;
            }

            const text = card ? card.textContent || "" : "";

            // Rating
            let cardRating = null;
            const rm = text.match(/\b([1-5]\.\d)\b/);
            if (rm) cardRating = parseFloat(rm[1]);

            // Review count
            let cardReviews = null;
            const rvm = text.match(/\(([\d,]+)\)/);
            if (rvm) cardReviews = parseInt(rvm[1].replace(/,/g, ""), 10);

            // Card address snippet
            let cardAddress = cityArg;
            const parts = text.split(/[·•]/).map((s) => s.trim()).filter(Boolean);
            for (const p of parts) {
              if (
                p.length > 5 &&
                p.match(/road|rd\b|street|lane|nagar|colony|bazaar|market|station|more|highway|cross|chowk|block|para|complex/i)
              ) {
                cardAddress = p;
                break;
              }
            }

            // Coordinates from URL
            let lat = 22.72, lng = 88.48;
            const c1 = href.match(/@(-?[\d.]+),(-?[\d.]+)/);
            if (c1) {
              lat = parseFloat(c1[1]);
              lng = parseFloat(c1[2]);
            } else {
              const lat3d = href.match(/!3d(-?[\d.]+)/);
              const lng4d = href.match(/!4d(-?[\d.]+)/);
              if (lat3d && lng4d) {
                lat = parseFloat(lat3d[1]);
                lng = parseFloat(lng4d[1]);
              }
            }

            return { href, name, cardRating, cardReviews, cardAddress, lat, lng };
          })
          .filter(Boolean);
      }, { cityArg: city });

      for (const item of items) {
        if (!targetsMap.has(item.href)) {
          targetsMap.set(item.href, item);
        }
      }
    } catch {}
  }

  for (let pass = 0; pass < MAX_SCROLL; pass++) {
    if (page.isClosed()) break;

    await harvestVisibleListings();
    const curCount = targetsMap.size;

    // Check if end of list reached
    const endCount = await page.locator('text="You\'ve reached the end of the list"').count().catch(() => 0);
    if (endCount > 0) {
      emit({ type: "status", message: `All results loaded (${curCount} businesses) ✓` });
      break;
    }

    if (curCount >= 100) {
      emit({ type: "status", message: `Loaded ${curCount} businesses from feed ✓` });
      break;
    }

    if (curCount > lastCount) {
      stallCount = 0;
      lastCount = curCount;
      emit({ type: "status", message: `Found ${curCount} businesses so far... scrolling for more...` });
    } else {
      stallCount++;
      if (stallCount >= 5 && curCount > 0) {
        emit({ type: "status", message: `Search feed fully captured (${curCount} businesses) ✓` });
        break;
      }
    }

    // Scroll feed
    await page.evaluate(() => {
      const feed =
        document.querySelector('[role="feed"]') ||
        document.querySelector(".m6QErb[aria-label]") ||
        document.querySelector(".m6QErb");
      if (feed) feed.scrollTop = feed.scrollHeight;
      else window.scrollBy(0, 2500);
    }).catch(() => {});

    await delay(SCROLL_DELAY);
  }

  // Final harvest
  await harvestVisibleListings();

  const targets = Array.from(targetsMap.values());
  const total = targets.length;

  if (total === 0) {
    emit({ type: "error", message: "No businesses found in the selected city. Please try another niche or location." });
    await browser.close().catch(() => {});
    return [];
  }

  emit({ type: "status", message: `Discovered ${total} businesses — extracting verified phone numbers & details...` });

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2: Extract verified details with 4-Layer Phone Detection
  // ════════════════════════════════════════════════════════════════════════════
  const leads = [];

  for (let idx = 0; idx < total; idx++) {
    if (page.isClosed()) break;
    const target = targets[idx];

    emit({ type: "status", message: `[${idx + 1}/${total}] Extracting: ${target.name}...` });

    try {
      // Direct navigation to place URL: 100% reliable, zero click overlays, zero timeouts
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 20000 });

      // Crucial: wait for Google Maps dynamic JS hydration to mount buttons and data-item-id
      await delay(HYDRATION_DELAY);

      const details = await extractDetailsFromLoadedPage(page, target);

      let lead = {
        id: `${sessionId}_m${String(leads.length + 1).padStart(3, "0")}`,
        name: details.name || target.name,
        category: details.category || niche,
        address: details.address || target.cardAddress || city,
        city,
        phone: details.phone || undefined,
        whatsapp: details.phone || undefined,
        website: details.website || undefined,
        mapUrl: target.href,
        rating: details.rating ?? target.cardRating ?? null,
        reviewsCount: details.reviewsCount ?? target.cardReviews ?? null,
        lat: target.lat,
        lng: target.lng,
        hours: details.hours.length > 0 ? details.hours : undefined,
        services: details.services.length > 0 ? details.services : undefined,
        photoUrls: details.photoUrls.length > 0 ? details.photoUrls : undefined,
        photosCount: details.photosCount || undefined,
        about: details.about || undefined,
        socialLinks: details.socialLinks.length > 0 ? details.socialLinks : undefined,
        priceLevel: details.priceLevel || undefined,
        source: "maps",
      };

      // Free Contact & Social Enrichment (website deep crawler, bio links)
      try {
        lead = await enrichLeadContacts(lead);
      } catch {}

      leads.push(lead);

      // Stream to frontend live immediately
      emit({ type: "lead", lead, index: leads.length, total });

      // Progressive backup to disk
      if (leads.length % 3 === 0 || idx === total - 1) {
        saveSession(leads);
      }
    } catch (err) {
      // Fallback lead on error so no business is dropped
      const fallbackLead = {
        id: `${sessionId}_m${String(leads.length + 1).padStart(3, "0")}`,
        name: target.name,
        category: niche,
        address: target.cardAddress || city,
        city,
        mapUrl: target.href,
        rating: target.cardRating || null,
        reviewsCount: target.cardReviews || null,
        lat: target.lat,
        lng: target.lng,
        source: "maps",
      };
      leads.push(fallbackLead);
      emit({ type: "lead", lead: fallbackLead, index: leads.length, total });
    }
  }

  saveSession(leads);
  await browser.close().catch(() => {});
  emitDone(leads);
  return leads;
}

/**
 * 4-Layer Phone Extractor & Complete Detail Scanner from loaded Google Maps page
 */
async function extractDetailsFromLoadedPage(page, target) {
  return await page.evaluate((fallbackTarget) => {
    let name = fallbackTarget.name;
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent?.trim()) {
      name = h1.textContent.trim();
    }

    // ─────────────────────────────────────────────────────────
    // 4-LAYER PHONE EXTRACTION
    // ─────────────────────────────────────────────────────────
    let phone = null;

    // Layer 1: button[data-item-id^="phone:"]
    const phoneBtn = document.querySelector('button[data-item-id^="phone:"]');
    if (phoneBtn) {
      const dataId = phoneBtn.getAttribute("data-item-id") || "";
      phone = dataId.replace("phone:tel:", "").replace("phone:", "").trim();
      if (!phone) {
        phone = phoneBtn.textContent?.trim() || null;
      }
    }

    // Layer 2: aria-label with phone info or copy tooltip
    if (!phone) {
      const ariaPhone = document.querySelector('[aria-label*="Phone:"], [data-tooltip="Copy phone number"], button[aria-label*="phone" i]');
      if (ariaPhone) {
        const lbl = ariaPhone.getAttribute("aria-label") || ariaPhone.textContent || "";
        const m = lbl.match(/[\d+][\d\s\-().]{8,}/);
        if (m) phone = m[0].replace(/[\s\-().]/g, "");
      }
    }

    // Layer 3: RegEx scan across all buttons in main pane
    if (!phone) {
      const buttons = Array.from(document.querySelectorAll('[role="main"] button, button[data-item-id]'));
      for (const btn of buttons) {
        const text = btn.textContent || "";
        const m = text.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b|\b0\d{2,4}[\s\-]?\d{6,8}\b)/);
        if (m) {
          phone = m[0].replace(/[\s\-]/g, "");
          break;
        }
      }
    }

    // Layer 4: Global main pane text scan
    if (!phone) {
      const mainText = document.querySelector('[role="main"]')?.textContent || document.body.textContent || "";
      const m = mainText.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b)/);
      if (m) phone = m[0].replace(/[\s\-]/g, "");
    }

    // Normalize phone format to standard +91XXXXXXXXXX
    if (phone) {
      let digits = phone.replace(/\D/g, "");
      if (digits.startsWith("0091") && digits.length === 14) digits = digits.slice(4);
      else if (digits.startsWith("910") && digits.length === 13) digits = digits.slice(3);
      else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
      else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);

      phone = digits.length === 10 && /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : phone;
    }

    // ─────────────────────────────────────────────────────────
    // WEBSITE & SOCIAL LINKS CLEANING
    // ─────────────────────────────────────────────────────────
    let website = null;
    const socialLinks = [];
    const siteAnchor = document.querySelector('a[data-item-id="authority"]');
    if (siteAnchor && siteAnchor.href) {
      website = siteAnchor.href;
    }

    // Move social links / aggregators from website
    if (website) {
      const low = website.toLowerCase();
      if (low.includes("facebook.com")) {
        socialLinks.push({ platform: "facebook", url: website });
        website = null;
      } else if (low.includes("instagram.com")) {
        socialLinks.push({ platform: "instagram", url: website });
        website = null;
      } else if (low.includes("google.com") || low.includes("business.site") || low.includes("goo.gl") || low.includes("g.page")) {
        website = null;
      } else if (low.includes("zomato.com") || low.includes("swiggy.com") || low.includes("justdial.com") || low.includes("indiamart.com")) {
        website = null; // Aggregator, not their own website
      }
    }

    // Scan for social profile buttons
    const socialAnchors = Array.from(
      document.querySelectorAll('a[href*="facebook.com"], a[href*="instagram.com"], a[href*="youtube.com"], a[href*="linkedin.com"]')
    );
    for (const a of socialAnchors) {
      const h = a.href;
      if (!h) continue;
      if (h.includes("facebook") && !socialLinks.some((s) => s.platform === "facebook")) {
        socialLinks.push({ platform: "facebook", url: h });
      } else if (h.includes("instagram") && !socialLinks.some((s) => s.platform === "instagram")) {
        socialLinks.push({ platform: "instagram", url: h });
      } else if (h.includes("youtube") && !socialLinks.some((s) => s.platform === "youtube")) {
        socialLinks.push({ platform: "youtube", url: h });
      } else if (h.includes("linkedin") && !socialLinks.some((s) => s.platform === "linkedin")) {
        socialLinks.push({ platform: "linkedin", url: h });
      }
    }

    // ─────────────────────────────────────────────────────────
    // ADDRESS, RATING, REVIEWS COUNT & CATEGORY
    // ─────────────────────────────────────────────────────────
    let address = "";
    const addrBtn = document.querySelector('button[data-item-id="address"]');
    if (addrBtn) {
      address = addrBtn.textContent?.trim() || "";
    }

    let rating = null;
    const rSpan = document.querySelector("div.fontDisplayLarge, span.MW4etd");
    if (rSpan) {
      const p = parseFloat(rSpan.textContent?.trim() || "");
      if (!isNaN(p)) rating = p;
    }

    let reviewsCount = null;
    const revSpan = document.querySelector('[role="main"] span[aria-label*="review"], [role="main"] button[aria-label*="review"]');
    if (revSpan) {
      const m = (revSpan.getAttribute("aria-label") || revSpan.textContent || "").match(/([\d,]+)/);
      if (m) reviewsCount = parseInt(m[1].replace(/,/g, ""), 10);
    }

    let category = "";
    const catBtn = document.querySelector('button[jsaction*="category"]');
    if (catBtn) category = catBtn.textContent?.trim() || "";

    // ─────────────────────────────────────────────────────────
    // EXTENDED: HOURS, PHOTOS, SERVICES, ABOUT
    // ─────────────────────────────────────────────────────────
    const hours = [];
    const copyBtns = Array.from(document.querySelectorAll('button[aria-label*="Copy open hours"]'));
    for (const btn of copyBtns) {
      const lbl = btn.getAttribute("aria-label") || "";
      const cleaned = lbl.replace(/,?\s*Copy open hours.*$/i, "").trim();
      if (cleaned.length > 3) hours.push(cleaned);
    }

    let photosCount = null;
    const photoBtns = Array.from(document.querySelectorAll('button[aria-label*="photo" i], a[aria-label*="photo" i]'));
    for (const btn of photoBtns) {
      const m = (btn.getAttribute("aria-label") || btn.textContent || "").match(/([\d,]+)\s*photo/i);
      if (m) {
        photosCount = parseInt(m[1].replace(/,/g, ""), 10);
        break;
      }
    }

    const photoUrls = [];
    const imgs = Array.from(document.querySelectorAll('img[src*="googleusercontent"]'));
    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      if (src && !src.includes("/a-/") && !src.includes("w28") && !photoUrls.includes(src)) {
        photoUrls.push(src);
        if (photoUrls.length >= 5) break;
      }
    }

    const services = [];
    const chips = Array.from(document.querySelectorAll('[role="main"] li, [role="main"] [role="listitem"]'));
    for (const chip of chips) {
      const txt = chip.textContent?.trim();
      if (txt && txt.length >= 3 && txt.length <= 40 && !txt.includes("·") && !services.includes(txt)) {
        services.push(txt);
        if (services.length >= 8) break;
      }
    }

    let priceLevel = undefined;
    const priceMatch = (document.querySelector('[role="main"]')?.textContent || "").match(/(₹{1,4})/);
    if (priceMatch) priceLevel = priceMatch[1];

    let about = "";
    const descEl = document.querySelector('[role="region"][aria-label*="About" i] p, [role="main"] div[aria-label*="description" i]');
    if (descEl) about = descEl.textContent?.trim() || "";

    return {
      name,
      phone,
      website,
      address,
      rating,
      reviewsCount,
      category,
      hours,
      socialLinks,
      photosCount,
      photoUrls,
      services,
      priceLevel,
      about,
    };
  }, target);
}

/** Fallback extractor for when Google Maps navigates directly to a single business page */
async function extractSinglePlaceDetails(page, href, idx) {
  try {
    const details = await extractDetailsFromLoadedPage(page, { name: "Business", cardAddress: city });
    let lead = {
      id: `${sessionId}_m${String(idx).padStart(3, "0")}`,
      name: details.name,
      category: details.category || niche,
      address: details.address || city,
      city,
      phone: details.phone || undefined,
      whatsapp: details.phone || undefined,
      website: details.website || undefined,
      mapUrl: href,
      rating: details.rating,
      reviewsCount: details.reviewsCount,
      lat: 22.72,
      lng: 88.48,
      hours: details.hours.length > 0 ? details.hours : undefined,
      services: details.services.length > 0 ? details.services : undefined,
      photoUrls: details.photoUrls.length > 0 ? details.photoUrls : undefined,
      photosCount: details.photosCount || undefined,
      about: details.about || undefined,
      socialLinks: details.socialLinks.length > 0 ? details.socialLinks : undefined,
      priceLevel: details.priceLevel || undefined,
      source: "maps",
    };

    try {
      lead = await enrichLeadContacts(lead);
    } catch {}

    return lead;
  } catch {
    return null;
  }
}

function emitDone(leads) {
  emit({
    type: "done",
    sessionId,
    total: leads.length,
    withPhone: leads.filter((l) => l.phone).length,
    noSite: leads.filter((l) => !l.website).length,
  });
}

scrapeGoogleMaps().catch((err) => {
  emit({ type: "error", message: `Fatal: ${String(err.message || err)}` });
  process.exit(1);
});
