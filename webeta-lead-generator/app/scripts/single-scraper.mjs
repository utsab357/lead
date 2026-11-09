/**
 * Single Business Scraper
 * Accepts: Google Maps URL, Zomato URL, any URL, or a business name/search term.
 *
 * Usage:
 *   node scripts/single-scraper.mjs "https://maps.google.com/..." [sessionId]
 *   node scripts/single-scraper.mjs "Gold's Gym Barasat"         [sessionId]
 *   node scripts/single-scraper.mjs "https://zomato.com/..."     [sessionId]
 *   node scripts/single-scraper.mjs "https://justdial.com/..."   [sessionId]
 *
 * Emits JSON lines to stdout (same protocol as maps-scraper.mjs).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readFileSync } from "fs";
import { join } from "path";
import { enrichLeadContacts } from "./contact-extractor.mjs";

const rawInput  = process.argv[2] || "";
const sessionId = process.argv[3] || `manual-${Date.now()}`;

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, "..");

// Load env vars from .env.local for AI key
let GROQ_API_KEY = "";
try {
  const env = readFileSync(join(ROOT, ".env.local"), "utf8");
  const m = env.match(/GROQ_API_KEY=(.+)/);
  if (m) GROQ_API_KEY = m[1].trim().replace(/^['"]|['"]$/g, "");
} catch { /* no env file */ }

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function detectType(s) {
  if (!s) return "unknown";
  if (s.includes("maps.google.com") || s.includes("google.com/maps")) return "maps-url";
  if (s.includes("zomato.com")) return "zomato-url";
  if (s.startsWith("http://") || s.startsWith("https://")) return "generic-url";
  return "search-name";
}

const inputType = detectType(rawInput);
emit({ type: "status", message: `Detected input type: ${inputType}` });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw) {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0091") && d.length === 14) d = d.slice(4);
  else if (d.startsWith("910") && d.length === 13) d = d.slice(3);
  else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d.length === 10 && /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** Extract all data from an already-open Google Maps detail panel */
async function extractFromMapsPanel(page, fallbackCity = "") {
  let phone = null, website = null, address = "", rating = null, reviews = null;
  let category = "", hours = [], photoUrls = [], photosCount = 0;
  let about = "", services = [], socialLinks = [];

  // Name from heading
  let name = "";
  try {
    name = await page.evaluate(() => {
      const main = document.querySelector('[role="main"]');
      if (!main) return "";
      for (const el of main.querySelectorAll('h1, h2, div[role="heading"]')) {
        const t = el.textContent?.trim();
        if (t && t.length > 1 && t.length < 100) return t;
      }
      return "";
    });
  } catch { /* no name */ }

  // City from page URL
  let city = fallbackCity;
  try {
    const url = page.url();
    const m = url.match(/place\/([^/]+)/);
    if (m) city = decodeURIComponent(m[1]).split(",").pop()?.trim() || fallbackCity;
  } catch { /* ok */ }

  // Phone
  try {
    const phoneBtn = page.locator('button[data-item-id^="phone:"]');
    if (await phoneBtn.count() > 0) {
      const id = await phoneBtn.first().getAttribute("data-item-id");
      if (id) phone = id.replace("phone:tel:", "").replace("phone:", "").trim();
    }
    if (!phone) {
      const lbl = page.locator('[aria-label*="Phone:"], [data-tooltip="Copy phone number"]');
      if (await lbl.count() > 0) {
        const t = await lbl.first().getAttribute("aria-label") || "";
        const m = t.match(/[\d+][\d\s\-().]{7,}/);
        if (m) phone = m[0].replace(/[\s\-().]/g, "");
      }
    }
    if (!phone) {
      const all = await page.locator('[role="main"]').textContent() || "";
      const m = all.match(/(\+91[\s\-]?\d{5}[\s\-]?\d{5}|\b[6-9]\d{9}\b)/);
      if (m) phone = m[0].replace(/[\s\-]/g, "");
    }
    phone = normalizePhone(phone);
  } catch { /* no phone */ }

  // Website
  try {
    const wBtn = page.locator('a[data-item-id="authority"]');
    if (await wBtn.count() > 0) website = await wBtn.first().getAttribute("href");
    if (!website) {
      const wLbl = page.locator('[aria-label*="Website:"]');
      if (await wLbl.count() > 0) {
        const t = await wLbl.first().getAttribute("aria-label") || "";
        const m = t.match(/https?:\/\/[^\s]+/);
        if (m) website = m[0];
      }
    }
    if (website && (website.includes("facebook.com") || website.includes("instagram.com"))) website = null;
  } catch { /* no website */ }

  // Address
  try {
    const addrBtn = page.locator('button[data-item-id="address"]');
    if (await addrBtn.count() > 0) {
      const lbl = await addrBtn.first().getAttribute("aria-label") || "";
      address = lbl.replace("Address:", "").trim();
    }
  } catch { /* no address */ }

  // Rating
  try {
    const ratingEl = page.locator('[role="main"] div[aria-label*="stars"], [role="main"] span[aria-label*="stars"]');
    if (await ratingEl.count() > 0) {
      const lbl = await ratingEl.first().getAttribute("aria-label") || "";
      const m = lbl.match(/([\d.]+)/);
      if (m) rating = parseFloat(m[1]);
    }
  } catch { /* no rating */ }

  // Reviews count
  try {
    const mainText = await page.locator('[role="main"]').first().textContent() || "";
    const m = mainText.match(/\(([\d,]+)\s*review/i);
    if (m) reviews = parseInt(m[1].replace(/,/g, ""), 10);
  } catch { /* no reviews */ }

  // Category
  try {
    const catBtn = page.locator('button[jsaction*="category"]');
    if (await catBtn.count() > 0) category = (await catBtn.first().textContent()) || "";
  } catch { /* no category */ }

  // Hours
  try {
    const hoursBtn = page.locator('button[data-item-id="oh"]');
    if (await hoursBtn.count() > 0) {
      const lbl = await hoursBtn.first().getAttribute("aria-label") || "";
      if (lbl) {
        hours = lbl.replace(/^(Opening hours|Hours):\s*/i, "")
          .split(/[;,]\s*(?=[A-Z])/)
          .map(s => s.trim())
          .filter(Boolean)
          .slice(0, 7);
      }
    }
  } catch { /* no hours */ }

  // Photos (CSS background-image approach)
  try {
    const panelPhotos = await page.evaluate(() => {
      const imgs = [];
      const feed = document.querySelector('[role="feed"]');
      const candidates = document.querySelectorAll(
        'button[jsaction], [class*="aoRNLd"] button, button[style*="background"]'
      );
      for (const el of candidates) {
        if (feed && feed.contains(el)) continue;
        const style = el.getAttribute("style") || "";
        const m = style.match(/background-image\s*:\s*url\(\s*["']?(https:\/\/[^"')]+)["']?\s*\)/i);
        if (m && !m[1].includes("/a-/") && !m[1].includes("/a/ACg") && !imgs.includes(m[1])) {
          imgs.push(m[1]);
          if (imgs.length >= 6) break;
        }
      }
      if (imgs.length < 2) {
        for (const img of document.querySelectorAll('img[src*="googleusercontent"]')) {
          if (feed && feed.contains(img)) continue;
          const src = img.getAttribute("src") || "";
          if (src.includes("/a-/") || src.includes("/a/ACg")) continue;
          if (src.includes("w28") || src.includes("w36")) continue;
          if (!imgs.includes(src)) imgs.push(src);
          if (imgs.length >= 6) break;
        }
      }
      return imgs;
    });
    photoUrls = panelPhotos || [];
    if (photoUrls.length > 0) photosCount = photoUrls.length;
  } catch { /* no photos */ }

  // About
  try {
    about = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      const main = document.querySelector('[role="main"]');
      if (!main) return "";
      const skip = ["Wheelchair", "Delivery", "On-site", "Accessibility", "Amenities", "Maps", "JavaScript"];
      for (const el of main.querySelectorAll("div, span, p")) {
        if (feed && feed.contains(el)) continue;
        if (el.children.length > 0) continue;
        const txt = (el.textContent || "").trim();
        if (txt.length > 40 && txt.length < 800 && !skip.some(w => txt.includes(w)) &&
            txt.split(" ").length > 6 && /[.!?,]/.test(txt)) return txt;
      }
      return "";
    }) || "";
  } catch { /* no about */ }

  // Social links
  try {
    const smLinks = page.locator('[role="main"] a[href*="facebook.com"], [role="main"] a[href*="instagram.com"]');
    const count = Math.min(await smLinks.count(), 4);
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const href = await smLinks.nth(i).getAttribute("href");
      if (!href) continue;
      const plat = href.includes("facebook") ? "facebook" : "instagram";
      if (!seen.has(plat)) { seen.add(plat); socialLinks.push({ platform: plat, url: href }); }
    }
  } catch { /* no social */ }

  // Coordinates from URL
  let lat = 22.72, lng = 88.48;
  try {
    const url = page.url();
    const cm = url.match(/@(-?[\d.]+),(-?[\d.]+)/);
    if (cm) { lat = parseFloat(cm[1]); lng = parseFloat(cm[2]); }
  } catch { /* ok */ }

  return {
    id: `manual-${Date.now()}`,
    name: name || "Unknown",
    category: category || "Business",
    address, city, phone: phone || undefined,
    whatsapp: phone || undefined,
    website: website || undefined,
    mapUrl: page.url(),
    rating, reviewsCount: reviews, lat, lng,
    hours: hours.length > 0 ? hours : undefined,
    photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
    photosCount: photosCount || undefined,
    about: about || undefined,
    socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
    source: "manual",
  };
}

/** Call Groq to extract business data from raw page text */
async function extractViaAI(pageText, sourceUrl) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set — cannot extract from generic URL");

  const prompt = `You are extracting business contact info from a webpage. Return ONLY valid JSON, no markdown.

PAGE TEXT (first 3000 chars):
${pageText.slice(0, 3000)}

SOURCE URL: ${sourceUrl}

Extract and return this JSON:
{
  "name": "business name or null",
  "phone": "phone number with country code or null",
  "address": "full address or empty string",
  "city": "city name or empty string",
  "category": "business type/category or empty string",
  "about": "description/about text or empty string",
  "website": "official website URL or null",
  "rating": null,
  "reviewsCount": null
}

Rules:
- phone: normalize to +91XXXXXXXXXX format if Indian
- If you can't find a field, use null or empty string
- name is required; if not found return { "error": "business name not found" }`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const data = await res.json();
  const raw = JSON.parse(data.choices[0].message.content);
  if (raw.error) throw new Error(raw.error);

  return {
    id: `manual-${Date.now()}`,
    name: raw.name || "Unknown",
    category: raw.category || "Business",
    address: raw.address || "",
    city: raw.city || "",
    phone: raw.phone || undefined,
    whatsapp: raw.phone || undefined,
    website: raw.website || undefined,
    mapUrl: sourceUrl,
    rating: raw.rating || null,
    reviewsCount: raw.reviewsCount || null,
    lat: 22.72, lng: 88.48,
    about: raw.about || undefined,
    source: "manual",
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
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
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  try {
    let lead;

    if (inputType === "maps-url") {
      emit({ type: "status", message: "Opening Google Maps listing..." });
      await page.goto(rawInput, { waitUntil: "domcontentloaded", timeout: 30000 });
      await delay(3000);
      // Accept cookies
      try {
        const btn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
        if (await btn.isVisible({ timeout: 2000 })) await btn.click();
      } catch { /* ok */ }
      await delay(2000);
      emit({ type: "status", message: "Extracting business data..." });
      lead = await extractFromMapsPanel(page);

    } else if (inputType === "search-name") {
      emit({ type: "status", message: `Searching Google Maps for "${rawInput}"...` });
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(rawInput)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await delay(2500);
      try {
        const btn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
        if (await btn.isVisible({ timeout: 2000 })) await btn.click();
      } catch { /* ok */ }
      await delay(1500);
      // Click first result
      const firstLink = page.locator('[role="feed"] a[href*="/maps/place/"]').first();
      if (await firstLink.count() === 0) throw new Error(`No results found for "${rawInput}"`);
      await firstLink.click();
      await delay(3000);
      emit({ type: "status", message: "Extracting business data..." });
      lead = await extractFromMapsPanel(page);

    } else if (inputType === "zomato-url") {
      emit({ type: "status", message: "Opening Zomato listing..." });
      await page.goto(rawInput, { waitUntil: "domcontentloaded", timeout: 30000 });
      await delay(3000);

      emit({ type: "status", message: "Extracting data from Zomato page..." });

      const zData = await page.evaluate(() => {
        // Name
        const name = document.querySelector("h1")?.textContent?.trim() || "";

        // Cuisine / category (comma-separated tags below the name)
        const cuisineTags = Array.from(
          document.querySelectorAll('a[href*="/cuisine/"], .sc-1hp8d8a-1, [class*="cuisine"]')
        ).map(el => el.textContent?.trim()).filter(Boolean).slice(0, 3);
        const category = cuisineTags.join(", ") || "Restaurant";

        // Rating
        let rating = null;
        const ratingEl = document.querySelector('[class*="sc-1q7bklc-1"], [aria-label*="Rated"], [class*="rating"] span');
        if (ratingEl) {
          const m = ratingEl.textContent?.match(/([\d.]+)/);
          if (m) rating = parseFloat(m[1]);
        }

        // Reviews count
        let reviewsCount = null;
        const reviewsEl = document.querySelector('[class*="sc-1q7bklc-8"], [class*="reviewCount"]');
        if (reviewsEl) {
          const m = reviewsEl.textContent?.replace(/,/g, "").match(/(\d+)/);
          if (m) reviewsCount = parseInt(m[1], 10);
        }

        // Address / location
        let address = "";
        const addrEl = document.querySelector(
          'a[href*="/barasat/"], a[href*="/kolkata/"], [class*="sc-clNaTc"], [class*="address"]'
        );
        if (addrEl) address = addrEl.textContent?.trim() || "";
        // Fallback: look for a map/address section
        if (!address) {
          const spans = document.querySelectorAll("span, p");
          for (const s of spans) {
            const t = s.textContent?.trim() || "";
            if (t.includes(",") && t.length > 15 && t.length < 120 && /\d/.test(t)) {
              address = t; break;
            }
          }
        }

        // City from URL
        const urlMatch = window.location.href.match(/zomato\.com\/([^/]+)\//);
        const city = urlMatch ? urlMatch[1].replace(/-/g, " ") : "";

        // Photos — og:image or first large restaurant image
        const photoUrls = [];
        const og = document.querySelector('meta[property="og:image"]');
        if (og) photoUrls.push(og.getAttribute("content") || "");
        for (const img of document.querySelectorAll('img[src*="res.cloudinary"], img[src*="b.zmtcdn"]')) {
          const src = img.getAttribute("src") || "";
          if (src && !photoUrls.includes(src) && !src.includes("avatar") && !src.includes("cuisine")) {
            photoUrls.push(src);
            if (photoUrls.length >= 4) break;
          }
        }

        return { name, category, rating, reviewsCount, address, city, photoUrls };
      });

      lead = {
        id: `manual-${Date.now()}`,
        name: zData.name || "Unknown Restaurant",
        category: zData.category || "Restaurant",
        address: zData.address || "",
        city: zData.city || "",
        phone: undefined,
        whatsapp: undefined,
        website: undefined,
        mapUrl: rawInput,
        rating: zData.rating,
        reviewsCount: zData.reviewsCount,
        lat: 22.72, lng: 88.48,
        photoUrls: zData.photoUrls.length > 0 ? zData.photoUrls : undefined,
        photosCount: zData.photoUrls.length || undefined,
        source: "manual",
      };

    } else {
      // Generic URL — Universal DOM extraction (no AI needed)
      emit({ type: "status", message: "Opening page..." });
      await page.goto(rawInput, { waitUntil: "domcontentloaded", timeout: 30000 });
      await delay(2000);
      emit({ type: "status", message: "Extracting business info from page..." });

      const extracted = await page.evaluate((sourceUrl) => {
        const bodyText = document.body?.innerText || "";

        // ── Name ──────────────────────────────────────────────────────
        let name =
          document.querySelector("h1")?.textContent?.trim() ||
          document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
          document.title?.split(/[-|–]/)[0]?.trim() ||
          "Unknown Business";
        // Trim JustDial suffixes like " in Barasat - JustDial"
        name = name.replace(/\s+in\s+.*/i, "").replace(/\s*[-|–].*$/, "").trim();

        // ── Phone (Indian numbers) ────────────────────────────────────
        let phone = null;
        const phonePatterns = [
          /\+91[\s\-]?\d{5}[\s\-]?\d{5}/,
          /\b[6-9]\d{9}\b/,
          /\+\d{10,13}/,
          /0\d{10}/,
        ];
        for (const pat of phonePatterns) {
          const m = bodyText.match(pat);
          if (m) { phone = m[0].replace(/[\s\-]/g, ""); break; }
        }

        // ── Address ───────────────────────────────────────────────────
        let address =
          document.querySelector('[itemtype*="PostalAddress"] [itemprop="streetAddress"]')?.textContent?.trim() ||
          document.querySelector('[class*="address"], [class*="location"], [class*="addr"]')?.textContent?.trim() ||
          document.querySelector('[itemprop="address"]')?.textContent?.trim() || "";
        if (!address) {
          // Fallback: find text that looks like an Indian address
          for (const el of document.querySelectorAll("span, p, div")) {
            if (el.children.length > 0) continue;
            const t = (el.textContent || "").trim();
            if (t.length > 20 && t.length < 150 && t.includes(",") && /\d/.test(t) &&
                /West Bengal|Mumbai|Delhi|Kolkata|Hyderabad|Chennai|Pune|Bangalore|Road|Street|Nagar|Colony|Ward/i.test(t)) {
              address = t; break;
            }
          }
        }

        // ── Category ──────────────────────────────────────────────────
        const category =
          document.querySelector('meta[name="category"]')?.getAttribute("content")?.trim() ||
          document.querySelector('[class*="category"], [class*="type"], [class*="tag"]')?.textContent?.trim() ||
          document.querySelector('[itemprop="description"]')?.textContent?.trim()?.split(",")[0] ||
          "Business";

        // ── About ─────────────────────────────────────────────────────
        const about =
          document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
          document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ||
          document.querySelector('[class*="about"], [class*="desc"]')?.textContent?.trim()?.slice(0, 300) || "";

        // ── City from URL ─────────────────────────────────────────────
        const cityMatch = sourceUrl.match(/(?:\/|city=|in-)([a-z-]{3,20})(?:\/|\?|$)/i);
        const city = cityMatch ? cityMatch[1].replace(/-/g, " ") : "";

        // ── Photo from og:image ───────────────────────────────────────
        const photoUrls = [];
        const og = document.querySelector('meta[property="og:image"]');
        if (og) photoUrls.push(og.getAttribute("content") || "");

        // ── Rating ────────────────────────────────────────────────────
        let rating = null;
        const ratingEl = document.querySelector('[itemprop="ratingValue"], [class*="rating"]');
        if (ratingEl) {
          const m = ratingEl.textContent?.match(/([\d.]+)/);
          if (m && parseFloat(m[1]) <= 5) rating = parseFloat(m[1]);
        }

        return { name, phone, address, city, category, about, photoUrls, rating };
      }, rawInput);

      lead = {
        id: `manual-${Date.now()}`,
        name: extracted.name || "Unknown Business",
        category: extracted.category || "Business",
        address: extracted.address || "",
        city: extracted.city || "",
        phone: extracted.phone || undefined,
        whatsapp: extracted.phone || undefined,
        website: rawInput,
        mapUrl: rawInput,
        rating: extracted.rating,
        lat: 22.72, lng: 88.48,
        about: extracted.about || undefined,
        photoUrls: extracted.photoUrls.length > 0 ? extracted.photoUrls : undefined,
        source: "manual",
      };
    } // end else (generic URL)

    emit({ type: "status", message: `Checking emails & social links for ${lead.name}...` });
    try {
      lead = await enrichLeadContacts(lead);
    } catch {
      /* fail-safe */
    }

    emit({ type: "status", message: `Found: ${lead.name}` });
    emit({ type: "lead", lead, index: 1, total: 1 });
    emit({ type: "done", total: 1 });


  } catch (e) {
    emit({ type: "error", message: e.message || "Scraping failed" });
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  emit({ type: "error", message: e.message });
  process.exit(1);
});
