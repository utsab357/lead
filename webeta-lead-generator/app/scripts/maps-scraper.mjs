/**
 * Hermes v3 — Full Google Maps Scraper
 * Extracts EVERYTHING from each business listing:
 *   - Basic: name, phone, address, website, rating, reviews count
 *   - Extended: hours, photos, about, services, price level, social links
 *   - Reviews: 15 most relevant + 15 negative (with owner replies)
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
const MAX_SCROLL = 25; // scroll more to load all results

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, "..");

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
    ],
  });

  const context = await browser.newContext({
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    geolocation: { latitude: 20.5937, longitude: 78.9629 }, // Center of India
    permissions: ["geolocation"],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(niche + " in " + city)}?hl=en&gl=in`;
  const leads = [];

  try {
    emit({ type: "status", message: "Opening Google Maps..." });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await delay(3000);

    // Accept cookies/consent
    try {
      const btn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
      if (await btn.isVisible({ timeout: 2000 })) await btn.click();
    } catch { /* no banner */ }

    // ── Scroll to load ALL results ─────────────────────────────────────
    emit({ type: "status", message: "Loading all results..." });
    let lastCount = 0;
    let sameCountTimes = 0;
    for (let i = 0; i < MAX_SCROLL; i++) {
      try {
        await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]');
          if (feed) feed.scrollBy(0, 2000);
        });
        await delay(1500);

        // Check for end-of-list message
        const endText = await page.locator('text="You\'ve reached the end of the list"').count();
        if (endText > 0) {
          emit({ type: "status", message: "All results loaded ✓" });
          break;
        }
        // Also stop if result count stops growing (3 times in a row)
        const curCount = await page.locator('[role="feed"] a[href*="/maps/place/"]').count();
        if (curCount === lastCount) {
          sameCountTimes++;
          if (sameCountTimes >= 3) break;
        } else {
          sameCountTimes = 0;
          lastCount = curCount;
        }
      } catch { break; }
    }

    // ── Count total listings ───────────────────────────────────────────
    const totalLinks = await page.locator('[role="feed"] a[href*="/maps/place/"]').count();
    emit({ type: "status", message: `Found ${totalLinks} businesses — extracting full details...` });

    // ── Click each listing and extract EVERYTHING ──────────────────────
    for (let idx = 0; idx < totalLinks; idx++) {
      try {
        const links = page.locator('[role="feed"] a[href*="/maps/place/"]');
        const count = await links.count();
        if (idx >= count) break;

        const link = links.nth(idx);
        const name = (await link.getAttribute("aria-label")) || "";
        const href = (await link.getAttribute("href")) || "";
        if (!name || !href) continue;

        // Click to open business detail panel
        await link.click();
        await delay(3000);

        // Verify the detail panel updated to this business
        // (prevents data contamination — reading previous listing's phone/address)
        try {
          const nameCheck = name.trim().slice(0, 12).toLowerCase();
          const headingText = await page.evaluate(() => {
            const main = document.querySelector('[role="main"]');
            if (!main) return '';
            for (const el of main.querySelectorAll('h1, h2, div[role="heading"]')) {
              const t = el.textContent?.trim();
              if (t && t.length > 2 && t.length < 100) return t;
            }
            return '';
          });
          if (headingText && !headingText.toLowerCase().includes(nameCheck)) {
            // Panel still shows previous business — wait longer
            await delay(2500);
          }
        } catch { /* proceed anyway */ }

        // ──────────────────────────────────────────────────────────────
        // BASIC DATA
        // ──────────────────────────────────────────────────────────────
        let phone = null;
        let website = null;
        let address = "";
        let rating = null;
        let reviews = null;
        let category = niche;

        // Phone — 4 methods
        try {
          const phoneBtn = page.locator('button[data-item-id^="phone:"]');
          if (await phoneBtn.count() > 0) {
            const phoneId = await phoneBtn.first().getAttribute("data-item-id");
            if (phoneId) phone = phoneId.replace("phone:tel:", "").replace("phone:", "").trim();
          }
          if (!phone) {
            const phoneLbl = page.locator('[aria-label*="Phone:"], [data-tooltip="Copy phone number"]');
            if (await phoneLbl.count() > 0) {
              const lbl = await phoneLbl.first().getAttribute("aria-label") || "";
              const m = lbl.match(/[\d+][\d\s\-().]{7,}/);
              if (m) phone = m[0].replace(/[\s\-().]/g, "");
            }
          }
          if (!phone) {
            const allText = await page.locator('[role="main"]').textContent() || "";
            const m = allText.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b)/);
            if (m) phone = m[0].replace(/[\s\-]/g, "");
          }
          if (!phone) {
            const btns = await page.locator('[role="main"] button').allTextContents();
            for (const txt of btns) {
              const m = txt.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b)/);
              if (m) { phone = m[0].replace(/[\s\-]/g, ""); break; }
            }
          }
          if (phone) {
            let digits = phone.replace(/\D/g, "");
            if (digits.startsWith("0091") && digits.length === 14) digits = digits.slice(4);
            else if (digits.startsWith("910") && digits.length === 13) digits = digits.slice(3);
            else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
            else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
            phone = digits.length === 10 && /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
          }
        } catch { /* no phone */ }

        // Website
        try {
          const siteLink = page.locator('a[data-item-id="authority"]');
          if (await siteLink.count() > 0) website = await siteLink.first().getAttribute("href");
        } catch { /* no website */ }

        // Address
        try {
          const addrBtn = page.locator('button[data-item-id="address"]');
          if (await addrBtn.count() > 0) address = ((await addrBtn.first().textContent()) || "").trim();
        } catch { /* no address */ }

        // Rating
        try {
          const rSpan = page.locator('div.fontDisplayLarge');
          if (await rSpan.count() > 0) {
            const t = await rSpan.first().textContent();
            if (t) rating = parseFloat(t);
          }
        } catch { /* no rating */ }

        // Review count — the number shown next to the stars e.g. "(247)"
        try {
          // Try the specific review count button (shows star rating + count)
          const ratingBlock = page.locator('[role="main"] div.fontBodyMedium button, [role="main"] span[aria-label*="reviews"]');
          if (await ratingBlock.count() > 0) {
            for (let ri = 0; ri < Math.min(await ratingBlock.count(), 3); ri++) {
              const t = (await ratingBlock.nth(ri).textContent()) || "";
              const m = t.match(/([\d,]+)/);
              if (m && parseInt(m[1].replace(/,/g, ""), 10) > 0) {
                reviews = parseInt(m[1].replace(/,/g, ""), 10);
                break;
              }
            }
          }
          // Fallback: scan the full page text for "(N reviews)"
          if (!reviews) {
            const mainText = await page.locator('[role="main"]').first().textContent() || "";
            const m = mainText.match(/\(([\d,]+)\s+review/i);
            if (m) reviews = parseInt(m[1].replace(/,/g, ""), 10);
          }
        } catch { /* no reviews */ }

        // Category
        try {
          const catBtn = page.locator('button[jsaction*="category"]');
          if (await catBtn.count() > 0) category = (await catBtn.first().textContent()) || niche;
        } catch { /* use default */ }

        // Coordinates from URL
        let lat = 22.72, lng = 88.48;
        const coordMatch = href.match(/@(-?[\d.]+),(-?[\d.]+)/);
        if (coordMatch) {
          lat = parseFloat(coordMatch[1]);
          lng = parseFloat(coordMatch[2]);
        } else {
          // Google Maps place URLs encode coords as !3d<lat>!4d<lng>
          const lat3d = href.match(/!3d(-?[\d.]+)/);
          const lng4d = href.match(/!4d(-?[\d.]+)/);
          if (lat3d && lng4d) {
            lat = parseFloat(lat3d[1]);
            lng = parseFloat(lng4d[1]);
          }
        }

        // ──────────────────────────────────────────────────────────────
        // EXTENDED DATA (optimized for speed — ~10s per business)
        // ──────────────────────────────────────────────────────────────

        // Business hours — click to expand, then read aria-labels from "Copy open hours" buttons
        // Each day-row button has: aria-label="Thursday, 6 am to 10:30 pm, Copy open hours"
        let hours = [];
        try {
          const hoursBtn = page.locator('button[data-item-id="oh"]');
          if (await hoursBtn.count() > 0) {
            await hoursBtn.first().click();
            await delay(1000);
            // Read all "Copy open hours" buttons — each one contains a day + time in aria-label
            const copyBtns = page.locator('[role="main"] button[aria-label*="Copy open hours"]');
            const copyCount = await copyBtns.count();
            if (copyCount >= 2) {
              for (let ci = 0; ci < copyCount; ci++) {
                const label = await copyBtns.nth(ci).getAttribute('aria-label') || '';
                // Format: "Thursday, 6 am to 10:30 pm, Copy open hours"
                // Remove the trailing ", Copy open hours" part
                const cleaned = label.replace(/,?\s*Copy open hours.*$/i, '').trim();
                if (cleaned.length > 3) hours.push(cleaned);
              }
            }
            // Fallback: if no copy buttons found, try aria-label on the oh button itself
            if (hours.length === 0) {
              const label = await hoursBtn.first().getAttribute('aria-label') || '';
              if (label.length > 10) {
                hours = label.split(/[;]/).map(h => h.trim()).filter(Boolean);
              }
            }
            // Close the expanded dropdown
            await page.keyboard.press('Escape');
            await delay(300);
          } else {
            // Fallback: any aria-label with day names
            const hoursEl = page.locator('[role="main"] [aria-label*="Monday"], [role="main"] [aria-label*="Sunday"]');
            if (await hoursEl.count() > 0) {
              const label = await hoursEl.first().getAttribute('aria-label') || '';
              if (label.length > 10) {
                hours = label.split(/[;.]/).map(h => h.trim()).filter(h => h.length > 3 && /\d/.test(h));
              }
            }
          }
          // Clean all hours entries:
          // - Strip "Copy open hours" / "Hide open hours" / "See more hours" junk
          // - Strip Unicode thin space U+202F (Google uses it before am/pm)
          // - Normalize en-dash U+2013 to plain hyphen
          hours = hours
            .map(h => h
              .replace(/,?\s*Copy open hours.*$/i, '')
              .replace(/,?\s*Hide open hours.*$/i, '')
              .replace(/,?\s*See more hours.*$/i, '')
              .replace(/[\u202F\u00A0]/g, ' ')  // thin space / nbsp → normal space
              .replace(/\u2013/g, '-')            // en-dash → hyphen
              .replace(/\s+/g, ' ')
              .trim()
            )
            .filter(h => h.length > 3);
        } catch { /* no hours */ }

        // Photo URLs — Google Maps renders the photo strip as CSS background-image
        // on <button> elements (NOT <img> tags). We extract via inline style + computed style.
        let photosCount = 0;
        let photoUrls = [];
        try {
          // ── Try to get TOTAL photo count ──────────────────────────────
          // Strategy 1: aria-label on hero header or "See all photos" button
          // e.g. aria-label="See all 230 photos" or aria-label="1,234 photos"
          const totalFromAriaLabel = await page.evaluate(() => {
            const candidates = document.querySelectorAll(
              'button[jsaction*="heroHeaderImage"], button[jsaction*="pane.heroHeaderImage"], ' +
              'button[aria-label*="photo" i], button[aria-label*="Photo" i], ' +
              'a[aria-label*="photo" i], div[aria-label*="photo" i]'
            );
            for (const el of candidates) {
              const label = el.getAttribute('aria-label') || '';
              const m = label.match(/([\d,]+)\s*photo/i);
              if (m) return parseInt(m[1].replace(/,/g, ''), 10);
              // Also try text content
              const text = el.textContent || '';
              const tm = text.match(/([\d,]+)\s*photo/i);
              if (tm) return parseInt(tm[1].replace(/,/g, ''), 10);
            }
            return 0;
          });
          if (totalFromAriaLabel > 0) photosCount = totalFromAriaLabel;

          // Strategy 2: look for plain number near "photos" anywhere in panel header
          if (!photosCount) {
            const totalFromText = await page.evaluate(() => {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let node;
              while ((node = walker.nextNode())) {
                const t = node.textContent.trim();
                const m = t.match(/^([\d,]+)\s*photos?$/i);
                if (m) {
                  const count = parseInt(m[1].replace(/,/g, ''), 10);
                  if (count > 0) return count;
                }
              }
              return 0;
            });
            if (totalFromText > 0) photosCount = totalFromText;
          }

          // Strategy 3: old button locator fallback
          if (!photosCount) {
            const photoBtn = page.locator('button[jsaction*="pane.heroHeaderImage"], button[aria-label*="photo" i], button[aria-label*="Photo" i]');
            if (await photoBtn.count() > 0) {
              for (let pb = 0; pb < Math.min(await photoBtn.count(), 4); pb++) {
                const pText = (await photoBtn.nth(pb).textContent()) || '';
                const ariaLabel = await photoBtn.nth(pb).getAttribute('aria-label') || '';
                const combined = pText + ' ' + ariaLabel;
                const pMatch = combined.match(/([\d,]+)/);
                if (pMatch) { photosCount = parseInt(pMatch[1].replace(/,/g, ''), 10); break; }
              }
            }
          }

          // Extract photo URLs — check CSS background-image on photo strip buttons
          const panelPhotos = await page.evaluate(() => {
            const imgs = [];
            const feed = document.querySelector('[role="feed"]');

            // Method 1: background-image in inline style on buttons (most reliable for Maps panel)
            const candidates = document.querySelectorAll(
              'button[jsaction], [class*="aoRNLd"] button, [data-photo-index] button, button[style*="background"]'
            );
            for (const el of candidates) {
              if (feed && feed.contains(el)) continue;
              const style = el.getAttribute('style') || '';
              // Match inline background-image: url(...)
              const m = style.match(/background-image\s*:\s*url\(\s*["']?(https:\/\/[^"')]+)["']?\s*\)/i);
              if (m) {
                const url = m[1];
                if (!url.includes('/a-/') && !url.includes('/a/ACg') && !imgs.includes(url)) {
                  imgs.push(url);
                  if (imgs.length >= 6) break;
                }
              }
            }

            // Method 2: computed background-image (for dynamically applied styles)
            if (imgs.length < 3) {
              const allBtns = document.querySelectorAll('[role="main"] button');
              for (const btn of allBtns) {
                if (feed && feed.contains(btn)) continue;
                const computed = window.getComputedStyle(btn).backgroundImage;
                if (!computed || computed === 'none') continue;
                const m = computed.match(/url\(\s*["']?(https:\/\/(?:lh3|lh5|maps)\.googleusercontent\.com\/[^"')]+)["']?\s*\)/i);
                if (m) {
                  const url = m[1];
                  if (!imgs.includes(url)) {
                    imgs.push(url);
                    if (imgs.length >= 6) break;
                  }
                }
              }
            }

            // Method 3: fallback — img tags that do exist in some layouts
            if (imgs.length === 0) {
              for (const img of document.querySelectorAll('img[src*="googleusercontent"]')) {
                if (feed && feed.contains(img)) continue;
                const src = img.getAttribute('src') || '';
                if (src.includes('/a-/') || src.includes('/a/ACg')) continue;
                if (src.includes('w28') || src.includes('w36') || src.includes('w24')) continue;
                if (!imgs.includes(src)) imgs.push(src);
                if (imgs.length >= 6) break;
              }
            }

            return imgs;
          });

          photoUrls = panelPhotos || [];
          // Use found count as fallback if all strategies failed
          if (!photosCount && photoUrls.length > 0) photosCount = photoUrls.length;
        } catch { /* no photos */ }


        // About — click the "About" tab to extract:
        //   1. A free-text business description ("From the business") — if it exists
        //   2. Structured attributes (Amenities, Planning, Payments, Offerings, etc.)
        // Most small businesses only have #2. Some restaurants/hotels also have #1.
        let about = "";
        let aboutAttributes = {};
        try {
          const aboutTab = page.locator('[role="main"] button[aria-label*="About"], [role="main"] [role="tab"]:has-text("About")');
          if (await aboutTab.count() > 0) {
            await aboutTab.first().click();
            await delay(1500);

            // Extract structured attributes: { "Amenities": ["Restroom"], "Planning": ["Membership required"], ... }
            aboutAttributes = await page.evaluate(() => {
              const main = document.querySelector('[role="main"]');
              if (!main) return {};
              const result = {};
              // Junk headings/items from Google UI (not business attributes)
              const junkHeadings = /get the most out|sign in|google maps|overview|review|about|photo|privacy|cookie/i;
              const junkItems = /sign in|get the most|google maps|learn more|dismiss|privacy|cookie|personalized/i;
              const headings = main.querySelectorAll('h2, h3, h4, [role="heading"]');
              for (const heading of headings) {
                const title = (heading.textContent || '').trim();
                if (!title || title.length > 40 || title.length < 3) continue;
                if (junkHeadings.test(title)) continue;
                const section = heading.closest('div[class]') || heading.parentElement;
                if (!section) continue;
                const items = [];
                for (const el of section.querySelectorAll('li, span, div')) {
                  if (el.contains(heading)) continue;
                  if (el.children.length > 1) continue;
                  const txt = (el.textContent || '').trim();
                  if (txt.length >= 2 && txt.length <= 60 && txt !== title &&
                      !items.includes(txt) && /[A-Za-z]/.test(txt) &&
                      !junkItems.test(txt)) {
                    items.push(txt);
                  }
                }
                if (items.length > 0) result[title] = items.slice(0, 15);
              }
              return result;
            }) || {};

            // Extract free-text description ("From the business" paragraph) — rare but valuable
            const skipAbout = [
              'Wheelchair', 'Delivery', 'Accessibility', 'Amenities', 'Maps', 'JavaScript',
              'Sign in', 'Suggest an edit', 'hotel and vacation rental', 'personalized based on',
              'vacation', 'browsing activity', 'recent searches', 'Gmail', 'Restroom',
              'Membership', 'Debit cards', 'Credit cards', 'NFC mobile',
              'Get the most out of Google', 'google.com', 'Cookie', 'Privacy'
            ];
            about = await page.evaluate((skip) => {
              const main = document.querySelector('[role="main"]');
              if (!main) return '';
              for (const el of main.querySelectorAll('div, span, p')) {
                if (el.children.length > 0) continue;
                const txt = (el.textContent || '').trim();
                if (txt.length > 60 && txt.length < 800 &&
                    !skip.some(w => txt.includes(w)) &&
                    txt.split(' ').length > 10 &&
                    /[.!?,]/.test(txt) &&
                    // Skip address-like strings
                    !/\b\d{6}\b/.test(txt) &&           // postal codes (6 digits)
                    !/\b\d{3}\s?\d{3}\b/.test(txt) &&   // postal codes with space
                    !/Road[,\s]/.test(txt) &&            // "Road," or "Road "
                    !/Street[,\s]/.test(txt) &&          // "Street," or "Street "
                    !/Plot\s+No/i.test(txt) &&           // "Plot No"
                    !/Ward\s+No/i.test(txt) &&           // "Ward No"
                    !/Floor[,\s]/i.test(txt) &&          // "Floor," or "2nd Floor"
                    // Must have at least 2 sentences (real descriptions have sentences, addresses don't)
                    (txt.match(/\.\s+[A-Z]/g) || []).length >= 1) {
                  return txt;
                }
              }
              return '';
            }, skipAbout) || '';

            // Navigate back to Overview tab
            const overviewTab = page.locator('[role="main"] button[aria-label*="Overview"], [role="main"] [role="tab"]:has-text("Overview")');
            if (await overviewTab.count() > 0) {
              await overviewTab.first().click();
              await delay(800);
            }
          }
          // Fallback: try inline overview text (for businesses that show description without a tab)
          if (!about) {
            const skipInline = [
              'Wheelchair', 'Delivery', 'On-site', 'Accessibility', 'Amenities', 'Maps',
              'JavaScript', 'Sign in', 'hotel and vacation rental', 'personalized based on',
              'vacation', 'browsing activity', 'recent searches', 'Gmail'
            ];
            about = await page.evaluate((skip) => {
              const feed = document.querySelector('[role="feed"]');
              const main = document.querySelector('[role="main"]');
              if (!main) return '';
              for (const el of main.querySelectorAll('div, span, p')) {
                if (feed && feed.contains(el)) continue;
                if (el.children.length > 0) continue;
                let inReview = false;
                let anc = el.parentElement;
                while (anc && anc !== main) {
                  if (anc.hasAttribute('data-review-id')) { inReview = true; break; }
                  anc = anc.parentElement;
                }
                if (inReview) continue;
                const txt = (el.textContent || '').trim();
                if (txt.length > 60 && txt.length < 800 && !skip.some(w => txt.includes(w)) &&
                    txt.split(' ').length > 10 && /[.!?,]/.test(txt) &&
                    !/\b\d{6}\b/.test(txt) && !/\b\d{3}\s?\d{3}\b/.test(txt) &&
                    !/Road[,\s]/.test(txt) && !/Street[,\s]/.test(txt) &&
                    !/Plot\s+No/i.test(txt) && !/Ward\s+No/i.test(txt) && !/Floor[,\s]/i.test(txt) &&
                    (txt.match(/\.\s+[A-Z]/g) || []).length >= 1) {
                  return txt;
                }
              }
              return '';
            }, skipInline) || '';
          }
        } catch { /* no about */ }

        // Services list — amenity/service chips shown in the Overview panel
        let services = [];
        try {
          // Method 1: evaluate DOM for service/amenity chip sections
          services = await page.evaluate(() => {
            const main = document.querySelector('[role="main"]');
            const feed = document.querySelector('[role="feed"]');
            if (!main) return [];
            const result = new Set();
            const skipWords = ['Wheelchair', 'Restroom', 'LGBTQ', 'Gender', 'Planning', 'Payments', 'Dogs', 'Kids'];

            // Look for sections with labels like Offerings, Amenities, Highlights, Activities
            const sectionKeywords = /offering|amenit|highlight|activit|feature|service|popular/i;
            for (const el of main.querySelectorAll('[aria-label]')) {
              if (feed && feed.contains(el)) continue;
              const label = el.getAttribute('aria-label') || '';
              if (!sectionKeywords.test(label)) continue;
              for (const child of el.querySelectorAll('span, li, div')) {
                if (child.children.length > 0) continue;
                const txt = (child.textContent || '').trim();
                if (txt.length >= 3 && txt.length <= 50 &&
                    !skipWords.some(w => txt.toLowerCase().includes(w.toLowerCase())) &&
                    !/^\d+$/.test(txt) && !txt.includes('·') && !txt.includes('http')) {
                  result.add(txt);
                }
              }
            }

            // Also scan for standalone chip-like elements (short bold labels in the panel)
            if (result.size === 0) {
              for (const el of main.querySelectorAll('li, [role="listitem"]')) {
                if (feed && feed.contains(el)) continue;
                if (el.children.length > 2) continue;
                const txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
                if (txt.length >= 3 && txt.length <= 50 &&
                    !skipWords.some(w => txt.toLowerCase().includes(w.toLowerCase())) &&
                    !/^\d+$/.test(txt) && !txt.includes('·') && !txt.includes('http') &&
                    /[A-Za-z]/.test(txt)) {
                  result.add(txt);
                }
              }
            }
            return [...result].slice(0, 12);
          });

          // Method 2: Playwright locator fallback for service chip spans
          if (services.length === 0) {
            const svcItems = page.locator(
              '[role="main"] [aria-label*="Offering"] span, ' +
              '[role="main"] [aria-label*="Amenities"] span, ' +
              '[role="main"] [aria-label*="Highlights"] span, ' +
              '[role="main"] [aria-label*="Activities"] span, ' +
              '[role="main"] [aria-label*="Service"] span'
            );
            const svcCount = Math.min(await svcItems.count(), 12);
            for (let s = 0; s < svcCount; s++) {
              const txt = (await svcItems.nth(s).textContent())?.trim();
              if (txt && txt.length > 1 && txt.length <= 50 && !txt.includes('"') && !services.includes(txt)) {
                services.push(txt);
              }
            }
          }
        } catch { /* no services */ }

        // Price level
        let priceLevel = undefined;
        try {
          const mainText = await page.locator('[role="main"]').first().textContent() || "";
          const priceMatch = mainText.match(/(₹{1,4})/);
          if (priceMatch) priceLevel = priceMatch[1];
        } catch { /* no price */ }

        // Social media links
        let socialLinks = [];
        try {
          const smLinks = page.locator(
            '[role="main"] a[href*="facebook.com"], [role="main"] a[href*="instagram.com"], [role="main"] a[href*="youtube.com"], [role="main"] a[href*="linkedin.com"], [role="main"] a[href*="twitter.com"], [role="main"] a[href*="x.com"]'
          );
          const linkCount = Math.min(await smLinks.count(), 8);
          const seenPlatforms = new Set();
          for (let sl = 0; sl < linkCount; sl++) {
            const href2 = await smLinks.nth(sl).getAttribute("href");
            if (!href2) continue;
            let platform = "other";
            if (href2.includes("facebook")) platform = "facebook";
            else if (href2.includes("instagram")) platform = "instagram";
            else if (href2.includes("youtube")) platform = "youtube";
            else if (href2.includes("linkedin")) platform = "linkedin";
            else if (href2.includes("twitter") || href2.includes("x.com")) platform = "x";
            if (!seenPlatforms.has(platform)) {
              seenPlatforms.add(platform);
              socialLinks.push({ platform, url: href2 });
            }
          }
        } catch { /* no social */ }

        // Move Facebook/Instagram URLs from website to socialLinks
        // And discard Google / business.site links from being counted as a website
        if (website) {
          const lowerW = website.toLowerCase();
          if (lowerW.includes("facebook.com") || lowerW.includes("instagram.com")) {
            const fbPlatform = lowerW.includes("facebook") ? "facebook" : "instagram";
            if (!socialLinks.some((s) => s.platform === fbPlatform)) {
              socialLinks.push({ platform: fbPlatform, url: website });
            }
            website = null;
          } else if (
            lowerW.includes("google.com") ||
            lowerW.includes("maps.google.") ||
            lowerW.includes("goo.gl") ||
            lowerW.includes("business.site") ||
            lowerW.includes("g.page")
          ) {
            website = null;
          } else if (
            lowerW.includes("zomato.com") ||
            lowerW.includes("swiggy.com") ||
            lowerW.includes("practo.com") ||
            lowerW.includes("justdial.com") ||
            lowerW.includes("indiamart.com") ||
            lowerW.includes("magicpin.in") ||
            lowerW.includes("dineout.co.in") ||
            lowerW.includes("urbancompany.com") ||
            lowerW.includes("sulekha.com") ||
            lowerW.includes("lybrate.com") ||
            lowerW.includes("1mg.com") ||
            lowerW.includes("pharmeasy.in") ||
            lowerW.includes("nearbuy.com")
          ) {
            let plat = "other";
            if (lowerW.includes("zomato")) plat = "zomato";
            else if (lowerW.includes("swiggy")) plat = "swiggy";
            else if (lowerW.includes("practo")) plat = "practo";
            else if (lowerW.includes("justdial")) plat = "justdial";
            else if (lowerW.includes("indiamart")) plat = "indiamart";
            if (!socialLinks.some((s) => s.url === website)) {
              socialLinks.push({ platform: plat, url: website });
            }
            website = null;
          }
        }

        // ──────────────────────────────────────────────────────────────
        // REVIEWS — Overview snippets ONLY (no tab click, no sign-in)
        // Google shows 3-6 "most relevant" reviews on the Overview panel
        // extractVisibleReviews scrolls to find any lazy-loaded ones
        // ──────────────────────────────────────────────────────────────
        let reviewsData = [];
        let ownerReplies = false;
        try {
          const overviewReviewCount = await page.locator('div[data-review-id]').count();
          if (overviewReviewCount > 0) {
            reviewsData = await extractVisibleReviews(page, 10);
            ownerReplies = reviewsData.some(r => r.ownerReply);
          }
        } catch { /* reviews extraction failed */ }

        // ──────────────────────────────────────────────────────────────
        // BUILD LEAD OBJECT
        // ──────────────────────────────────────────────────────────────
        // If services is still empty, populate from aboutAttributes (Amenities, Offerings, etc.)
        if (services.length === 0 && Object.keys(aboutAttributes).length > 0) {
          for (const [category, items] of Object.entries(aboutAttributes)) {
            // Skip non-service categories
            if (/payment|planning|parking|accessibility/i.test(category)) continue;
            for (const item of items) {
              if (!services.includes(item)) services.push(item);
            }
          }
        }

        const lead = {
          id:           `${sessionId}_m${String(leads.length + 1).padStart(3, "0")}`,
          name:         name.trim(),
          category:     category.trim(),
          address,
          city,
          phone:        phone || undefined,
          whatsapp:     phone || undefined,
          website:      website || undefined,
          mapUrl:       href,
          rating,
          reviewsCount: reviews,
          lat,
          lng,
          // Extended
          hours:          hours.length > 0 ? hours : undefined,
          photoUrls:      photoUrls.length > 0 ? photoUrls : undefined,
          photosCount:    photosCount || undefined,
          about:          about || undefined,
          aboutAttributes: Object.keys(aboutAttributes).length > 0 ? aboutAttributes : undefined,
          services:       services.length > 0 ? services : undefined,
          priceLevel:     priceLevel || undefined,
          socialLinks:    socialLinks.length > 0 ? socialLinks : undefined,
          reviews:        reviewsData.length > 0 ? reviewsData : undefined,
          ownerReplies:   reviewsData.length > 0 ? ownerReplies : undefined,
          source:         "maps",
        };

        // Free email & social media enrichment (100% Free: website crawl, bio links, free search fallback)
        let finalLead = lead;
        try {
          finalLead = await enrichLeadContacts(lead);
        } catch {
          /* fail-safe: keep base lead on error */
        }

        leads.push(finalLead);

        // Emit each lead live
        emit({ type: "lead", lead: finalLead, index: idx + 1, total: totalLinks });

        // Close detail panel
        await page.keyboard.press("Escape");
        await delay(1200);

      } catch (e) {
        emit({ type: "status", message: `Skipped #${idx + 1}: ${e.message?.slice(0, 50)}` });
        try {
          await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await delay(2500);
          for (let s = 0; s < 5; s++) {
            await page.evaluate(() => {
              const feed = document.querySelector('[role="feed"]');
              if (feed) feed.scrollBy(0, 2000);
            });
            await delay(700);
          }
        } catch { /* continue */ }
      }
    }
  } catch (e) {
    emit({ type: "error", message: e.message });
  } finally {
    await browser.close();
  }

  return leads;
}

/**
 * Extract reviews using scroll-and-harvest approach.
 * Google Maps uses a VIRTUAL LIST — reviews are removed from DOM as you
 * scroll past them. So we must harvest visible reviews on EVERY scroll pass,
 * not just at the end.
 */
async function extractVisibleReviews(page, maxCount) {
  const seenAuthors = new Set();
  const reviews = [];

  // Helper: harvest all currently visible review elements
  async function harvestVisible() {
    let reviewEls = page.locator('[role="main"] div[data-review-id]');
    let elCount = await reviewEls.count();
    if (elCount === 0) {
      reviewEls = page.locator('[role="main"] div[class*="jftiEf"]');
      elCount = await reviewEls.count();
    }

    for (let i = 0; i < elCount; i++) {
      if (reviews.length >= maxCount) break;
      try {
        const el = reviewEls.nth(i);

        // Author first (for dedup check before doing any other work)
        let author = "";
        try {
          const authorEl = el.locator('div[class*="d4r55"], button[class*="al6Kxe"]');
          if (await authorEl.count() > 0) author = (await authorEl.first().textContent())?.trim() || "";
        } catch { /* no author */ }

        // Clean author — strip "2 reviews", "Local Guide · 50 reviews · 7 photos" etc.
        if (author) {
          author = author
            .replace(/Local Guide\s*·?\s*/i, '')
            .replace(/\d+\s*reviews?\s*(·\s*\d+\s*photos?)?\s*$/i, '')
            .replace(/\s*·\s*$/, '')
            .trim();
        }

        const authorKey = author.toLowerCase().replace(/[^a-z]/g, "");
        if (authorKey && seenAuthors.has(authorKey)) continue;
        if (authorKey) seenAuthors.add(authorKey);

        // Expand "More" to get full review text
        try {
          const moreBtn = el.locator('button:has-text("More"), button[aria-label*="more"]');
          if (await moreBtn.count() > 0) { await moreBtn.first().click(); await delay(80); }
        } catch { /* no expand */ }

        // Review text
        const textEl = el.locator('span[class*="wiI7pd"], div[class*="MyEned"] span');
        const text = (await textEl.first().textContent())?.trim() || "";

        // Star rating
        let revRating = 0;
        try {
          const starsEl = el.locator('[role="img"][aria-label*="star"]');
          if (await starsEl.count() > 0) {
            const lbl = await starsEl.first().getAttribute("aria-label");
            const m = lbl?.match(/(\d)/);
            if (m) revRating = parseInt(m[1]);
          }
        } catch { /* no rating */ }

        // Time ago
        let timeAgo = "";
        try {
          const timeEl = el.locator('span[class*="rsqaWe"]');
          if (await timeEl.count() > 0) timeAgo = (await timeEl.first().textContent())?.trim() || "";
        } catch { /* no time */ }

        // Owner reply
        let ownerReply = undefined;
        try {
          const replyEl = el.locator('div[class*="CDe7pd"]');
          if (await replyEl.count() > 0) {
            ownerReply = (await replyEl.first().textContent())?.trim().slice(0, 300) || undefined;
          }
        } catch { /* no reply */ }

        if (text || revRating) {
          reviews.push({ text: text.slice(0, 400), rating: revRating, author, timeAgo, ownerReply });
        }
      } catch { /* skip element */ }
    }
  }

  // Helper: scroll the inner review panel
  async function scrollReviewPanel() {
    await page.evaluate(() => {
      const main = document.querySelector('[role="main"]');
      if (!main) return;
      // Find deepest scrollable container (the virtual review list)
      let scrollable = null;
      for (const div of main.querySelectorAll('div')) {
        const s = window.getComputedStyle(div);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && div.scrollHeight > div.clientHeight + 100) {
          scrollable = div;
        }
      }
      (scrollable || main).scrollBy(0, 1200);
    });
    await delay(900);
  }

  // Harvest first batch (already visible after tab click + 2.5s wait)
  await harvestVisible();

  // Scroll and harvest until we have enough or nothing new appears
  let noNewCount = 0;
  for (let pass = 0; pass < 10 && reviews.length < maxCount; pass++) {
    const before = reviews.length;
    await scrollReviewPanel();
    await harvestVisible();
    if (reviews.length === before) {
      noNewCount++;
      if (noNewCount >= 2) break; // truly done
    } else {
      noNewCount = 0;
    }
  }

  return reviews;
}

// ─── Run ─────────────────────────────────────────────────────────────────────
try {
  const leads = await scrapeGoogleMaps();

  // Deduplicate by name
  const seen   = new Set();
  const unique = leads.filter((l) => {
    const key = l.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.forEach((l, i) => { l.id = `maps-${String(i + 1).padStart(3, "0")}`; });

  const noSite    = unique.filter((l) => !l.website);
  const withPhone = unique.filter((l) => l.phone);
  const withReviews = unique.filter((l) => l.reviews && l.reviews.length > 0);

  // Save as session file
  const sessionsDir = join(ROOT, "data", "sessions");
  if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });

  const session = {
    id:              sessionId,
    niche,
    city,
    timestamp:       new Date().toISOString(),
    leadsCount:      unique.length,
    noWebsiteCount:  noSite.length,
    withPhoneCount:  withPhone.length,
    expandedTerms:   [niche],
    leads:           unique,
  };

  const outPath = join(sessionsDir, `${sessionId}.json`);
  writeFileSync(outPath, JSON.stringify(session, null, 2));

  emit({
    type: "done",
    total: unique.length,
    withPhone: withPhone.length,
    noSite: noSite.length,
    withReviews: withReviews.length,
    sessionId,
  });

} catch (e) {
  emit({ type: "error", message: e.message });
  process.exit(1);
}
