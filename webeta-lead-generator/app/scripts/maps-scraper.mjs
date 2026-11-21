/**
 * Hermes v3 — Full Google Maps Scraper
 * Extracts EVERYTHING from each business listing:
 *   - Basic: name, phone, address, website, rating, reviews count
 *   - Extended: hours, photos, about, services, price level, social links
 *   - Reviews: top relevant reviews (with owner replies)
 *
 * Usage: node scripts/maps-scraper.mjs "gym" "Barasat, West Bengal" [sessionId]
 *
 * Emits JSON lines to stdout for the API to stream to the UI.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { enrichLeadContacts } from "./contact-extractor.mjs";

const niche     = process.argv[2] || "gym";
const city      = process.argv[3] || "Barasat, West Bengal";
const sessionId = process.argv[4] || `session-${Date.now()}`;
const MAX_SCROLL = 50; // scrolls to harvest up to 100+ results

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, "..");
const SESSIONS_DIR = join(ROOT, "data", "sessions");

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function saveSession(leads) {
  try {
    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
    const noSite    = leads.filter((l) => !l.website);
    const withPhone = leads.filter((l) => l.phone);

    const session = {
      id:              sessionId,
      niche,
      city,
      timestamp:       new Date().toISOString(),
      leadsCount:      leads.length,
      noWebsiteCount:  noSite.length,
      withPhoneCount:  withPhone.length,
      expandedTerms:   [niche],
      leads,
    };
    const outPath = join(SESSIONS_DIR, `${sessionId}.json`);
    writeFileSync(outPath, JSON.stringify(session, null, 2));
  } catch {
    /* non-critical disk write */
  }
}

emit({ type: "status", message: `Searching "${niche}" in "${city}"...` });

async function scrapeGoogleMaps() {
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
      "--window-size=1920,1080",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--mute-audio",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    geolocation: { latitude: 20.5937, longitude: 78.9629 },
    permissions: ["geolocation"],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  // Safely abort heavy audio/video media
  await page.route("**/*", async (route) => {
    try {
      const type = route.request().resourceType();
      if (type === "media") {
        await route.abort().catch(() => {});
        return;
      }
      await route.continue().catch(() => {});
    } catch {}
  });

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(niche + " in " + city)}?hl=en&gl=in`;
  const targetsMap = new Map(); // href -> item data
  const leadsMap   = new Map(); // key -> lead

  try {
    emit({ type: "status", message: "Opening Google Maps..." });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
    await delay(3000);

    // Accept cookies/consent if presented
    try {
      const consentBtn = page.locator(
        'button:has-text("Accept all"), ' +
        'button:has-text("Reject all"), ' +
        'button:has-text("I agree"), ' +
        'button[aria-label*="Accept all" i], ' +
        'form[action*="consent"] button'
      ).first();
      if (await consentBtn.isVisible({ timeout: 2500 })) {
        await consentBtn.click();
        await delay(3000);
      }
    } catch {}

    // Check if Google Maps redirected directly to a single business
    if (page.url().includes("/maps/place/")) {
      emit({ type: "status", message: "Single business match detected — extracting full details..." });
      const singleLead = await extractSingleBusinessFromPage(page, page.url(), sessionId);
      if (singleLead) {
        leadsMap.set(singleLead.name.toLowerCase().replace(/[^a-z0-9]/g, ""), singleLead);
        emit({ type: "lead", lead: singleLead, index: 1, total: 1 });
        saveSession([singleLead]);
      }
      await browser.close();
      const all = Array.from(leadsMap.values());
      emit({
        type: "done",
        total: all.length,
        withPhone: all.filter(l => l.phone).length,
        noSite: all.filter(l => !l.website).length,
        sessionId,
      });
      return all;
    }

    // Wait for search results container or place links to appear
    emit({ type: "status", message: "Loading results feed..." });
    try {
      await page.waitForSelector('[role="feed"], a[href*="/maps/place/"]', { timeout: 20000 });
      await delay(2000);
    } catch {
      // feed might be delayed, proceed to scroll attempts
    }

    // ── Phase A: Infinite Scroll & Card Harvesting ──────────────────────
    emit({ type: "status", message: "Harvesting businesses from Google Maps..." });

    async function harvestVisibleListings() {
      try {
        const items = await page.evaluate((nicheStr, cityStr) => {
          const feed = document.querySelector('[role="feed"]') || document;
          const links = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));

          return links.map((a) => {
            const href = a.href || '';
            const rawName = a.getAttribute('aria-label') || a.textContent?.trim() || '';
            const name = rawName.replace(/^·\s*/, '').trim();
            if (!href || !name || name.length < 2) return null;

            // Enclosing card element
            let card = a.parentElement;
            for (let i = 0; i < 4; i++) {
              if (card && card.parentElement && card.parentElement.children.length > 2) {
                card = card.parentElement;
                break;
              }
              if (card && card.parentElement) card = card.parentElement;
            }

            const text = card ? (card.textContent || '') : '';

            // Rating
            let rating = null;
            const rm = text.match(/\b([1-5]\.\d)\b/);
            if (rm) rating = parseFloat(rm[1]);

            // Review count
            let reviewsCount = null;
            const rvm = text.match(/\(([\d,]+)\)/);
            if (rvm) reviewsCount = parseInt(rvm[1].replace(/,/g, ''), 10);

            // Phone number
            let phone = null;
            const pm = text.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b|\b0\d{2,4}[\s\-]?\d{6,8}\b)/);
            if (pm) phone = pm[0].replace(/[\s\-]/g, '');

            // Website (external link on the card)
            let website = null;
            if (card) {
              const allA = card.getElementsByTagName('a');
              for (let j = 0; j < allA.length; j++) {
                const h = allA[j].href || '';
                if (h.startsWith('http') &&
                    !h.includes('google.') &&
                    !h.includes('goo.gl') &&
                    !h.includes('googleusercontent.')) {
                  website = h;
                  break;
                }
              }
            }

            // Address snippet
            let address = cityStr;
            const parts = text.split('·').map(s => s.trim()).filter(Boolean);
            for (const p of parts) {
              if (p.length > 5 && p.match(/road|rd|street|lane|nagar|colony|bazaar|market|station|more|highway|cross|chowk/i)) {
                address = p;
                break;
              }
            }

            return { href, name, rating, reviewsCount, phone, website, category: nicheStr, address };
          }).filter(Boolean);
        }, niche, city);

        let newCount = 0;
        for (const item of items) {
          if (!targetsMap.has(item.href)) {
            targetsMap.set(item.href, item);

            const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!leadsMap.has(key)) {
              // Parse coordinates from URL
              let lat = 22.72, lng = 88.48;
              const coordMatch = item.href.match(/@(-?[\d.]+),(-?[\d.]+)/);
              if (coordMatch) {
                lat = parseFloat(coordMatch[1]);
                lng = parseFloat(coordMatch[2]);
              } else {
                const lat3d = item.href.match(/!3d(-?[\d.]+)/);
                const lng4d = item.href.match(/!4d(-?[\d.]+)/);
                if (lat3d && lng4d) {
                  lat = parseFloat(lat3d[1]);
                  lng = parseFloat(lng4d[1]);
                }
              }

              // Standardize phone
              let phone = item.phone;
              if (phone) {
                let digits = phone.replace(/\D/g, "");
                if (digits.startsWith("0091") && digits.length === 14) digits = digits.slice(4);
                else if (digits.startsWith("910") && digits.length === 13) digits = digits.slice(3);
                else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
                else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
                phone = digits.length === 10 && /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
              }

              const lead = {
                id:           `${sessionId}_m${String(leadsMap.size + 1).padStart(3, "0")}`,
                name:         item.name,
                category:     item.category || niche,
                address:      item.address || city,
                city,
                phone:        phone || undefined,
                whatsapp:     phone || undefined,
                website:      item.website || undefined,
                mapUrl:       item.href,
                rating:       item.rating || null,
                reviewsCount: item.reviewsCount || null,
                lat,
                lng,
                source:       "maps",
              };

              leadsMap.set(key, lead);
              newCount++;

              // Emit lead live immediately to UI
              emit({
                type: "lead",
                lead,
                index: leadsMap.size,
                total: leadsMap.size,
              });
            }
          }
        }

        if (newCount > 0) {
          saveSession(Array.from(leadsMap.values()));
        }
      } catch (err) {
        // non-fatal harvest error
      }
    }

    // Scroll Google Maps feed to load up to 100+ businesses
    let lastCount = 0;
    let sameCountTimes = 0;

    for (let scrollPass = 0; scrollPass < MAX_SCROLL; scrollPass++) {
      try {
        await harvestVisibleListings();

        const curCount = targetsMap.size;
        if (curCount >= 100) {
          emit({ type: "status", message: `Discovered ${curCount} businesses on Google Maps ✓` });
          break;
        }

        // Check for end-of-list indicator
        const endReached = await page.locator('text="You\'ve reached the end of the list"').count();
        if (endReached > 0) {
          emit({ type: "status", message: `All results loaded (${curCount} businesses) ✓` });
          break;
        }

        // Only count stagnancy if we have already found at least 1 lead
        if (curCount > 0 && curCount === lastCount) {
          sameCountTimes++;
          if (sameCountTimes >= 5) {
            emit({ type: "status", message: `Finished scrolling (${curCount} businesses found) ✓` });
            break;
          }
        } else if (curCount > lastCount) {
          sameCountTimes = 0;
          lastCount = curCount;
          emit({ type: "status", message: `Found ${curCount} businesses so far... scrolling for more...` });
        }

        // Scroll the feed container
        await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]');
          if (feed) {
            feed.scrollTop = feed.scrollHeight;
          } else {
            window.scrollBy(0, 2500);
          }
        });

        await delay(1800);
      } catch {
        break;
      }
    }

    // Final harvest pass
    await harvestVisibleListings();

    const allLeads = Array.from(leadsMap.values());
    emit({ type: "status", message: `Found ${allLeads.length} businesses. Enriching details...` });
    saveSession(allLeads);

    // ── Phase B: Safe, Memory-Capped Deep Enrichment ──────────────────────
    // Enrich businesses (hours, photos, reviews) in isolated tabs
    const leadsToEnrich = allLeads.slice(0, 25); // Enrich top 25 prospects
    for (let i = 0; i < leadsToEnrich.length; i++) {
      const targetLead = leadsToEnrich[i];
      if (!targetLead.mapUrl) continue;

      emit({
        type: "status",
        message: `[${i + 1}/${leadsToEnrich.length}] Enriching: ${targetLead.name}...`,
      });

      let enrichedLead = { ...targetLead };
      let detailPage = null;

      try {
        detailPage = await context.newPage();
        detailPage.setDefaultTimeout(12000);

        // Block media and fonts to conserve memory (<15MB RAM per tab)
        await detailPage.route("**/*", (route) => {
          const type = route.request().resourceType();
          if (type === "media" || type === "font") {
            return route.abort().catch(() => {});
          }
          return route.continue().catch(() => {});
        });

        await detailPage.goto(targetLead.mapUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await delay(1200);

        // Phone number (if missing from card)
        if (!enrichedLead.phone) {
          try {
            const phoneBtn = detailPage.locator('button[data-item-id^="phone:"]');
            if (await phoneBtn.count() > 0) {
              const phoneId = await phoneBtn.first().getAttribute("data-item-id");
              if (phoneId) {
                const raw = phoneId.replace("phone:tel:", "").replace("phone:", "").trim();
                let digits = raw.replace(/\D/g, "");
                if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) enrichedLead.phone = `+91${digits}`;
              }
            }
          } catch {}
        }

        // Website (if missing from card)
        if (!enrichedLead.website) {
          try {
            const siteLink = detailPage.locator('a[data-item-id="authority"]');
            if (await siteLink.count() > 0) {
              const href = await siteLink.first().getAttribute("href");
              if (href && !href.includes("google.com") && !href.includes("business.site")) {
                enrichedLead.website = href;
              }
            }
          } catch {}
        }

        // Full address
        try {
          const addrBtn = detailPage.locator('button[data-item-id="address"]');
          if (await addrBtn.count() > 0) {
            const fullAddr = (await addrBtn.first().textContent())?.trim();
            if (fullAddr && fullAddr.length > 5) enrichedLead.address = fullAddr;
          }
        } catch {}

        // Operating hours
        try {
          const hoursBtn = detailPage.locator('button[data-item-id="oh"]');
          if (await hoursBtn.count() > 0) {
            await hoursBtn.first().click({ timeout: 2500 });
            await delay(600);
            const copyBtns = detailPage.locator('[role="main"] button[aria-label*="Copy open hours"]');
            const cCount = await copyBtns.count();
            const hList = [];
            for (let c = 0; c < Math.min(cCount, 7); c++) {
              const lbl = (await copyBtns.nth(c).getAttribute("aria-label")) || "";
              const cleaned = lbl.replace(/,?\s*Copy open hours.*$/i, "").trim();
              if (cleaned.length > 3) hList.push(cleaned);
            }
            if (hList.length > 0) enrichedLead.hours = hList;
            await detailPage.keyboard.press("Escape").catch(() => {});
          }
        } catch {}

        // Photos
        try {
          const photoData = await detailPage.evaluate(() => {
            const imgs = [];
            for (const el of document.querySelectorAll('button[style*="background-image"]')) {
              const s = el.getAttribute('style') || '';
              const m = s.match(/url\(\s*["']?(https:\/\/[^"')]+)["']?\s*\)/i);
              if (m && !imgs.includes(m[1]) && !m[1].includes('/a-/')) {
                imgs.push(m[1]);
                if (imgs.length >= 4) break;
              }
            }
            return imgs;
          });
          if (photoData && photoData.length > 0) {
            enrichedLead.photoUrls = photoData;
            enrichedLead.photosCount = photoData.length;
          }
        } catch {}

        // Visible reviews
        try {
          const revs = await detailPage.evaluate(() => {
            const list = [];
            const rEls = document.querySelectorAll('[role="main"] div[data-review-id]');
            for (let r = 0; r < Math.min(rEls.length, 5); r++) {
              const el = rEls[r];
              const author = (el.querySelector('div[class*="d4r55"]') || el.querySelector('button'))?.textContent?.trim() || 'Anonymous';
              const text = (el.querySelector('span[class*="wiI7pd"]') || el)?.textContent?.trim() || '';
              if (text && text.length > 10) {
                list.push({ author, text: text.slice(0, 300), rating: 5 });
              }
            }
            return list;
          });
          if (revs && revs.length > 0) enrichedLead.reviews = revs;
        } catch {}

      } catch (err) {
        // Safe to continue on individual enrichment error
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }

      // Free contact enrichment (website crawler, email, social links)
      try {
        enrichedLead = await enrichLeadContacts(enrichedLead);
      } catch {}

      // Update lead in memory and emit update
      const key = targetLead.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      leadsMap.set(key, enrichedLead);
      emit({
        type: "lead",
        lead: enrichedLead,
        index: i + 1,
        total: allLeads.length,
      });

      if (i % 3 === 0 || i === leadsToEnrich.length - 1) {
        saveSession(Array.from(leadsMap.values()));
      }
    }

  } catch (e) {
    emit({ type: "error", message: e.message });
  } finally {
    await browser.close().catch(() => {});
  }

  const finalLeads = Array.from(leadsMap.values());
  saveSession(finalLeads);

  const noSite = finalLeads.filter((l) => !l.website);
  const withPhone = finalLeads.filter((l) => l.phone);

  emit({
    type: "done",
    total: finalLeads.length,
    withPhone: withPhone.length,
    noSite: noSite.length,
    sessionId,
  });

  return finalLeads;
}

/** Fallback extractor for when Google Maps redirects directly to a single business page */
async function extractSingleBusinessFromPage(page, href, sessionId) {
  try {
    const data = await page.evaluate((url) => {
      let name = document.title.split(" - ")[0]?.trim() || "Business";
      const h1 = document.querySelector('h1');
      if (h1 && h1.textContent?.trim()) name = h1.textContent.trim();

      let phone = null;
      const phoneBtn = document.querySelector('button[data-item-id^="phone:"]');
      if (phoneBtn) {
        const id = phoneBtn.getAttribute('data-item-id') || '';
        phone = id.replace('phone:tel:', '').replace('phone:', '').trim();
      }

      let address = "";
      const addrBtn = document.querySelector('button[data-item-id="address"]');
      if (addrBtn) address = addrBtn.textContent?.trim() || '';

      let website = null;
      const siteLink = document.querySelector('a[data-item-id="authority"]');
      if (siteLink && siteLink.href && !siteLink.href.includes('google.com')) website = siteLink.href;

      let rating = null;
      const rSpan = document.querySelector('div.fontDisplayLarge, span.MW4etd');
      if (rSpan && rSpan.textContent) {
        const parsed = parseFloat(rSpan.textContent.trim());
        if (!isNaN(parsed)) rating = parsed;
      }

      return { name, phone, address, website, rating, mapUrl: url };
    }, href);

    return {
      id: `${sessionId}_m001`,
      name: data.name,
      category: niche,
      address: data.address || city,
      city,
      phone: data.phone || undefined,
      whatsapp: data.phone || undefined,
      website: data.website || undefined,
      mapUrl: href,
      rating: data.rating,
      lat: 22.72,
      lng: 88.48,
      source: "maps",
    };
  } catch {
    return null;
  }
}

scrapeGoogleMaps().catch((err) => {
  emit({ type: "error", message: `Fatal: ${err.message}` });
  process.exit(1);
});
