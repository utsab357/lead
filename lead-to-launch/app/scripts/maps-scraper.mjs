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
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    locale: "en-IN",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(niche + " in " + city)}`;
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
          if (phone && !phone.startsWith("+")) {
            phone = phone.startsWith("91") ? "+" + phone : "+91" + phone;
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

        // Business hours — from the aria-label of hours button (no click needed)
        let hours = [];
        try {
          // Method 1: hours button with data-item-id
          const hoursBtn = page.locator('button[data-item-id="oh"]');
          if (await hoursBtn.count() > 0) {
            const hoursLabel = await hoursBtn.first().getAttribute("aria-label");
            if (hoursLabel) hours = hoursLabel.split(";").map(h => h.trim()).filter(Boolean);
          }
          // Method 2: any element with aria-label containing day names
          if (hours.length === 0) {
            const hoursEl = page.locator('[role="main"] [aria-label*="Monday"], [role="main"] [aria-label*="Sunday"]');
            if (await hoursEl.count() > 0) {
              const label = await hoursEl.first().getAttribute("aria-label") || "";
              if (label.length > 10) {
                hours = label.split(/[;.]/).map(h => h.trim()).filter(h => h.length > 3 && /\d/.test(h));
              }
            }
          }
          // Method 3: extract from table rows with day names
          if (hours.length === 0) {
            hours = await page.evaluate(() => {
              const main = document.querySelector('[role="main"]');
              if (!main) return [];
              const result = [];
              for (const row of main.querySelectorAll('table tr, [role="row"]')) {
                const text = (row.textContent || '').trim();
                if (/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(text) && text.length < 80) {
                  result.push(text.replace(/\s+/g, ' '));
                }
              }
              return result.length >= 2 ? result : [];
            });
          }
        } catch { /* no hours */ }

        // Photo URLs — get from the DETAIL PANEL IMAGE CAROUSEL (not the feed!)
        // The detail panel shows a row of photos at the top with class "aoRNLd" or inside button[jsaction*="photo"]
        let photosCount = 0;
        let photoUrls = [];
        try {
          // Photo count from the "All" photos button text
          const photoBtn = page.locator('button[jsaction*="pane.heroHeaderImage"], button[aria-label*="Photo"], button[aria-label*="photo"]');
          if (await photoBtn.count() > 0) {
            const pText = (await photoBtn.first().textContent()) || "";
            const pMatch = pText.match(/([\d,]+)/);
            if (pMatch) photosCount = parseInt(pMatch[1].replace(/,/g, ""), 10);
          }
          // Get photo URLs from the current page URL to construct photo gallery link
          // Also try to get images specifically from the detail panel's image area
          // The detail panel images are typically inside the header area above the name
          // Photos — get all googleusercontent images from detail panel (not feed, not avatars)
          const panelPhotos = await page.evaluate(() => {
            const feed = document.querySelector('[role="feed"]');
            const imgs = [];
            for (const img of document.querySelectorAll('img[src*="googleusercontent"]')) {
              if (feed && feed.contains(img)) continue;
              const src = img.getAttribute('src') || '';
              if (src.includes('/a-/') || src.includes('/a/ACg')) continue;  // reviewer avatars
              if (src.includes('w28') || src.includes('w36') || src.includes('w24')) continue; // tiny icons
              if (!imgs.includes(src)) imgs.push(src);
              if (imgs.length >= 6) break;
            }
            return imgs;
          });
          photoUrls = panelPhotos || [];
        } catch { /* no photos */ }

        // About — extract from Overview panel inline (no tab click)
        // Filter out: feed text, review snippets, addresses, service labels
        let about = "";
        try {
          about = await page.evaluate(() => {
            const feed = document.querySelector('[role="feed"]');
            const main = document.querySelector('[role="main"]');
            if (!main) return "";
            const skip = ['Wheelchair', 'Delivery', 'On-site', 'Accessibility', 'Amenities', 'hotel', 'vacation', 'Maps', 'JavaScript', 'Sign in'];
            for (const el of main.querySelectorAll('div, span, p')) {
              if (feed && feed.contains(el)) continue;
              if (el.children.length > 0) continue;
              // Skip review snippets
              let inReview = false;
              let anc = el.parentElement;
              while (anc && anc !== main) {
                if (anc.hasAttribute('data-review-id')) { inReview = true; break; }
                anc = anc.parentElement;
              }
              if (inReview) continue;
              const txt = (el.textContent || '').trim();
              if (txt.length > 40 && txt.length < 800 && !skip.some(w => txt.includes(w)) &&
                  txt.split(' ').length > 6 && /[.!?,]/.test(txt)) {
                return txt;
              }
            }
            return "";
          }) || "";
        } catch { /* no about */ }

        // Services list — amenity/service chips shown in the Overview panel
        // These are short labels like "On-site services", "Online classes", "Weight training"
        let services = [];
        try {
          // Method 1: Google Maps service chips with specific selectors
          const svcItems = page.locator(
            '[role="main"] div[aria-label*="service"] span, ' +
            '[role="main"] div[aria-label*="Service"] span, ' +
            '[role="main"] [data-item-id*="merch"] span, ' +
            '[role="main"] li[class*="hpqone"] span'
          );
          const svcCount = Math.min(await svcItems.count(), 12);
          for (let s = 0; s < svcCount; s++) {
            const txt = (await svcItems.nth(s).textContent())?.trim();
            if (txt && txt.length > 1 && txt.length <= 40 && !txt.includes('"') && !txt.includes("'") && !services.includes(txt)) {
              services.push(txt);
            }
          }
          // Method 2: extract from aria-labeled sections (Offerings, Amenities, etc.)
          if (services.length === 0) {
            services = await page.evaluate(() => {
              const main = document.querySelector('[role="main"]');
              const feed = document.querySelector('[role="feed"]');
              if (!main) return [];
              const result = [];
              for (const el of main.querySelectorAll('[aria-label]')) {
                if (feed && feed.contains(el)) continue;
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('offering') || label.includes('amenit') || label.includes('service') ||
                    label.includes('activit') || label.includes('highlight') || label.includes('feature')) {
                  for (const child of el.querySelectorAll('span, li')) {
                    if (child.children.length > 0) continue;
                    const txt = (child.textContent || '').trim();
                    if (txt.length >= 3 && txt.length <= 40 && !result.includes(txt) &&
                        !/^\d+$/.test(txt) && !txt.includes('·')) {
                      result.push(txt);
                    }
                  }
                }
              }
              return result.slice(0, 12);
            });
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
          const smLinks = page.locator('[role="main"] a[href*="facebook.com"], [role="main"] a[href*="instagram.com"], [role="main"] a[href*="youtube.com"]');
          const linkCount = Math.min(await smLinks.count(), 5);
          const seenPlatforms = new Set();
          for (let sl = 0; sl < linkCount; sl++) {
            const href2 = await smLinks.nth(sl).getAttribute("href");
            if (!href2) continue;
            let platform = "other";
            if (href2.includes("facebook")) platform = "facebook";
            else if (href2.includes("instagram")) platform = "instagram";
            else if (href2.includes("youtube")) platform = "youtube";
            if (!seenPlatforms.has(platform)) {
              seenPlatforms.add(platform);
              socialLinks.push({ platform, url: href2 });
            }
          }
        } catch { /* no social */ }

        // Move Facebook/Instagram URLs from website to socialLinks
        if (website && (website.includes('facebook.com') || website.includes('instagram.com'))) {
          const fbPlatform = website.includes('facebook') ? 'facebook' : 'instagram';
          if (!socialLinks.some(s => s.platform === fbPlatform)) {
            socialLinks.push({ platform: fbPlatform, url: website });
          }
          website = null;
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
        const lead = {
          id:           `maps-${String(leads.length + 1).padStart(3, "0")}`,
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
          hours:        hours.length > 0 ? hours : undefined,
          photoUrls:    photoUrls.length > 0 ? photoUrls : undefined,
          photosCount:  photosCount || undefined,
          about:        about || undefined,
          services:     services.length > 0 ? services : undefined,
          priceLevel:   priceLevel || undefined,
          socialLinks:  socialLinks.length > 0 ? socialLinks : undefined,
          reviews:      reviewsData.length > 0 ? reviewsData : undefined,
          ownerReplies: reviewsData.length > 0 ? ownerReplies : undefined,
          source:       "maps",
        };

        leads.push(lead);

        // Emit each lead live
        emit({ type: "lead", lead, index: idx + 1, total: totalLinks });

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
