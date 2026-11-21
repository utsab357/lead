/**
 * Hermes v8 — Live Continuous Stream + Progressive Phone Enrichment
 *
 * 1. Fast Feed Scroll: Collects 30-50 businesses and streams them to the UI IMMEDIATELY.
 * 2. Real-Time Enrichment: Visits each business and extracts verified phone (4-layer detection),
 *    website, opening hours, services, and photos. Updates the table in real-time.
 * 3. Never blank: Within 5 seconds, businesses appear in the UI.
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

const MAX_SCROLL      = 20;   // 20 scroll passes max (~30s total feed harvest)
const SCROLL_DELAY    = 1200; // ms between feed scrolls
const TARGET_CAP      = 40;   // stop feed scroll once 40 solid businesses are found
const HYDRATION_DELAY = 2200; // ms to let Google Maps place dynamic DOM hydrate

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
  page.setDefaultTimeout(20000);

  // Abort only heavy video/audio
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
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
  } catch (e) {
    emit({ type: "error", message: `Navigation error: ${String(e.message || e).slice(0, 120)}` });
    await browser.close().catch(() => {});
    return [];
  }

  await delay(2000);

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
        await delay(1500);
        break;
      }
    } catch {}
  }

  // Single place direct redirect?
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
    await page.waitForSelector('[role="feed"], a[href*="/maps/place/"]', { timeout: 15000 });
  } catch {
    emit({ type: "error", message: "Google Maps feed did not appear. Please check search parameters." });
    await browser.close().catch(() => {});
    return [];
  }

  await delay(800);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1: Stream basic leads live AS they appear during scroll
  // ════════════════════════════════════════════════════════════════════════════
  emit({ type: "status", message: "Discovering businesses..." });

  const targetsMap = new Map(); // href -> lead object
  const allLeads = [];
  let stallCount = 0;
  let lastCount = 0;

  async function harvestAndStreamVisibleListings() {
    try {
      const items = await page.evaluate(({ cityArg }) => {
        const feed = document.querySelector('[role="feed"]') || document;
        const anchors = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));

        return anchors
          .map((a) => {
            const href = a.href || "";
            if (!href || !href.includes("/maps/place/")) return null;

            let name =
              a.getAttribute("aria-label") ||
              a.querySelector('[class*="fontHeadlineSmall"]')?.textContent?.trim() ||
              a.textContent?.trim() ||
              "";
            name = name.replace(/^[·•\s]+/, "").trim();
            if (!name || name.length < 2) return null;

            let card = a.parentElement;
            for (let i = 0; i < 5; i++) {
              if (card && (card.getAttribute("role") === "article" || card.children.length > 2)) break;
              if (card?.parentElement) card = card.parentElement;
            }

            const text = card ? card.textContent || "" : "";

            let cardRating = null;
            const rm = text.match(/\b([1-5]\.\d)\b/);
            if (rm) cardRating = parseFloat(rm[1]);

            let cardReviews = null;
            const rvm = text.match(/\(([\d,]+)\)/);
            if (rvm) cardReviews = parseInt(rvm[1].replace(/,/g, ""), 10);

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
          const lead = {
            id: `${sessionId}_m${String(allLeads.length + 1).padStart(3, "0")}`,
            name: item.name,
            category: niche,
            address: item.cardAddress || city,
            city,
            mapUrl: item.href,
            rating: item.cardRating || null,
            reviewsCount: item.cardReviews || null,
            lat: item.lat,
            lng: item.lng,
            source: "maps",
          };

          targetsMap.set(item.href, lead);
          allLeads.push(lead);

          // Stream immediately to UI so the user sees results instantly
          emit({
            type: "lead",
            lead,
            index: allLeads.length,
            total: allLeads.length,
          });
        }
      }
    } catch {}
  }

  for (let pass = 0; pass < MAX_SCROLL; pass++) {
    if (page.isClosed()) break;

    await harvestAndStreamVisibleListings();
    const curCount = targetsMap.size;

    // Stop early if reached end of list
    const endCount = await page.locator('text="You\'ve reached the end of the list"').count().catch(() => 0);
    if (endCount > 0) {
      emit({ type: "status", message: `Search feed fully loaded (${curCount} businesses) ✓` });
      break;
    }

    // Stop feed scroll once TARGET_CAP is reached
    if (curCount >= TARGET_CAP) {
      emit({ type: "status", message: `Collected ${curCount} businesses — proceeding to detail extraction ✓` });
      break;
    }

    if (curCount > lastCount) {
      stallCount = 0;
      lastCount = curCount;
      emit({ type: "status", message: `Discovered ${curCount} businesses... scrolling for more...` });
    } else {
      stallCount++;
      if (stallCount >= 4 && curCount >= 15) {
        emit({ type: "status", message: `Feed finished (${curCount} businesses) ✓` });
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

  // Final quick harvest
  await harvestAndStreamVisibleListings();
  saveSession(allLeads);

  const total = allLeads.length;
  if (total === 0) {
    emit({ type: "error", message: "No businesses found. Try a different city or niche." });
    await browser.close().catch(() => {});
    return [];
  }

  emit({ type: "status", message: `Discovered ${total} businesses — now verifying phone numbers & contact info...` });

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2: Extract verified phone & details (updates the existing rows live)
  // ════════════════════════════════════════════════════════════════════════════
  for (let idx = 0; idx < total; idx++) {
    if (page.isClosed()) break;
    const currentLead = allLeads[idx];

    emit({ type: "status", message: `[${idx + 1}/${total}] Getting phone & details: ${currentLead.name}...` });

    try {
      await page.goto(currentLead.mapUrl, { waitUntil: "domcontentloaded", timeout: 18000 });
      await delay(HYDRATION_DELAY);

      const details = await extractDetailsFromLoadedPage(page, currentLead);

      // Merge verified contact details into the lead
      if (details.name) currentLead.name = details.name;
      if (details.phone) {
        currentLead.phone = details.phone;
        currentLead.whatsapp = details.phone;
      }
      if (details.website) currentLead.website = details.website;
      if (details.address) currentLead.address = details.address;
      if (details.rating) currentLead.rating = details.rating;
      if (details.reviewsCount) currentLead.reviewsCount = details.reviewsCount;
      if (details.hours?.length > 0) currentLead.hours = details.hours;
      if (details.services?.length > 0) currentLead.services = details.services;
      if (details.photoUrls?.length > 0) currentLead.photoUrls = details.photoUrls;
      if (details.photosCount) currentLead.photosCount = details.photosCount;
      if (details.socialLinks?.length > 0) currentLead.socialLinks = details.socialLinks;
      if (details.priceLevel) currentLead.priceLevel = details.priceLevel;
      if (details.about) currentLead.about = details.about;

      // Free Contact & Social Enrichment
      try {
        const enriched = await enrichLeadContacts(currentLead);
        Object.assign(currentLead, enriched);
      } catch {}

      // Re-emit updated lead so UI shows phone badge and WhatsApp link immediately
      emit({
        type: "lead",
        lead: currentLead,
        index: idx + 1,
        total,
      });

      // Save progressive backup to disk
      if ((idx + 1) % 3 === 0 || idx === total - 1) {
        saveSession(allLeads);
      }
    } catch (err) {
      // Keep going to next business even if one page has timeout
    }
  }

  saveSession(allLeads);
  await browser.close().catch(() => {});
  emitDone(allLeads);
  return allLeads;
}

/**
 * 4-Layer Phone Extractor & Complete Detail Scanner
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
        website = null;
      }
    }

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
    // ADDRESS, RATING, REVIEWS COUNT
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

/** Fallback extractor for direct single place match */
async function extractSinglePlaceDetails(page, href, idx) {
  try {
    const details = await extractDetailsFromLoadedPage(page, { name: "Business", cardAddress: city });
    let lead = {
      id: `${sessionId}_m${String(idx).padStart(3, "0")}`,
      name: details.name,
      category: niche,
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
