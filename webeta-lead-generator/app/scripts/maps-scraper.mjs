/**
 * Hermes v3 — High-Performance Google Maps Scraper
 * Extracts all businesses directly from Google Maps feed:
 *   - Basic: name, phone, address, website, rating, reviews count, coordinates
 *   - Memory-safe (<80MB RAM) for 512MB hosted containers
 *   - Anti-bot detection bypass (disable webdriver flag)
 *   - Fast execution (under 60s total)
 *
 * Usage: node scripts/maps-scraper.mjs "cafe" "Barasat, West Bengal" [sessionId]
 *
 * Emits JSON lines to stdout for the SSE stream.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const niche     = process.argv[2] || "cafe";
const city      = process.argv[3] || "Barasat, West Bengal";
const sessionId = process.argv[4] || `session-${Date.now()}`;
const MAX_SCROLL = 40; // scrolls to load up to 100 businesses

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
  } catch {}
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
      "--window-size=1280,800",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--mute-audio",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    geolocation: { latitude: 20.5937, longitude: 78.9629 },
    permissions: ["geolocation"],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  // Mask automated browser signature so Google does not block search requests
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  // Block heavy assets (images, fonts, vector tiles) to keep memory usage under 80MB on Render
  await page.route("**/*", async (route) => {
    try {
      const type = route.request().resourceType();
      if (type === "media" || type === "font") {
        await route.abort().catch(() => {});
        return;
      }
      if (type === "image") {
        const url = route.request().url();
        if (
          url.includes("googleusercontent.com") ||
          url.includes("/maps/vt") ||
          url.includes("/maps/photometa") ||
          url.includes("streetviewpixels")
        ) {
          await route.abort().catch(() => {});
          return;
        }
      }
      await route.continue().catch(() => {});
    } catch {}
  });

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(niche + " in " + city)}?hl=en&gl=in`;
  const targetsMap = new Map(); // href -> raw item
  const leadsMap   = new Map(); // normalizedName -> lead

  try {
    emit({ type: "status", message: "Opening Google Maps..." });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(2500);

    // Accept cookies/consent dialog if shown
    try {
      const consentBtn = page.locator(
        'button:has-text("Accept all"), ' +
        'button:has-text("Reject all"), ' +
        'button:has-text("I agree"), ' +
        'button[aria-label*="Accept all" i], ' +
        'form[action*="consent"] button'
      ).first();
      if (await consentBtn.isVisible({ timeout: 2000 })) {
        await consentBtn.click();
        await delay(2000);
      }
    } catch {}

    // Check if Google Maps redirected directly to a single business page
    if (page.url().includes("/maps/place/")) {
      emit({ type: "status", message: "Single business match detected — extracting..." });
      const singleLead = await extractSingleBusinessFromPage(page, page.url(), sessionId);
      if (singleLead) {
        leadsMap.set(singleLead.name.toLowerCase().replace(/[^a-z0-9]/g, ""), singleLead);
        emit({ type: "lead", lead: singleLead, index: 1, total: 1 });
        saveSession([singleLead]);
      }
      await browser.close().catch(() => {});
      const all = Array.from(leadsMap.values());
      emit({
        type: "done",
        total: all.length,
        withPhone: all.filter((l) => l.phone).length,
        noSite: all.filter((l) => !l.website).length,
        sessionId,
      });
      return all;
    }

    // Wait for search results container to appear
    emit({ type: "status", message: "Loading search results..." });
    try {
      await page.waitForSelector('[role="feed"], a[href*="/maps/place/"]', { timeout: 15000 });
      await delay(1500);
    } catch {}

    // ── Harvest visible cards directly from feed DOM ───────────────────
    async function harvestVisibleListings() {
      if (page.isClosed()) return;
      try {
        const items = await page.evaluate((nicheArg, cityArg) => {
          const feed = document.querySelector('[role="feed"]') || document;
          const links = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));

          return links
            .map((a) => {
              const href = a.href || "";
              const rawName = a.getAttribute("aria-label") || a.textContent?.trim() || "";
              const name = rawName.replace(/^·\s*/, "").trim();
              if (!href || !name || name.length < 2) return null;

              // Enclosing business card container
              let card = a.parentElement;
              for (let i = 0; i < 4; i++) {
                if (card && card.parentElement && card.parentElement.children.length > 2) {
                  card = card.parentElement;
                  break;
                }
                if (card && card.parentElement) card = card.parentElement;
              }

              const text = card ? (card.textContent || "") : "";

              // Rating
              let rating = null;
              const rm = text.match(/\b([1-5]\.\d)\b/);
              if (rm) rating = parseFloat(rm[1]);

              // Reviews count
              let reviewsCount = null;
              const rvm = text.match(/\(([\d,]+)\)/);
              if (rvm) reviewsCount = parseInt(rvm[1].replace(/,/g, ""), 10);

              // Phone number
              let phone = null;
              const pm = text.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b|\b0\d{2,4}[\s\-]?\d{6,8}\b)/);
              if (pm) phone = pm[0].replace(/[\s\-]/g, "");

              // Website link
              let website = null;
              if (card) {
                const anchors = card.getElementsByTagName("a");
                for (let j = 0; j < anchors.length; j++) {
                  const h = anchors[j].href || "";
                  if (
                    h.startsWith("http") &&
                    !h.includes("google.") &&
                    !h.includes("goo.gl") &&
                    !h.includes("googleusercontent.")
                  ) {
                    website = h;
                    break;
                  }
                }
              }

              // Address snippet from card text
              let address = cityArg;
              const parts = text.split("·").map((s) => s.trim()).filter(Boolean);
              for (const p of parts) {
                if (
                  p.length > 5 &&
                  p.match(/road|rd|street|lane|nagar|colony|bazaar|market|station|more|highway|cross|chowk/i)
                ) {
                  address = p;
                  break;
                }
              }

              return { href, name, rating, reviewsCount, phone, website, category: nicheArg, address };
            })
            .filter(Boolean);
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

              // Normalize phone to +91XXXXXXXXXX
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

              // Emit lead live immediately to the UI
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
      } catch {}
    }

    // ── Infinite Scroll Loop ───────────────────────────────────────────
    emit({ type: "status", message: "Scrolling Google Maps feed..." });
    let lastCount = 0;
    let sameCountTimes = 0;

    for (let scrollPass = 0; scrollPass < MAX_SCROLL; scrollPass++) {
      if (page.isClosed()) break;
      try {
        await harvestVisibleListings();

        const curCount = targetsMap.size;
        if (curCount >= 100) {
          emit({ type: "status", message: `Discovered ${curCount} businesses on Google Maps ✓` });
          break;
        }

        // Check if reached end of list
        const endReached = await page.locator('text="You\'ve reached the end of the list"').count();
        if (endReached > 0) {
          emit({ type: "status", message: `End of results reached (${curCount} businesses) ✓` });
          break;
        }

        if (curCount > 0 && curCount === lastCount) {
          sameCountTimes++;
          if (sameCountTimes >= 4) {
            emit({ type: "status", message: `Finished scrolling (${curCount} businesses found) ✓` });
            break;
          }
        } else if (curCount > lastCount) {
          sameCountTimes = 0;
          lastCount = curCount;
          emit({ type: "status", message: `Found ${curCount} businesses so far... scrolling for more...` });
        }

        // Scroll feed container
        await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]');
          if (feed) {
            feed.scrollBy(0, 3000);
          } else {
            window.scrollBy(0, 2000);
          }
        }).catch(() => {});

        await delay(1500);
      } catch {
        break;
      }
    }

    // Final harvest pass
    await harvestVisibleListings();

    const allLeads = Array.from(leadsMap.values());
    emit({ type: "status", message: `Discovered ${allLeads.length} businesses. Enriching contact info...` });
    saveSession(allLeads);

    // ── Quick Phone Enrichment for Leads Missing Phone Numbers ─────────
    // Fast (<3s each) isolated tab checks for up to 10 high-priority leads
    const leadsMissingPhone = allLeads.filter((l) => !l.phone).slice(0, 10);
    for (let i = 0; i < leadsMissingPhone.length; i++) {
      const target = leadsMissingPhone[i];
      if (!target.mapUrl) continue;

      let detailPage = null;
      try {
        detailPage = await context.newPage();
        detailPage.setDefaultTimeout(8000);

        await detailPage.route("**/*", (r) => {
          const rt = r.request().resourceType();
          if (rt === "image" || rt === "media" || rt === "font") return r.abort().catch(() => {});
          return r.continue().catch(() => {});
        });

        await detailPage.goto(target.mapUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        await delay(800);

        let phoneFound = null;
        const phoneBtn = detailPage.locator('button[data-item-id^="phone:"]');
        if (await phoneBtn.count() > 0) {
          const id = await phoneBtn.first().getAttribute("data-item-id");
          if (id) {
            const raw = id.replace("phone:tel:", "").replace("phone:", "").trim();
            const digits = raw.replace(/\D/g, "");
            if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) phoneFound = `+91${digits}`;
          }
        }

        if (phoneFound) {
          target.phone = phoneFound;
          target.whatsapp = phoneFound;
          const key = target.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          leadsMap.set(key, target);
          emit({ type: "lead", lead: target, index: i + 1, total: allLeads.length });
        }
      } catch {} finally {
        if (detailPage) await detailPage.close().catch(() => {});
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
      const h1 = document.querySelector("h1");
      if (h1 && h1.textContent?.trim()) name = h1.textContent.trim();

      let phone = null;
      const phoneBtn = document.querySelector('button[data-item-id^="phone:"]');
      if (phoneBtn) {
        const id = phoneBtn.getAttribute("data-item-id") || "";
        phone = id.replace("phone:tel:", "").replace("phone:", "").trim();
      }

      let address = "";
      const addrBtn = document.querySelector('button[data-item-id="address"]');
      if (addrBtn) address = addrBtn.textContent?.trim() || "";

      let website = null;
      const siteLink = document.querySelector('a[data-item-id="authority"]');
      if (siteLink && siteLink.href && !siteLink.href.includes("google.com")) website = siteLink.href;

      let rating = null;
      const rSpan = document.querySelector("div.fontDisplayLarge, span.MW4etd");
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
