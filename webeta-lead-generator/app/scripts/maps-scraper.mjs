/**
 * Hermes v4 — Robust Google Maps Scraper
 *
 * Strategy:
 *   1. Try standard Google Maps search URL (?q=... format)
 *   2. If feed never populates (0 leads after 6 passes), dump page diagnostics
 *   3. Try alternate URL strategy as fallback
 *   4. Stream leads live as they are found
 *
 * Usage: node scripts/maps-scraper.mjs "cafe" "Barasat, West Bengal" [sessionId]
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const niche     = process.argv[2] || "cafe";
const rawCity   = process.argv[3] || "Barasat, West Bengal";
const sessionId = process.argv[4] || `session-${Date.now()}`;

// Always append ", India" if no country/state context
const city = rawCity.includes(",") ? rawCity : `${rawCity}, India`;

const MAX_SCROLL    = 50;   // max scroll passes
const STALL_PASSES  = 8;    // passes with 0 new leads before giving up
const SCROLL_DELAY  = 2000; // ms between scrolls

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
    const session = {
      id:             sessionId,
      niche,
      city,
      timestamp:      new Date().toISOString(),
      leadsCount:     leads.length,
      noWebsiteCount: leads.filter((l) => !l.website).length,
      withPhoneCount: leads.filter((l) => l.phone).length,
      expandedTerms:  [niche],
      leads,
    };
    writeFileSync(join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(session, null, 2));
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
      "--window-size=1280,900",
    ],
  });

  // Realistic browser context
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "accept-language": "en-US,en;q=0.9",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

  // Mask automation
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Block only heavy media — keep everything else (images, fonts, vector tiles needed by Maps)
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

  const targetsMap = new Map(); // href -> raw item
  const leadsMap   = new Map(); // normalizedName -> lead

  // ── URL strategies to try ───────────────────────────────────────────────────
  const query = encodeURIComponent(`${niche} in ${city}`);
  const urls = [
    // Standard search - most reliable
    `https://www.google.com/maps/search/${query}?hl=en&gl=in`,
    // Alternative query format
    `https://www.google.com/maps/search/?api=1&query=${query}&hl=en`,
  ];

  let feedLoaded = false;

  for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
    const targetUrl = urls[urlIdx];
    emit({ type: "status", message: urlIdx === 0 ? "Opening Google Maps..." : "Trying alternate Maps URL..." });

    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
      await delay(3000);

      // Handle consent/cookie dialog
      try {
        const consentSelectors = [
          'button:has-text("Accept all")',
          'button:has-text("Reject all")',
          'button:has-text("I agree")',
          'button[aria-label*="Accept" i]',
          'form[action*="consent"] button',
          'button:has-text("Agree")',
        ];
        for (const sel of consentSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await btn.click().catch(() => {});
            await delay(2500);
            break;
          }
        }
      } catch {}

      // Diagnostic: what page did we actually get?
      let pageTitle = "";
      try {
        pageTitle = await page.title();
        emit({ type: "status", message: `Google Maps page: "${pageTitle}"` });
      } catch {}

      // Check for single business redirect
      if (page.url().includes("/maps/place/")) {
        emit({ type: "status", message: "Single result — extracting..." });
        const lead = await extractSingleBusiness(page, page.url());
        if (lead) {
          leadsMap.set(lead.name.toLowerCase().replace(/[^a-z0-9]/g, ""), lead);
          emit({ type: "lead", lead, index: 1, total: 1 });
          saveSession([lead]);
        }
        break;
      }

      // Wait for feed to appear
      emit({ type: "status", message: "Loading search results..." });
      let feedSelector = null;
      try {
        await page.waitForSelector('[role="feed"]', { timeout: 12000 });
        feedSelector = '[role="feed"]';
        feedLoaded = true;
      } catch {
        // Try alternate selectors
        try {
          await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 8000 });
          feedLoaded = true;
        } catch {}
      }

      // Dump page diagnostics regardless
      try {
        const feedCount  = await page.locator('[role="feed"]').count();
        const linkCount  = await page.locator('a[href*="/maps/place/"]').count();
        const bodyText   = await page.evaluate(() =>
          (document.body?.innerText || "").slice(0, 400).replace(/\s+/g, " ")
        );
        emit({ type: "status", message: `Feed: ${feedCount} role=feed elements, ${linkCount} place links found` });
        if (linkCount === 0) {
          emit({ type: "status", message: `Page content preview: ${bodyText.slice(0, 200)}` });
        }
      } catch {}

      if (!feedLoaded && urlIdx < urls.length - 1) {
        emit({ type: "status", message: "No results feed found — trying alternate URL..." });
        continue; // try next URL
      }

      // ── Harvest function ─────────────────────────────────────────────────────
      async function harvestVisibleListings() {
        if (page.isClosed()) return 0;
        let newCount = 0;
        try {
          const items = await page.evaluate((nicheArg, cityArg) => {
            // Try feed-scoped query first, fall back to whole document
            const feed = document.querySelector('[role="feed"]') || document;
            const links = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));

            return links.map((a) => {
              const href = a.href || "";
              if (!href || !href.includes("/maps/place/")) return null;

              const rawName =
                a.getAttribute("aria-label") ||
                a.querySelector('[class*="fontHeadlineSmall"]')?.textContent?.trim() ||
                a.textContent?.trim() ||
                "";
              const name = rawName.replace(/^[·•\s]+/, "").trim();
              if (!name || name.length < 2) return null;

              // Walk up to find the card container (up to 6 levels)
              let card = a;
              for (let i = 0; i < 7; i++) {
                if (!card.parentElement) break;
                card = card.parentElement;
                // Stop if we hit a list item or large sibling group
                if (card.children.length > 2 || card.getAttribute("role") === "article") break;
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

              // Phone number (Indian formats)
              let phone = null;
              const pm = text.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b|\b0\d{2,4}[\s\-]?\d{6,8}\b)/);
              if (pm) phone = pm[0].replace(/[\s\-]/g, "");

              // Website (non-Google link in card)
              let website = null;
              const allLinks = card ? Array.from(card.querySelectorAll("a[href]")) : [];
              for (const lnk of allLinks) {
                const h = lnk.href || "";
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

              // Address from card text segments
              let address = cityArg;
              const parts = text.split(/[·•]/).map((s) => s.trim()).filter(Boolean);
              for (const p of parts) {
                if (
                  p.length > 5 &&
                  p.match(/road|rd|street|lane|nagar|colony|bazaar|market|station|more|highway|cross|chowk|block|para/i)
                ) {
                  address = p;
                  break;
                }
              }

              return { href, name, rating, reviewsCount, phone, website, category: nicheArg, address };
            }).filter(Boolean);
          }, niche, city);

          for (const item of items) {
            if (targetsMap.has(item.href)) continue;
            targetsMap.set(item.href, item);

            const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (leadsMap.has(key)) continue;

            // Extract coordinates
            let lat = 22.72, lng = 88.48;
            const c1 = item.href.match(/@(-?[\d.]+),(-?[\d.]+)/);
            if (c1) { lat = parseFloat(c1[1]); lng = parseFloat(c1[2]); }
            else {
              const lat3d = item.href.match(/!3d(-?[\d.]+)/);
              const lng4d = item.href.match(/!4d(-?[\d.]+)/);
              if (lat3d && lng4d) { lat = parseFloat(lat3d[1]); lng = parseFloat(lng4d[1]); }
            }

            // Normalize phone
            let phone = item.phone;
            if (phone) {
              let d = phone.replace(/\D/g, "");
              if (d.startsWith("0091") && d.length === 14) d = d.slice(4);
              else if (d.startsWith("910") && d.length === 13) d = d.slice(3);
              else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
              else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
              phone = d.length === 10 && /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
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

            emit({
              type:  "lead",
              lead,
              index: leadsMap.size,
              total: leadsMap.size,
            });
          }

          if (newCount > 0) saveSession(Array.from(leadsMap.values()));
        } catch (err) {
          emit({ type: "status", message: `Harvest notice: ${String(err.message || err).slice(0, 80)}` });
        }
        return newCount;
      }

      // ── Scroll loop ───────────────────────────────────────────────────────────
      emit({ type: "status", message: "Scrolling Google Maps feed..." });
      let stallCount  = 0;
      let lastCount   = 0;

      for (let pass = 0; pass < MAX_SCROLL; pass++) {
        if (page.isClosed()) break;

        await harvestVisibleListings();
        const curCount = targetsMap.size;

        if (curCount >= 120) {
          emit({ type: "status", message: `Found ${curCount} businesses ✓` });
          break;
        }

        // Check end of list
        try {
          const endEl = await page.locator('text="You\'ve reached the end of the list"').count();
          if (endEl > 0) {
            emit({ type: "status", message: `End of list reached (${curCount} total) ✓` });
            break;
          }
        } catch {}

        if (curCount > lastCount) {
          stallCount = 0;
          lastCount  = curCount;
          if (curCount > 0) {
            emit({ type: "status", message: `Found ${curCount} businesses... scrolling for more...` });
          }
        } else {
          stallCount++;
          if (stallCount >= STALL_PASSES) {
            if (curCount === 0 && pass >= STALL_PASSES - 1) {
              // Page is completely empty — dump diagnostics
              emit({ type: "status", message: "No results after multiple passes — dumping diagnostics..." });
              try {
                const feedCount  = await page.locator('[role="feed"]').count();
                const placeLinks = await page.locator('a[href*="/maps/place/"]').count();
                const bodyText   = await page.evaluate(() =>
                  (document.body?.innerText || "").slice(0, 600).replace(/\s+/g, " ")
                );
                emit({ type: "status", message: `Diagnostic: feed=${feedCount}, placeLinks=${placeLinks}, title="${await page.title()}"` });
                emit({ type: "status", message: `Page text: ${bodyText.slice(0, 300)}` });
              } catch {}
            }
            emit({ type: "status", message: `Scroll complete (${curCount} found) ✓` });
            break;
          }
        }

        // Scroll the feed container
        await page.evaluate(() => {
          const feed =
            document.querySelector('[role="feed"]') ||
            document.querySelector('div[jsaction*="mouseover"]') ||
            document.querySelector(".m6QErb");
          if (feed) {
            feed.scrollTop = feed.scrollHeight;
          } else {
            window.scrollBy(0, 2500);
          }
        }).catch(() => {});

        await delay(SCROLL_DELAY);
      }

      // Final harvest
      await harvestVisibleListings();
      feedLoaded = true; // mark as handled even if 0 results
      break; // done with URL loop
    } catch (e) {
      emit({ type: "status", message: `URL ${urlIdx + 1} error: ${String(e.message || e).slice(0, 100)}` });
      if (urlIdx >= urls.length - 1) {
        emit({ type: "error", message: `All URL strategies failed: ${String(e.message || e).slice(0, 150)}` });
      }
    }
  }

  await browser.close().catch(() => {});

  const finalLeads = Array.from(leadsMap.values());
  saveSession(finalLeads);

  emit({
    type:      "done",
    total:     finalLeads.length,
    withPhone: finalLeads.filter((l) => l.phone).length,
    noSite:    finalLeads.filter((l) => !l.website).length,
    sessionId,
  });

  return finalLeads;
}

/** Fallback: single business page */
async function extractSingleBusiness(page, href) {
  try {
    const data = await page.evaluate((url) => {
      let name  = document.title.split(" - ")[0]?.trim() || "Business";
      const h1  = document.querySelector("h1");
      if (h1?.textContent?.trim()) name = h1.textContent.trim();

      let phone   = null;
      const pb    = document.querySelector('button[data-item-id^="phone:"]');
      if (pb) phone = (pb.getAttribute("data-item-id") || "").replace("phone:tel:", "").replace("phone:", "").trim();

      let address = "";
      const ab    = document.querySelector('button[data-item-id="address"]');
      if (ab) address = ab.textContent?.trim() || "";

      let website = null;
      const sl    = document.querySelector('a[data-item-id="authority"]');
      if (sl?.href && !sl.href.includes("google.com")) website = sl.href;

      let rating  = null;
      const rs    = document.querySelector("div.fontDisplayLarge, span.MW4etd");
      if (rs) { const p = parseFloat(rs.textContent?.trim() || ""); if (!isNaN(p)) rating = p; }

      return { name, phone, address, website, rating, mapUrl: url };
    }, href);

    return {
      id:       `${sessionId}_m001`,
      name:     data.name,
      category: niche,
      address:  data.address || city,
      city,
      phone:    data.phone || undefined,
      whatsapp: data.phone || undefined,
      website:  data.website || undefined,
      mapUrl:   href,
      rating:   data.rating,
      lat:      22.72,
      lng:      88.48,
      source:   "maps",
    };
  } catch {
    return null;
  }
}

scrapeGoogleMaps().catch((err) => {
  emit({ type: "error", message: `Fatal: ${String(err.message || err)}` });
  process.exit(1);
});
