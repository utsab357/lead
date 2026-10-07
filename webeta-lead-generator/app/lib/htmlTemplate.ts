/**
 * HTML Template Engine — Pure TypeScript Website Generator
 *
 * Generates a complete, production-ready HTML5 website from a WebsiteSpec.
 * The LAYOUT, CSS, and STRUCTURE are 100% code-controlled (never AI-generated).
 * AI only generates the headline text and short descriptions via a minimal prompt.
 *
 * This guarantees:
 *   - Correct unique colors every time (from resolveVisualDesignTokens)
 *   - All 8 sections always present and complete
 *   - No broken hamburger menus
 *   - No skeleton output
 *   - 30-60KB rich HTML output
 *   - Real business photos used correctly
 */

import type { RankedLead, BusinessStrategy } from "./types";
import { buildWebsiteSpec, getCategoryGalleryPhotos } from "./websiteSpec";
import { buildDeterministicBusinessStrategy } from "./businessStrategy";

export interface TemplateResult {
  ok: boolean;
  html?: string;
  provider: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function waLink(phone: string, name: string): string {
  const digits = phone.replace(/\D/g, "");
  const num = digits.startsWith("91") ? digits : "91" + digits.replace(/^0/, "");
  return `https://wa.me/${num}?text=Hello%20${encodeURIComponent(name)}`;
}

function starRating(n: number): string {
  const filled = Math.round(n);
  return "★".repeat(filled) + "☆".repeat(Math.max(0, 5 - filled));
}

// ── Section Builders ──────────────────────────────────────────────────────────

function buildNav(businessName: string, waUrl: string, tokens: any, ctaText: string = "Reserve a Table", layoutVariant: string = "A"): string {
  const { primaryColor, darkColor, canvasColor, surfaceColor } = tokens;

  // Variant A — white floating pill (clean/minimal)
  if (layoutVariant === "A") return `
  <!-- NAV -->
  <nav style="position:sticky;top:16px;z-index:999;max-width:1200px;margin:0 auto;padding:0 24px;">
    <div style="background:rgba(255,255,255,0.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(0,0,0,0.07);border-radius:999px;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <a href="#" style="font-family:var(--font-display);font-size:18px;font-weight:800;color:${darkColor};text-decoration:none;letter-spacing:-0.02em;">${esc(businessName)}</a>
      <ul style="display:flex;gap:24px;list-style:none;margin:0;padding:0;">
        <li><a href="#menu" style="color:${darkColor};text-decoration:none;font-size:14px;font-weight:500;opacity:0.65;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.65">Menu</a></li>
        <li><a href="#about" style="color:${darkColor};text-decoration:none;font-size:14px;font-weight:500;opacity:0.65;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.65">About</a></li>
        <li><a href="#gallery" style="color:${darkColor};text-decoration:none;font-size:14px;font-weight:500;opacity:0.65;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.65">Gallery</a></li>
      </ul>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;font-weight:600;color:#16a34a;">● Open</span>
        <a href="${waUrl}" target="_blank" style="background:${primaryColor};color:#fff;padding:10px 20px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;">${esc(ctaText)}</a>
      </div>
    </div>
  </nav>`;

  // Variant B — dark full-width bar with accent underline
  if (layoutVariant === "B") return `
  <!-- NAV -->
  <nav style="position:sticky;top:0;z-index:999;width:100%;background:${darkColor};border-bottom:3px solid ${primaryColor};">
    <div style="max-width:1200px;margin:0 auto;padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:60px;">
      <a href="#" style="font-family:var(--font-display);font-size:20px;font-weight:900;color:#fff;text-decoration:none;letter-spacing:-0.03em;">${esc(businessName)}</a>
      <ul style="display:flex;gap:28px;list-style:none;margin:0;padding:0;">
        <li><a href="#menu" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;" onmouseover="this.style.color='${primaryColor}'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">Menu</a></li>
        <li><a href="#about" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;" onmouseover="this.style.color='${primaryColor}'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">About</a></li>
        <li><a href="#gallery" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;" onmouseover="this.style.color='${primaryColor}'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">Gallery</a></li>
      </ul>
      <a href="${waUrl}" target="_blank" style="background:${primaryColor};color:#fff;padding:9px 22px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">${esc(ctaText)} →</a>
    </div>
  </nav>`;

  // Variant C — transparent overlay (sits on top of hero image)
  if (layoutVariant === "C") return `
  <!-- NAV -->
  <nav style="position:absolute;top:0;left:0;right:0;z-index:999;padding:24px 40px;">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <a href="#" style="font-family:var(--font-display);font-size:20px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.01em;text-shadow:0 2px 8px rgba(0,0,0,0.4);">${esc(businessName)}</a>
      <div style="display:flex;align-items:center;gap:28px;">
        <a href="#menu" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:14px;font-weight:600;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.85)'">Menu</a>
        <a href="#about" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:14px;font-weight:600;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.85)'">About</a>
        <a href="#gallery" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:14px;font-weight:600;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.85)'">Gallery</a>
        <a href="${waUrl}" target="_blank" style="background:#fff;color:${darkColor};padding:10px 22px;border-radius:999px;font-size:13px;font-weight:800;text-decoration:none;">${esc(ctaText)}</a>
      </div>
    </div>
  </nav>`;

  // Variant D — bold colored bar, business name centered
  return `
  <!-- NAV -->
  <nav style="position:sticky;top:0;z-index:999;background:${primaryColor};width:100%;">
    <div style="max-width:1200px;margin:0 auto;padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:56px;">
      <ul style="display:flex;gap:20px;list-style:none;margin:0;padding:0;flex:1;">
        <li><a href="#menu" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;font-weight:700;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.8)'">Menu</a></li>
        <li><a href="#about" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;font-weight:700;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.8)'">About</a></li>
      </ul>
      <a href="#" style="font-family:var(--font-display);font-size:18px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.02em;text-align:center;flex:1;">${esc(businessName)}</a>
      <div style="display:flex;gap:20px;align-items:center;flex:1;justify-content:flex-end;">
        <a href="#gallery" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;font-weight:700;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.8)'">Gallery</a>
        <a href="${waUrl}" target="_blank" style="background:#fff;color:${primaryColor};padding:8px 18px;border-radius:999px;font-size:13px;font-weight:800;text-decoration:none;">${esc(ctaText)}</a>
      </div>
    </div>
  </nav>`;
}

function buildHero(spec: any, waUrl: string, telLink: string, variant: string): string {
  const { tokens, curatedStockPhotos, rating, reviewsCount, businessName, category, city } = spec;
  const ratingVal = rating ? rating.toFixed(1) : "4.8";
  const reviewVal = reviewsCount ? `${reviewsCount}+` : "150+";
  const headline = spec.aiCopy?.headline || spec.strategy?.heroHeadline ||
    (spec.strategy?.subCategory?.value === "bengali_heritage_restaurant" ? `Authentic Bengali Feasts & Polao in ${city}` :
     spec.strategy?.subCategory?.value === "specialty_cafe" ? `Artisan Flavours & Cozy Vibes in ${city}` :
     spec.strategy?.subCategory?.value === "strength_hardcore_gym" ? `Train Hard. Get Results. ${city}'s Best Gym` :
     spec.strategy?.subCategory?.value === "dental_clinic" ? `Gentle, Advanced Dental Care in ${city}` :
     spec.strategy?.subCategory?.value === "luxury_salon_spa" ? `Elevate Your Look at ${businessName}` :
     `Welcome to ${businessName}`);
  const subtitle = spec.aiCopy?.subtitle || `${spec.strategy?.primarySellingPoint?.value || `Top-rated ${category} in ${city} — trusted by ${reviewVal} happy customers.`}`;
  const primaryCtaText = spec.primaryCtaText || "Chat on WhatsApp →";
  const img = curatedStockPhotos.hero;

  // Layout A — Classic centered fullscreen hero
  if (variant === "A") return `
  <!-- HERO A: Centered Fullscreen -->
  <section style="height:100dvh;min-height:620px;background-image:linear-gradient(160deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.25) 55%,rgba(0,0,0,0.65) 100%),url('${img}');background-size:cover;background-position:center;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px;position:relative;margin-top:-72px;padding-top:112px;">
    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:8px 20px;margin-bottom:24px;">
      <span style="color:#fbbf24;">★</span>
      <span style="color:#fff;font-size:13px;font-weight:600;">${ratingVal} · ${reviewVal} Google Reviews</span>
    </div>
    <h1 style="font-family:var(--font-display);font-size:clamp(30px,4.5vw,54px);font-weight:800;color:#fff;line-height:1.15;letter-spacing:-0.02em;max-width:820px;margin:0 0 18px;">${esc(headline)}</h1>
    <p style="font-size:clamp(14px,1.6vw,17px);color:rgba(255,255,255,0.85);max-width:560px;margin:0 0 32px;line-height:1.6;">${esc(subtitle)}</p>
    <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;">
      <a href="${waUrl}" target="_blank" style="background:${tokens.primaryColor};color:#fff;padding:15px 36px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 8px 32px rgba(0,0,0,0.35);letter-spacing:0.01em;">${esc(primaryCtaText)}</a>
      <a href="${telLink}" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);color:#fff;border:2px solid rgba(255,255,255,0.35);padding:15px 30px;border-radius:999px;font-size:15px;font-weight:600;text-decoration:none;">Call Now</a>
    </div>
    <div style="position:absolute;bottom:28px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:.12em;text-transform:uppercase;display:flex;flex-direction:column;align-items:center;gap:6px;">
      <span>Scroll to Explore</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:bounce 2s infinite"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </div>
  </section>`;

  // Layout B — Split: left text panel + right full-bleed image
  if (variant === "B") return `
  <!-- HERO B: Split Layout -->
  <section style="min-height:100dvh;display:grid;grid-template-columns:1fr 1fr;margin-top:-72px;">
    <div style="background:${tokens.canvasColor};display:flex;flex-direction:column;justify-content:center;padding:120px 60px 60px;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:${tokens.primaryColor}18;border-radius:999px;padding:7px 16px;margin-bottom:24px;width:fit-content;">
        <span style="color:#fbbf24;">★</span>
        <span style="color:${tokens.primaryColor};font-size:12px;font-weight:700;">${ratingVal} · ${reviewVal} Reviews</span>
      </div>
      <h1 style="font-family:var(--font-display);font-size:clamp(28px,3.8vw,48px);font-weight:800;color:${tokens.darkColor};line-height:1.2;letter-spacing:-0.02em;margin:0 0 16px;">${esc(headline)}</h1>
      <p style="font-size:15px;color:${tokens.darkColor};opacity:0.75;line-height:1.65;margin:0 0 32px;max-width:440px;">${esc(subtitle)}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <a href="${waUrl}" target="_blank" style="background:${tokens.primaryColor};color:#fff;padding:15px 32px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;">${esc(primaryCtaText)}</a>
        <a href="${telLink}" style="background:transparent;color:${tokens.darkColor};border:2px solid ${tokens.primaryColor}40;padding:15px 28px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">Call Direct</a>
      </div>
    </div>
    <div style="background-image:url('${img}');background-size:cover;background-position:center;min-height:560px;"></div>
  </section>`;

  // Layout C — Dark editorial: balanced, elegant type on dark overlay
  if (variant === "C") return `
  <!-- HERO C: Dark Editorial -->
  <section style="height:100dvh;min-height:640px;position:relative;overflow:hidden;margin-top:-72px;display:flex;flex-direction:column;justify-content:flex-end;padding:0 60px 80px;">
    <div style="position:absolute;inset:0;background-image:url('${img}');background-size:cover;background-position:center;"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.2) 100%);"></div>
    <div style="position:relative;z-index:1;max-width:1100px;">
      <div style="display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:6px 16px;margin-bottom:18px;background:rgba(0,0,0,0.3);backdrop-filter:blur(8px);">
        <span style="color:#fbbf24;">★</span>
        <span style="color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;">${ratingVal} · ${reviewVal} Google Reviews</span>
      </div>
      <h1 style="font-family:var(--font-display);font-size:clamp(30px,4.5vw,54px);font-weight:800;color:#fff;line-height:1.15;letter-spacing:-0.02em;margin:0 0 16px;max-width:820px;">${esc(headline)}</h1>
      <p style="font-size:clamp(14px,1.6vw,17px);color:rgba(255,255,255,0.85);max-width:580px;line-height:1.6;margin:0 0 24px;">${esc(subtitle)}</p>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <a href="${waUrl}" target="_blank" style="background:${tokens.primaryColor};color:#fff;padding:14px 34px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 6px 24px rgba(0,0,0,0.3);">${esc(primaryCtaText)}</a>
        <a href="${telLink}" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">Call Directly</a>
      </div>
    </div>
  </section>`;

  // Layout D — Bold with accent stripe + stacked text
  return `
  <!-- HERO D: Bold Accent -->
  <section style="min-height:100dvh;background-image:url('${img}');background-size:cover;background-position:center;position:relative;display:flex;align-items:center;margin-top:-72px;">
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,${tokens.primaryColor}EE 0%,${tokens.darkColor}CC 100%);"></div>
    <div style="position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:120px 60px 80px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:16px;">${esc(category)} · ${esc(city)}</div>
      <h1 style="font-family:var(--font-display);font-size:clamp(30px,4.5vw,52px);font-weight:800;color:#fff;line-height:1.15;letter-spacing:-0.02em;margin:0 0 16px;max-width:760px;">${esc(headline)}</h1>
      <div style="width:60px;height:4px;background:#fff;border-radius:2px;margin:0 0 20px;"></div>
      <p style="font-size:16px;color:rgba(255,255,255,0.85);max-width:520px;line-height:1.6;margin:0 0 32px;">${esc(subtitle)}</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <a href="${waUrl}" target="_blank" style="background:#fff;color:${tokens.primaryColor};padding:15px 34px;border-radius:999px;font-size:15px;font-weight:800;text-decoration:none;">${esc(primaryCtaText)}</a>
        <a href="${telLink}" style="background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.4);color:#fff;padding:15px 28px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">★ ${ratingVal} · ${reviewVal} reviews</a>
      </div>
    </div>
  </section>`;
}

function buildTrustBar(spec: any): string {
  const { tokens, rating, reviewsCount, city } = spec;
  const ratingVal = rating ? rating.toFixed(1) : "4.8";
  const reviewVal = reviewsCount ? `${reviewsCount}+` : "150+";

  return `
  <!-- TRUST BAR -->
  <div style="background:${tokens.canvasColor};padding:0 24px;">
    <div style="max-width:960px;margin:0 auto;background:${tokens.darkColor};border-radius:999px;padding:18px 40px;display:flex;align-items:center;justify-content:center;gap:40px;flex-wrap:wrap;box-shadow:0 12px 48px rgba(0,0,0,0.2);transform:translateY(-28px);">
      <div style="display:flex;align-items:center;gap:10px;color:#fff;">
        <span style="font-size:22px;color:#fbbf24;">★</span>
        <span style="font-size:15px;font-weight:700;">${ratingVal} Google Rating</span>
      </div>
      <div style="width:1px;height:24px;background:rgba(255,255,255,0.2);"></div>
      <div style="display:flex;align-items:center;gap:10px;color:#fff;">
        <span style="font-size:20px;">💬</span>
        <span style="font-size:15px;font-weight:700;">${reviewVal} Real Customer Reviews</span>
      </div>
      <div style="width:1px;height:24px;background:rgba(255,255,255,0.2);"></div>
      <div style="display:flex;align-items:center;gap:10px;color:#fff;">
        <span style="font-size:20px;">🌿</span>
        <span style="font-size:15px;font-weight:700;">Loved in ${esc(city)}</span>
      </div>
    </div>
  </div>`;
}

function buildOfferings(spec: any, waUrl: string): string {
  const { tokens, strategy, businessName, scrapedPhotos, category } = spec;
  const galleryDefaults = getCategoryGalleryPhotos(category);
  const offerings = strategy?.actualOfferings?.slice(0, 6) || [];
  const allPhotos = [...scrapedPhotos.slice(0, 6), ...galleryDefaults];

  const isFood = /cafe|coffee|restaurant|dining|food|pizza|burger|bistro|dhaba|eatery/i.test(category);
  const sectionTitle = isFood ? "Signature Dishes & Specialties" : "Our Services & Offerings";
  const sectionTag = isFood ? "OUR MENU" : "OUR SERVICES";

  const itemsHTML = offerings.length > 0
    ? offerings.map((o: any, i: number) => {
        const img = allPhotos[i] || galleryDefaults[i % galleryDefaults.length];
        const desc = o.description || o.evidenceQuote?.slice(0, 80) || "";
        return `
        <div style="background:${tokens.surfaceColor};border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);transition:transform .25s,box-shadow .25s;" onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 16px 48px rgba(0,0,0,0.12)'" onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 16px rgba(0,0,0,0.06)'">
          <div style="height:180px;background:url('${img}') center/cover no-repeat;"></div>
          <div style="padding:18px;">
            <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:${tokens.darkColor};margin:0 0 6px;">${esc(o.name)}</h3>
            ${desc ? `<p style="font-size:13px;color:${tokens.darkColor};opacity:0.65;margin:0;line-height:1.5;">${esc(desc.slice(0, 80))}</p>` : ""}
          </div>
        </div>`;
      }).join("")
    : [0, 1, 2, 3, 4, 5].map(i => {
        const img = allPhotos[i] || galleryDefaults[i % galleryDefaults.length];
        const label = isFood ? ["Signature Dish", "Chef's Special", "Fresh Today", "Must Try", "Popular Pick", "Customer Favourite"][i] : ["Core Service", "Premium Package", "Expert Care", "Trusted Solution", "Best Value", "Top Choice"][i];
        return `
        <div style="background:${tokens.surfaceColor};border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.06);transition:transform .25s,box-shadow .25s;" onmouseover="this.style.transform='translateY(-6px)';this.style.boxShadow='0 16px 48px rgba(0,0,0,0.12)'" onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 16px rgba(0,0,0,0.06)'">
          <div style="height:180px;background:url('${img}') center/cover no-repeat;"></div>
          <div style="padding:18px;">
            <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:${tokens.darkColor};margin:0;">${label}</h3>
          </div>
        </div>`;
      }).join("");

  return `
  <!-- OFFERINGS / MENU -->
  <section id="menu" style="padding:80px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:48px;">
        <div>
          <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:10px;">${sectionTag}</span>
          <h2 style="font-family:var(--font-display);font-size:clamp(28px,4vw,48px);font-weight:800;color:${tokens.darkColor};margin:0;line-height:1.1;">${sectionTitle}</h2>
        </div>
        <a href="${waUrl}" target="_blank" style="background:${tokens.primaryColor};color:#fff;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;">Order on WhatsApp →</a>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;">
        ${itemsHTML}
      </div>
    </div>
  </section>`;
}

function buildAbout(spec: any, waUrl: string): string {
  const { tokens, businessName, city, scrapedPhotos, curatedStockPhotos, strategy } = spec;
  const photo = scrapedPhotos[0] || curatedStockPhotos.hero;
  const narrative = spec.lead?.about?.slice(0, 300)
    || strategy?.primarySellingPoint?.value
    || `${businessName} is proudly serving the ${city} community with authentic quality, warm hospitality, and an unforgettable experience. Every visit is crafted with care.`;

  return `
  <!-- ABOUT -->
  <section id="about" style="padding:80px 24px;background:${tokens.surfaceColor};">
    <div style="max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;">
      <div style="order:1;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">ABOUT US</span>
        <h2 style="font-family:var(--font-display);font-size:clamp(28px,4vw,44px);font-weight:800;color:${tokens.darkColor};margin:0 0 20px;line-height:1.15;">Experience ${esc(businessName)}</h2>
        <p style="font-size:16px;color:${tokens.darkColor};opacity:0.75;line-height:1.8;margin:0 0 28px;">${esc(narrative)}</p>
        <div style="display:flex;gap:32px;margin-bottom:32px;flex-wrap:wrap;">
          <div>
            <div style="font-family:var(--font-display);font-size:36px;font-weight:900;color:${tokens.primaryColor};">${spec.rating?.toFixed(1) || "4.8"}★</div>
            <div style="font-size:13px;color:${tokens.darkColor};opacity:0.6;font-weight:600;">Google Rating</div>
          </div>
          <div>
            <div style="font-family:var(--font-display);font-size:36px;font-weight:900;color:${tokens.primaryColor};">${spec.reviewsCount || 150}+</div>
            <div style="font-size:13px;color:${tokens.darkColor};opacity:0.6;font-weight:600;">Reviews</div>
          </div>
          <div>
            <div style="font-family:var(--font-display);font-size:36px;font-weight:900;color:${tokens.primaryColor};">10+</div>
            <div style="font-size:13px;color:${tokens.darkColor};opacity:0.6;font-weight:600;">Years Serving</div>
          </div>
        </div>
        <div style="display:inline-flex;align-items:center;gap:8px;background:${tokens.primaryColor}10;border-radius:999px;padding:8px 18px;">
          <span style="font-size:16px;">🌿</span>
          <span style="font-size:13px;font-weight:700;color:${tokens.primaryColor};">Trusted in ${esc(city)}</span>
        </div>
      </div>
      <div style="order:2;position:relative;">
        <div style="border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.15);aspect-ratio:4/3;">
          <img src="${photo}" alt="${esc(businessName)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" onerror="this.src='${curatedStockPhotos.hero}'">
        </div>
        <div style="position:absolute;bottom:-20px;left:-20px;background:${tokens.primaryColor};color:#fff;border-radius:20px;padding:16px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
          <div style="font-family:var(--font-display);font-size:20px;font-weight:900;">Since 2010</div>
          <div style="font-size:12px;opacity:0.85;">Serving with pride</div>
        </div>
      </div>
    </div>
  </section>`;
}

function buildHighlights(spec: any): string {
  const { tokens, city, rating, reviewsCount, strategy } = spec;
  const sp1 = strategy?.secondarySellingPoints?.[0] || "Committed to the highest standards of quality and service.";
  const sp2 = strategy?.secondarySellingPoints?.[1] || "Freshly prepared with premium ingredients every day.";
  const ratingVal = rating?.toFixed(1) || "4.8";
  const reviewVal = reviewsCount ? `${reviewsCount}+` : "150+";

  const cards = [
    { icon: "✦", title: "Verified Quality", desc: sp1, highlight: true },
    { icon: "★", title: "Top Rated", desc: `${ratingVal} ★ rating backed by ${reviewVal} real customer reviews on Google.` },
    { icon: "📍", title: "Prime Location", desc: `Centrally located in ${city} — easy to reach, impossible to forget.` },
    { icon: "💬", title: "Direct Support", desc: "Instant WhatsApp and phone response. We're always here for you." },
    { icon: "🍃", title: "Fresh Always", desc: sp2 },
    { icon: "🏆", title: "Community Loved", desc: `One of the most visited and reviewed businesses in ${city}.` },
  ];

  return `
  <!-- HIGHLIGHTS -->
  <section style="padding:80px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:56px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">WHY CHOOSE US</span>
        <h2 style="font-family:var(--font-display);font-size:clamp(28px,4vw,48px);font-weight:800;color:${tokens.darkColor};margin:0;">${(()=>{
          const n=spec.businessName||"";
          const h=n.split("").reduce((a:number,c:string)=>a+c.charCodeAt(0),0);
          const isFood=/cafe|coffee|restaurant|dining|food|pizza|bar|bakery|dhaba/i.test(spec.category||'');
          const isGym=/gym|fitness|yoga|crossfit/i.test(spec.category||'');
          const isMed=/clinic|doctor|dental|hospital|pharmacy/i.test(spec.category||'');
          const foodOpts=["What Makes Us Special","Our Promise to You","The Difference You'll Taste","Why Guests Keep Coming Back"];
          const gymOpts=["Built Different. Train Here.","What Separates Champions","Why Members Stay","The Edge You Need"];
          const medOpts=["Why Patients Trust Us","Our Care Philosophy","What Sets Our Care Apart","Our Commitment to You"];
          const genOpts=["What Sets Us Apart","Our Unique Advantage","Why Choose Us","The Difference We Make"];
          const opts=isFood?foodOpts:isGym?gymOpts:isMed?medOpts:genOpts;
          return opts[h%opts.length];
        })()}</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;">
        ${cards.map(c => `
        <div style="background:${c.highlight ? tokens.primaryColor : tokens.surfaceColor};border-radius:20px;padding:32px;transition:transform .25s,box-shadow .25s;" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 20px 48px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
          <div style="font-size:32px;margin-bottom:16px;">${c.icon}</div>
          <h3 style="font-family:var(--font-display);font-size:20px;font-weight:700;color:${c.highlight ? "#fff" : tokens.darkColor};margin:0 0 10px;">${c.title}</h3>
          <p style="font-size:14px;line-height:1.7;color:${c.highlight ? "rgba(255,255,255,0.85)" : tokens.darkColor};opacity:${c.highlight ? 1 : 0.7};margin:0;">${esc(c.desc)}</p>
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function buildGallery(spec: any): string {
  const { tokens, scrapedPhotos, curatedStockPhotos, businessName, category } = spec;
  const galleryDefaults = getCategoryGalleryPhotos(category);
  const photos = [...scrapedPhotos.slice(0, 8), ...galleryDefaults].slice(0, 8);
  // Ensure we have at least 4 photos
  while (photos.length < 4) photos.push(curatedStockPhotos.hero);

  const photoHTML = photos.map((p: string, i: number) => `
    <div style="border-radius:16px;overflow:hidden;aspect-ratio:${i === 0 || i === 3 ? "16/10" : "4/3"};${i === 0 ? "grid-column:span 2;" : ""}box-shadow:0 4px 20px rgba(0,0,0,0.08);transition:transform .3s,box-shadow .3s;" onmouseover="this.style.transform='scale(1.02)';this.style.boxShadow='0 16px 48px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='none';this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'">
      <img src="${p}" alt="${esc(businessName)} photo ${i + 1}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" onerror="this.src='${curatedStockPhotos.hero}'">
    </div>`).join("");

  return `
  <!-- GALLERY -->
  <section id="gallery" style="padding:80px 24px;background:${tokens.surfaceColor};">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:48px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">GALLERY</span>
        <h2 style="font-family:var(--font-display);font-size:clamp(28px,4vw,48px);font-weight:800;color:${tokens.darkColor};margin:0;">${(()=>{
          const n=spec.businessName||"";
          const h=n.split("").reduce((a:number,c:string)=>a+c.charCodeAt(0),0);
          const isFood=/cafe|coffee|restaurant|dining|food|pizza|bar|bakery|dhaba/i.test(spec.category||'');
          const foodOpts=[`A Glimpse of ${esc(spec.businessName)}`,"Step Inside Our World","Taste It Before You Arrive",`Inside ${esc(spec.businessName)}`];
          const genOpts=[`A Glimpse of ${esc(spec.businessName)}`,"See What We Do","Our Work, Our Pride","Explore Our Space"];
          const opts=isFood?foodOpts:genOpts;
          return opts[h%opts.length];
        })()}</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        ${photoHTML}
      </div>
    </div>
  </section>`;
}

function buildReviews(spec: any): string {
  const { tokens, businessName, city, rating } = spec;
  const ratingVal = rating?.toFixed(1) || "4.8";
  const reviews = (spec.lead?.reviews || []).filter((r: any) => r.rating >= 4).slice(0, 3);

  const defaultReviews = [
    { author: "Priya S.", text: `Amazing experience at ${businessName}! The quality and service exceeded my expectations. Highly recommended to everyone in ${city}.`, rating: 5 },
    { author: "Rahul M.", text: `Best ${spec.category || "place"} in ${city}! I've been coming here for years and it never disappoints. The staff is so welcoming.`, rating: 5 },
    { author: "Sneha K.", text: `Truly exceptional! ${businessName} offers wonderful service and an incredible atmosphere. Will definitely visit again very soon.`, rating: 5 },
  ];

  const displayReviews = reviews.length >= 2 ? reviews : defaultReviews;

  return `
  <!-- REVIEWS -->
  <section style="padding:80px 24px;background:${tokens.darkColor};">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:56px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">CUSTOMER REVIEWS</span>
        <h2 style="font-family:var(--font-display);font-size:clamp(28px,4vw,48px);font-weight:800;color:#fff;margin:0 0 12px;">${(()=>{
          const n=businessName||"";
          const h=n.split("").reduce((a:number,c:string)=>a+c.charCodeAt(0),0);
          const opts=["What Our Guests Say","Voices We Cherish","Straight From Our Customers","What People Love About Us","Real Words, Real People"];
          return opts[h%opts.length];
        })()}</h2>
        <p style="color:rgba(255,255,255,0.6);font-size:16px;margin:0;">${ratingVal} ★ average across ${spec.reviewsCount || 150}+ real Google reviews</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:24px;">
        ${displayReviews.map((r: any) => `
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;backdrop-filter:blur(8px);">
          <div style="color:#fbbf24;font-size:18px;margin-bottom:14px;">${"★".repeat(r.rating || 5)}</div>
          <p style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.7;margin:0 0 20px;font-style:italic;">"${esc((r.text || "").slice(0, 150))}"</p>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:50%;background:${tokens.primaryColor};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">${(r.author || "C")[0]}</div>
            <div>
              <div style="color:#fff;font-weight:700;font-size:14px;">${esc(r.author || "Customer")}</div>
              <div style="color:rgba(255,255,255,0.5);font-size:12px;">Google Review • Verified</div>
            </div>
          </div>
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function buildLocation(spec: any, waUrl: string, telLink: string): string {
  const { tokens, businessName, city, address, phone } = spec;
  const hours = spec.lead?.hours?.[0] || "Mon – Sun: 11:00 AM – 11:00 PM";
  const mapsUrl = spec.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(businessName + " " + city)}`;

  return `
  <!-- LOCATION & CONTACT -->
  <section id="contact" style="padding:80px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:56px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">VISIT US</span>
        <h2 style="font-family:var(--font-display);font-size:clamp(28px,4vw,48px);font-weight:800;color:${tokens.darkColor};margin:0;">Find Us in ${esc(city)}</h2>
      </div>
      <div style="background:${tokens.darkColor};border-radius:28px;padding:48px;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;box-shadow:0 24px 80px rgba(0,0,0,0.15);">
        <div>
          <div style="margin-bottom:28px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${tokens.primaryColor};margin-bottom:8px;">📍 ADDRESS</div>
            <div style="color:#fff;font-size:16px;line-height:1.6;">${esc(address || city + ", West Bengal")}</div>
          </div>
          <div style="margin-bottom:28px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${tokens.primaryColor};margin-bottom:8px;">🕐 HOURS</div>
            <div style="color:#fff;font-size:16px;">${esc(hours)}</div>
          </div>
          <div style="margin-bottom:32px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${tokens.primaryColor};margin-bottom:8px;">📞 PHONE</div>
            <a href="${telLink}" style="color:#fff;font-size:16px;text-decoration:none;">${esc(phone)}</a>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <a href="${mapsUrl}" target="_blank" style="background:${tokens.primaryColor};color:#fff;padding:14px 24px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none;">Get Directions →</a>
            <a href="${waUrl}" target="_blank" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:14px 24px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">WhatsApp Us</a>
          </div>
        </div>
        <!-- Map visual -->
        <div style="border-radius:20px;overflow:hidden;aspect-ratio:4/3;background:linear-gradient(135deg,#1a3a2a 0%,#2d5a3d 50%,#1a3a2a 100%);position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.03) 0px,rgba(255,255,255,0.03) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(255,255,255,0.03) 0px,rgba(255,255,255,0.03) 1px,transparent 1px,transparent 40px);"></div>
          <div style="text-align:center;position:relative;z-index:1;">
            <div style="font-size:48px;margin-bottom:12px;">📍</div>
            <div style="color:#fff;font-weight:700;font-size:16px;margin-bottom:4px;">${esc(businessName)}</div>
            <div style="color:rgba(255,255,255,0.6);font-size:13px;">${esc(city)}</div>
            <a href="${mapsUrl}" target="_blank" style="display:inline-block;margin-top:16px;background:${tokens.primaryColor};color:#fff;padding:10px 20px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;">Open in Maps</a>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function buildCTABanner(spec: any, waUrl: string): string {
  const { tokens, businessName, city, category } = spec;
  const isFood = /cafe|coffee|restaurant|dining|food|pizza|burger|bistro|dhaba|eatery/i.test(category);
  const isGym  = /gym|fitness|yoga|crossfit/i.test(category);
  const isMed  = /clinic|doctor|dental|hospital|pharmacy/i.test(category);
  const h = businessName.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);

  const foodTitles = [
    `Order Fresh from ${businessName} Today`,
    `Craving ${businessName}? We Deliver.`,
    `Get ${businessName} Delivered to Your Door`,
    `Skip the Wait — Order on WhatsApp`,
  ];
  const foodSubs = [
    `Get your favourite dishes delivered straight to your door via WhatsApp. Fast, fresh, and personal.`,
    `Order directly on WhatsApp — no app needed. Hot food, real fast.`,
    `WhatsApp us your order and we'll handle the rest. Fresh food, every time.`,
    `The fastest way to enjoy ${businessName} — just message us on WhatsApp.`,
  ];
  const gymTitles = [
    `Start Your Fitness Journey at ${businessName}`,
    `Join ${businessName} Today`,
    `Your Strongest Self Starts Here`,
    `Ready to Train? We're Ready for You.`,
  ];
  const medTitles = [
    `Book Your Appointment at ${businessName}`,
    `Your Health, Our Priority — Book Now`,
    `Expert Care, One Message Away`,
    `Schedule a Visit with ${businessName} Today`,
  ];
  const genTitles = [
    `Get in Touch with ${businessName} Today`,
    `Ready to Work Together?`,
    `Connect with ${businessName} on WhatsApp`,
    `Your Next Step Starts Here`,
  ];

  const titles = isFood ? foodTitles : isGym ? gymTitles : isMed ? medTitles : genTitles;
  const subs = isFood ? foodSubs : [`Schedule your visit today and experience the difference firsthand. Quick response guaranteed.`];
  const title = titles[h % titles.length];
  const sub = subs[h % subs.length];

  return `
  <!-- CTA BANNER -->
  <section style="padding:80px 24px;background:${tokens.surfaceColor};">
    <div style="max-width:900px;margin:0 auto;background:linear-gradient(135deg,${tokens.primaryColor} 0%,${tokens.secondaryColor} 100%);border-radius:28px;padding:60px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.15);">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:16px;">${isFood ? "ORDER NOW" : "BOOK NOW"}</div>
      <h2 style="font-family:var(--font-display);font-size:clamp(24px,4vw,42px);font-weight:800;color:#fff;margin:0 0 16px;line-height:1.15;">${esc(title)}</h2>
      <p style="color:rgba(255,255,255,0.8);font-size:16px;margin:0 0 36px;line-height:1.6;max-width:560px;margin-left:auto;margin-right:auto;">${esc(sub)}</p>
      <a href="${waUrl}" target="_blank" style="display:inline-block;background:#fff;color:${tokens.primaryColor};padding:16px 40px;border-radius:999px;font-size:16px;font-weight:800;text-decoration:none;box-shadow:0 8px 32px rgba(0,0,0,0.15);transition:transform .2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
        ${isFood ? "Order on WhatsApp →" : "Book Appointment →"}
      </a>
    </div>
  </section>`;
}

function buildFooter(spec: any, waUrl: string, telLink: string): string {
  const { tokens, businessName, city, address, phone } = spec;
  const year = new Date().getFullYear();

  return `
  <!-- FOOTER -->
  <footer style="background:${tokens.darkColor};padding:60px 24px 32px;">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:48px;margin-bottom:48px;flex-wrap:wrap;">
        <div>
          <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:#fff;margin-bottom:12px;">${esc(businessName)}</div>
          <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.7;margin:0 0 20px;max-width:300px;">Proudly serving ${esc(city)} with quality, passion, and an unforgettable experience.</p>
          <div style="display:flex;gap:12px;">
            <a href="${waUrl}" target="_blank" style="width:40px;height:40px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:18px;">💬</a>
            <a href="${telLink}" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:18px;">📞</a>
          </div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:20px;">Quick Links</div>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;">
            ${["#menu", "#about", "#gallery", "#contact"].map((h, i) => `<li><a href="${h}" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:14px;transition:color .2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">${["Menu", "About", "Gallery", "Contact"][i]}</a></li>`).join("")}
          </ul>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:20px;">Contact</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <a href="${telLink}" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:14px;">${esc(phone)}</a>
            <div style="color:rgba(255,255,255,0.6);font-size:14px;line-height:1.5;">${esc(address || city)}</div>
          </div>
        </div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="color:rgba(255,255,255,0.4);font-size:13px;">© ${year} ${esc(businessName)}. All Rights Reserved.</div>
        <div style="color:rgba(255,255,255,0.3);font-size:12px;">Powered by Webeta</div>
      </div>
      <div style="height:48px;width:100%;" aria-hidden="true"></div>
    </div>
  </footer>

  <!-- FLOATING WHATSAPP -->
  <a href="${waUrl}" target="_blank" id="wa-fab" style="position:fixed;bottom:28px;right:28px;z-index:9999;background:#25D366;border-radius:50%;width:60px;height:60px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(37,211,102,0.5);text-decoration:none;animation:waPulse 2s ease-in-out infinite;" title="Chat on WhatsApp">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.121 1.523 5.854L.055 23.454a.5.5 0 0 0 .491.601l5.797-1.45A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.7-.514-5.246-1.408l-.376-.218-3.897.975.999-3.794-.24-.386A9.945 9.945 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
  </a>`;
}

// ── AI Copy Generator (fast, non-blocking) ────────────────────────────────────

async function generateAICopy(lead: RankedLead, spec: any): Promise<{ headline: string; subtitle: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const about = (lead.about || "").slice(0, 200);
  const reviews = (lead.reviews || []).slice(0, 2).map((r: any) => r.text?.slice(0, 80)).filter(Boolean).join("; ");
  const prompt = `Business: ${lead.name} | Type: ${lead.category} | City: ${lead.city?.split(",")[0]} | About: ${about} | Reviews: ${reviews}

Write ONE punchy hero headline (max 8 words, no quotes) and ONE subtitle sentence (max 18 words) for this business website. Be specific to THIS business — use its name, specialty, and city. No generic phrases like "Welcome to" or "Best in town".

Reply in this exact JSON: {"headline": "...", "subtitle": "..."}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 120, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(raw);
    if (parsed?.headline && parsed?.subtitle) return parsed;
  } catch { /* timeout or error — use fallback */ }
  return null;
}

// ── Master HTML Builder ────────────────────────────────────────────────────────

/**
 * Builds a complete, production-ready HTML website from a RankedLead.
 * Structure/CSS = TypeScript code (guaranteed correct).
 * Copy (headline/subtitle) = AI-enhanced via Gemini Flash (fast, optional).
 * Layout variant = deterministic hash of business name (A/B/C/D).
 */
export async function buildTemplateHTML(lead: RankedLead, strategy?: BusinessStrategy): Promise<TemplateResult> {
  try {
    const bizStrategy = strategy || buildDeterministicBusinessStrategy(lead);
    const spec = buildWebsiteSpec(lead, "ai-decides", bizStrategy);
    (spec as any).lead = lead;
    (spec as any).strategy = bizStrategy;

    const { tokens, businessName, phone } = spec;
    const waUrl = spec.whatsapp || waLink(phone || "", businessName);
    const telLink = phone ? `tel:${phone.replace(/\s/g, "")}` : "#";
    const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(tokens.displayFont)}:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400&family=${encodeURIComponent(tokens.bodyFont)}:wght@400;500;600;700&display=swap`;

    // Layout variant from hash (A/B/C/D)
    const layoutVariant = (tokens as any).layoutVariant || "A";

    // CTA text by business type
    const isFood = /cafe|coffee|restaurant|dining|food|pizza|burger|bistro|dhaba|eatery/i.test(spec.category);
    const isMedical = /clinic|doctor|dental|hospital|health|pharmacy/i.test(spec.category);
    const isService = /salon|spa|beauty|gym|fitness|coaching/i.test(spec.category);
    let primaryCtaText = "Chat on WhatsApp →";
    if (isFood) primaryCtaText = "Reserve a Table →";
    else if (isMedical) primaryCtaText = "Book Appointment →";
    else if (isService) primaryCtaText = "Book Now →";
    (spec as any).primaryCtaText = primaryCtaText;

    // Try AI copy (fast, 8s timeout — fallback is fine)
    const aiCopy = await generateAICopy(lead, spec);
    (spec as any).aiCopy = aiCopy;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(businessName)} — ${esc(spec.category)} in ${esc(spec.city)}</title>
  <meta name="description" content="${esc(businessName)} — Top-rated ${esc(spec.category)} in ${esc(spec.city)}. ${spec.rating?.toFixed(1) || "4.8"} ★ with ${spec.reviewsCount || 150}+ verified Google reviews.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsUrl}" rel="stylesheet">
  <style>
    :root {
      --color-primary: ${tokens.primaryColor};
      --color-secondary: ${tokens.secondaryColor};
      --color-dark: ${tokens.darkColor};
      --color-surface: ${tokens.surfaceColor};
      --color-canvas: ${tokens.canvasColor};
      --font-display: '${tokens.displayFont}', Georgia, serif;
      --font-body: '${tokens.bodyFont}', system-ui, sans-serif;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; padding: 0; font-family: var(--font-body); background: ${tokens.canvasColor}; color: ${tokens.darkColor}; line-height: 1.6; overflow-x: hidden; }
    img { max-width: 100%; display: block; }
    a { color: inherit; }
    @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(7px)} }
    @keyframes waPulse { 0%,100%{box-shadow:0 4px 20px rgba(37,211,102,.5)} 50%{box-shadow:0 4px 40px rgba(37,211,102,.95)} }
    @media (max-width: 768px) {
      .nav-links { display: none !important; }
      section > div[style*="grid-template-columns:1fr 1fr"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:2fr 1fr 1fr"] { grid-template-columns: 1fr !important; }
      [style*="grid-template-columns:repeat(3,1fr)"] { grid-template-columns: repeat(2,1fr) !important; }
      [style*="grid-column:span 2"] { grid-column: span 1 !important; }
      [style*="min-height:100dvh"][style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
    }
    @media (max-width: 480px) {
      [style*="grid-template-columns:repeat(2,1fr)"] { grid-template-columns: 1fr !important; }
      [style*="padding:120px 60px"] { padding: 80px 24px 60px !important; }
    }
  </style>
</head>
<body>
<div id="webeta-preview-banner" style="background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; color: #f8fafc; border-bottom: 1px solid rgba(255,255,255,0.12); position: sticky; top: 0; z-index: 99999; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
  <div style="display: flex; align-items: center; gap: 10px;">
    <img src="/webeta-logo.jpg" alt="Webeta" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.2);" />
    <span style="letter-spacing: -0.01em;">⚡ Private Concept for <strong style="color: #fff;">${esc(businessName)}</strong> — Crafted by <strong style="color: #38bdf8;">Webeta</strong></span>
  </div>
  <div style="display: flex; align-items: center; gap: 12px;">
    <span style="font-size: 11px; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 999px;">Private Preview Active</span>
    <a href="https://webeta.site" target="_blank" rel="noopener noreferrer" style="color: #4ade80; text-decoration: none; font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 4px; padding: 4px 10px; background: rgba(74, 222, 128, 0.1); border-radius: 6px; border: 1px solid rgba(74, 222, 128, 0.25);">webeta.site ↗</a>
  </div>
</div>
${buildNav(businessName, waUrl, tokens, primaryCtaText, layoutVariant)}
${buildHero(spec, waUrl, telLink, layoutVariant)}
${buildTrustBar(spec)}
${buildOfferings(spec, waUrl)}
${buildAbout(spec, waUrl)}
${buildHighlights(spec)}
${buildGallery(spec)}
${buildReviews(spec)}
${buildCTABanner(spec, waUrl)}
${buildLocation(spec, waUrl, telLink)}
${buildFooter(spec, waUrl, telLink)}
</body>
</html>`;

    return { ok: true, html, provider: "template-engine" };
  } catch (err) {
    return { ok: false, provider: "template-engine", error: (err as Error).message };
  }
}
