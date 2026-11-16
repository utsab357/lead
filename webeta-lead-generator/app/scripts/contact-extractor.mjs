/**
 * Free Contact Extractor (100% Free — No API keys, No paid services)
 *
 * Extracts business email IDs and social media links (Instagram, Facebook, LinkedIn, YouTube, X)
 * using a multi-layer strategy:
 *   Layer 1: Website deep-crawler (homepage + contact/about pages)
 *   Layer 2: Bio-link aggregator detection (Linktree, Bio.link, Carrd)
 *   Layer 3: Maps listing text & owner review replies inspection
 *   Layer 4: Free search fallback (DuckDuckGo HTML endpoint)
 *
 * All operations use strict timeouts, error guards, and anti-crash filters.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const REQUEST_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.7",
};

/** Domains to reject as false-positive or generic template emails */
const BLACKLISTED_DOMAINS = new Set([
  "example.com",
  "domain.com",
  "email.com",
  "yourdomain.com",
  "mysite.com",
  "site.com",
  "test.com",
  "sentry.io",
  "wixpress.com",
  "wix.com",
  "wordpress.com",
  "wordpress.org",
  "cloudflare.com",
  "schema.org",
  "googleapis.com",
  "gstatic.com",
  "github.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "google.com",
  "apple.com",
  "templatemonster.com",
  "bootstrapmade.com",
  "themeforest.net",
  "envato.com",
  "w3.org",
  "gravatar.com",
]);

/** File extensions mistakenly matched as emails (e.g. hero@2x.png) */
const JUNK_EXTENSION_REGEX = /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tiff|js|css|woff|woff2|ttf|eot|map|json|xml|zip|pdf)$/i;

/** Common placeholder usernames */
const JUNK_USERNAMES = new Set([
  "user",
  "username",
  "yourname",
  "email",
  "test",
  "demo",
  "sample",
  "placeholder",
  "admin",
  "name",
  "someone",
  "firstname",
  "lastname",
  "contactus",
]);

/**
 * Validates whether an email string is legitimate.
 */
export function isValidEmail(raw) {
  if (!raw || typeof raw !== "string") return false;
  const email = raw.trim().toLowerCase();

  // Basic format check
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,12}$/i.test(email)) {
    return false;
  }

  // Length boundaries
  if (email.length < 6 || email.length > 80) return false;

  // Check file extension
  if (JUNK_EXTENSION_REGEX.test(email)) return false;

  const [username, domain] = email.split("@");
  if (!username || !domain) return false;

  if (JUNK_USERNAMES.has(username)) return false;
  if (BLACKLISTED_DOMAINS.has(domain)) return false;

  // Reject consecutive dots or invalid punctuation
  if (email.includes("..") || email.startsWith(".") || username.startsWith("-")) return false;

  return true;
}

/**
 * Normalizes and categorizes a social media URL.
 */
export function categorizeSocialUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const clean = rawUrl.trim();

  try {
    const parsed = new URL(clean, "https://dummy.com");
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    // Instagram
    if (host.includes("instagram.com")) {
      const match = path.match(/^\/([a-zA-Z0-9._]+)\/?/);
      if (match) {
        const handle = match[1].toLowerCase();
        const ignores = ["p", "explore", "stories", "accounts", "reels", "direct", "developer", "about", "legal"];
        if (!ignores.includes(handle) && handle.length > 1) {
          return { platform: "instagram", url: `https://www.instagram.com/${match[1]}/` };
        }
      }
    }

    // Facebook
    if (host.includes("facebook.com") || host.includes("fb.com")) {
      const match = path.match(/^\/([a-zA-Z0-9._-]+)\/?/);
      if (match) {
        const handle = match[1].toLowerCase();
        const ignores = ["sharer", "share.php", "policies", "login", "pages", "groups", "help", "tr", "home.php"];
        if (!ignores.includes(handle) && handle.length > 1) {
          return { platform: "facebook", url: `https://www.facebook.com/${match[1]}` };
        }
      }
    }

    // LinkedIn
    if (host.includes("linkedin.com")) {
      const match = path.match(/^\/(in|company)\/([a-zA-Z0-9._-]+)\/?/i);
      if (match) {
        return { platform: "linkedin", url: `https://www.linkedin.com/${match[1]}/${match[2]}` };
      }
    }

    // YouTube
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const match = path.match(/^\/(@[a-zA-Z0-9._-]+|c\/[a-zA-Z0-9._-]+|channel\/[a-zA-Z0-9._-]+)\/?/i);
      if (match) {
        return { platform: "youtube", url: `https://www.youtube.com/${match[1]}` };
      }
    }

    // Twitter / X
    if (host.includes("twitter.com") || host.includes("x.com")) {
      const match = path.match(/^\/([a-zA-Z0-9_]+)\/?/);
      if (match) {
        const handle = match[1].toLowerCase();
        const ignores = ["intent", "share", "home", "explore", "search", "tos", "privacy"];
        if (!ignores.includes(handle) && handle.length > 1) {
          return { platform: "x", url: `https://x.com/${match[1]}` };
        }
      }
    }
  } catch {
    /* invalid url */
  }

  return null;
}

/**
 * Fast HTTP fetch with strict timeout and SSL fallback.
 */
async function fetchSafeHtml(url, timeoutMs = 3500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    return await res.text();
  } catch (err) {
    // If HTTPS failed due to certificate issues, attempt plain HTTP once
    if (url.startsWith("https://")) {
      try {
        const httpUrl = url.replace("https://", "http://");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(httpUrl, {
          headers: REQUEST_HEADERS,
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        if (res.ok) return await res.text();
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

/**
 * Extracts emails from HTML using mailto: tags and text regex.
 */
export function extractEmailsFromHtml(html) {
  if (!html) return [];
  const found = new Set();

  // 1. Check mailto: links (highest accuracy)
  const mailtoRegex = /href=["']mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^"']*["']/gi;
  let m;
  while ((m = mailtoRegex.exec(html)) !== null) {
    let email = m[1];
    try {
      email = decodeURIComponent(email);
    } catch { /* ignore */ }
    if (isValidEmail(email)) found.add(email.toLowerCase());
  }

  // 2. Scan text for general email regex
  const textRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  while ((m = textRegex.exec(html)) !== null) {
    const email = m[0];
    if (isValidEmail(email)) found.add(email.toLowerCase());
  }

  // Prioritize info@, contact@, or custom domain emails over generic webmaster
  return Array.from(found).sort((a, b) => {
    const aIsDirect = /^(info|contact|support|hello|care|help|doctor|sales)@/i.test(a);
    const bIsDirect = /^(info|contact|support|hello|care|help|doctor|sales)@/i.test(b);
    if (aIsDirect && !bIsDirect) return -1;
    if (!aIsDirect && bIsDirect) return 1;
    return 0;
  });
}

/**
 * Extracts social links from HTML anchor tags.
 */
export function extractSocialsFromHtml(html) {
  if (!html) return [];
  const socials = new Map();

  const hrefRegex = /href=["'](https?:\/\/[^"'>]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1];
    const cat = categorizeSocialUrl(url);
    if (cat && !socials.has(cat.platform)) {
      socials.set(cat.platform, cat);
    }
  }

  return Array.from(socials.values());
}

/**
 * Crawls a business website for email and social profiles.
 * Checks homepage and common contact subpages.
 */
export async function crawlWebsiteForContacts(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return { email: null, socialLinks: [] };

  let url = rawUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Discard Google / Maps / Aggregator links from website crawl
  const lowerUrl = url.toLowerCase();
  if (
    lowerUrl.includes("google.com") ||
    lowerUrl.includes("maps.google.") ||
    lowerUrl.includes("goo.gl") ||
    lowerUrl.includes("business.site") ||
    lowerUrl.includes("g.page") ||
    lowerUrl.includes("zomato.com") ||
    lowerUrl.includes("swiggy.com") ||
    lowerUrl.includes("practo.com") ||
    lowerUrl.includes("justdial.com") ||
    lowerUrl.includes("indiamart.com") ||
    lowerUrl.includes("magicpin.in") ||
    lowerUrl.includes("dineout.co.in") ||
    lowerUrl.includes("urbancompany.com") ||
    lowerUrl.includes("sulekha.com") ||
    lowerUrl.includes("lybrate.com") ||
    lowerUrl.includes("1mg.com") ||
    lowerUrl.includes("pharmeasy.in") ||
    lowerUrl.includes("nearbuy.com")
  ) {
    return { email: null, socialLinks: [] };
  }

  // Direct check: is the website itself a social profile?
  const selfSocial = categorizeSocialUrl(url);
  if (selfSocial) {
    return { email: null, socialLinks: [selfSocial] };
  }

  // Bio-link check (Linktree, Carrd, Bio.link)
  const isBioLink = /(linktr\.ee|bio\.link|carrd\.co|canva\.site|beacons\.ai)/i.test(url);

  let homepageHtml = await fetchSafeHtml(url, 4000);
  if (!homepageHtml) return { email: null, socialLinks: [] };

  let emails = extractEmailsFromHtml(homepageHtml);
  let socialLinks = extractSocialsFromHtml(homepageHtml);

  // If bio link or email already found, no need to crawl further
  if (isBioLink || emails.length > 0) {
    return {
      email: emails[0] || null,
      socialLinks,
    };
  }

  // If no email on homepage, check common contact subpages
  try {
    const baseUrl = new URL(url);
    const contactPaths = ["/contact", "/contact-us", "/about", "/about-us", "/reach-us"];

    // Also look for contact links explicitly in the homepage HTML
    const linkMatch = homepageHtml.match(/href=["'](\/[a-zA-Z0-9_-]*(?:contact|reach|about)[a-zA-Z0-9_-]*)["']/i);
    if (linkMatch && linkMatch[1]) {
      contactPaths.unshift(linkMatch[1]);
    }

    // Try the first 2 potential contact pages in parallel
    const targets = Array.from(new Set(contactPaths))
      .slice(0, 2)
      .map((p) => new URL(p, baseUrl.origin).toString());

    const subHtmls = await Promise.all(targets.map((t) => fetchSafeHtml(t, 3000)));

    for (const subHtml of subHtmls) {
      if (!subHtml) continue;
      const subEmails = extractEmailsFromHtml(subHtml);
      if (subEmails.length > 0 && !emails.length) {
        emails = subEmails;
      }
      const subSocials = extractSocialsFromHtml(subHtml);
      for (const s of subSocials) {
        if (!socialLinks.some((existing) => existing.platform === s.platform)) {
          socialLinks.push(s);
        }
      }
      if (emails.length > 0) break;
    }
  } catch {
    /* URL parsing error */
  }

  return {
    email: emails[0] || null,
    socialLinks,
  };
}

/**
 * Free fallback search using DuckDuckGo HTML endpoint (100% Free, No API key).
 * Used when a business has no website or the website yields no contacts.
 */
export async function searchContactsOnline(businessName, city) {
  if (!businessName) return { email: null, socialLinks: [] };

  try {
    const query = `"${businessName}" "${city}" (email OR "@gmail.com" OR "instagram.com" OR "facebook.com")`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const html = await fetchSafeHtml(searchUrl, 4500);
    if (!html) return { email: null, socialLinks: [] };

    const emails = extractEmailsFromHtml(html);
    const socialLinks = extractSocialsFromHtml(html);

    return {
      email: emails[0] || null,
      socialLinks,
    };
  } catch {
    return { email: null, socialLinks: [] };
  }
}

/**
 * Extracts emails and handles from Google Maps listing metadata (About text, review replies).
 */
export function extractFromMapsData(lead) {
  const emails = [];
  const socials = [];

  // 1. Check About text
  if (lead.about) {
    const aboutEmails = extractEmailsFromHtml(lead.about);
    emails.push(...aboutEmails);

    // Look for plain @instagram handle in text
    const instaMatch = lead.about.match(/(?:instagram|insta|ig)\s*(?::|@|-)?\s*@?([a-zA-Z0-9._]{3,30})/i);
    if (instaMatch && instaMatch[1]) {
      const cat = categorizeSocialUrl(`https://instagram.com/${instaMatch[1]}`);
      if (cat) socials.push(cat);
    }
  }

  // 2. Check Owner replies to reviews
  if (Array.isArray(lead.reviews)) {
    for (const r of lead.reviews) {
      if (r.ownerReply) {
        const replyEmails = extractEmailsFromHtml(r.ownerReply);
        emails.push(...replyEmails);
      }
    }
  }

  return {
    email: emails[0] || null,
    socialLinks: socials,
  };
}

/**
 * Master enrichment function: takes a Lead and enriches it with email & social links.
 * Non-blocking, completely free, and will never throw.
 *
 * @param {object} lead
 * @returns {Promise<object>} enriched lead
 */
export async function enrichLeadContacts(lead) {
  try {
    let email = lead.email || null;
    let socialMap = new Map();

    // Preserve existing social links
    if (Array.isArray(lead.socialLinks)) {
      for (const s of lead.socialLinks) {
        socialMap.set(s.platform, s);
      }
    }

    // Step 1: Extract from Maps listing text & review replies
    const fromMaps = extractFromMapsData(lead);
    if (!email && fromMaps.email) email = fromMaps.email;
    for (const s of fromMaps.socialLinks) {
      if (!socialMap.has(s.platform)) socialMap.set(s.platform, s);
    }

    // Step 2: If lead has a website, deep-crawl it
    if (lead.website) {
      const siteResult = await crawlWebsiteForContacts(lead.website);
      if (!email && siteResult.email) email = siteResult.email;
      for (const s of siteResult.socialLinks) {
        if (!socialMap.has(s.platform)) socialMap.set(s.platform, s);
      }
    }

    // Step 3: If still missing email or socials, use free DuckDuckGo HTML fallback
    if (!email || socialMap.size === 0) {
      const searchResult = await searchContactsOnline(lead.name, lead.city || "");
      if (!email && searchResult.email) email = searchResult.email;
      for (const s of searchResult.socialLinks) {
        if (!socialMap.has(s.platform)) socialMap.set(s.platform, s);
      }
    }

    const finalSocials = Array.from(socialMap.values());

    return {
      ...lead,
      email: email || undefined,
      socialLinks: finalSocials.length > 0 ? finalSocials : undefined,
    };
  } catch (err) {
    // Fail-safe: always return the original lead if any unexpected error occurs
    return lead;
  }
}

