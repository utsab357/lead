/**
 * Multi-Page Template Engine
 *
 * Generates secondary pages (Menu, Services, Gallery, Rooms, Programs,
 * Portfolio, Products) that share the same design tokens as the home page.
 *
 * Each page:
 *   - Uses identical navbar (same variant A/B/C/D, same colors)
 *   - Has a compact hero banner (not full-screen)
 *   - Has rich, page-specific content
 *   - Has the same footer
 *   - Is standalone HTML (no routing needed — each is a separate PNG)
 */

import type { RankedLead, BusinessStrategy } from "./types";
import { buildWebsiteSpec, getCategoryGalleryPhotos } from "./websiteSpec";
import { buildDeterministicBusinessStrategy } from "./businessStrategy";
import { createWhatsAppUrl, cleanPhone } from "./phoneUtils";

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
  return createWhatsAppUrl(phone, name);
}

function getNavHTML(businessName: string, waUrl: string, tokens: any, layoutVariant: string, ctaText: string): string {
  const { primaryColor, darkColor } = tokens;
  const homeHref = "javascript:window.location.href=window.location.href.replace(/[_-](menu|gallery|services|rooms|programs|portfolio|products|dining|facilities|treatments|events)(\\.html)?(?=[?#]|$)/i,(m,p1,ext)=>ext||'');";
  const galleryHref = "javascript:window.location.href=window.location.href.replace(/[_-](menu|gallery|services|rooms|programs|portfolio|products|dining|facilities|treatments|events)(\\.html)?(?=[?#]|$)/i,(m,p1,ext)=>ext||'').split('#')[0]+'#gallery';";

  if (layoutVariant === "A") return `
  <nav class="site-nav" style="position:sticky;top:0;z-index:999;width:100%;background:rgba(255,255,255,0.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid rgba(0,0,0,0.06);box-shadow:0 4px 20px rgba(0,0,0,0.04);">
    <div class="site-nav-inner" style="max-width:1200px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <a href="${homeHref}" class="brand-name" style="font-family:var(--font-display);font-size:20px;font-weight:800;color:${darkColor};text-decoration:none;letter-spacing:-0.02em;">${esc(businessName)}</a>
      <ul class="nav-links-desktop" style="display:flex;gap:26px;list-style:none;margin:0;padding:0;">
        <li><a href="${homeHref}" style="color:${darkColor};text-decoration:none;font-size:14px;font-weight:600;opacity:0.75;">Home</a></li>
        <li><a href="#content" style="color:${primaryColor};text-decoration:none;font-size:14px;font-weight:700;">Menu</a></li>
        <li><a href="${galleryHref}" style="color:${darkColor};text-decoration:none;font-size:14px;font-weight:600;opacity:0.75;">Gallery</a></li>
      </ul>
      <a href="${waUrl}" target="_blank" class="nav-cta" style="background:${primaryColor};color:#fff;padding:9px 20px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">${esc(ctaText)}</a>
    </div>
  </nav>`;

  if (layoutVariant === "B") return `
  <nav class="site-nav" style="position:sticky;top:0;z-index:999;width:100%;background:${darkColor};border-bottom:3px solid ${primaryColor};box-shadow:0 4px 20px rgba(0,0,0,0.15);">
    <div class="site-nav-inner" style="max-width:1200px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <a href="${homeHref}" class="brand-name" style="font-family:var(--font-display);font-size:20px;font-weight:900;color:#fff;text-decoration:none;letter-spacing:-0.03em;">${esc(businessName)}</a>
      <ul class="nav-links-desktop" style="display:flex;gap:28px;list-style:none;margin:0;padding:0;">
        <li><a href="${homeHref}" style="color:rgba(255,255,255,0.7);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">HOME</a></li>
        <li><a href="#content" style="color:${primaryColor};text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">MENU</a></li>
        <li><a href="${galleryHref}" style="color:rgba(255,255,255,0.7);text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">GALLERY</a></li>
      </ul>
      <a href="${waUrl}" target="_blank" class="nav-cta" style="background:${primaryColor};color:#fff;padding:9px 22px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;">${esc(ctaText)} →</a>
    </div>
  </nav>`;

  if (layoutVariant === "C") return `
  <nav class="site-nav" style="position:sticky;top:0;z-index:999;width:100%;background:rgba(18,18,18,0.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,0.1);box-shadow:0 4px 20px rgba(0,0,0,0.25);">
    <div class="site-nav-inner" style="max-width:1200px;margin:0 auto;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <a href="${homeHref}" class="brand-name" style="font-family:var(--font-display);font-size:22px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.02em;">${esc(businessName)}</a>
      <ul class="nav-links-desktop" style="display:flex;gap:28px;list-style:none;margin:0;padding:0;">
        <li><a href="${homeHref}" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:14px;font-weight:600;">Home</a></li>
        <li><a href="#content" style="color:#fff;text-decoration:none;font-size:14px;font-weight:700;border-bottom:2px solid ${primaryColor};padding-bottom:2px;">Menu</a></li>
        <li><a href="${galleryHref}" style="color:rgba(255,255,255,0.85);text-decoration:none;font-size:14px;font-weight:600;">Gallery</a></li>
      </ul>
      <a href="${waUrl}" target="_blank" class="nav-cta" style="background:${primaryColor};color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;">${esc(ctaText)}</a>
    </div>
  </nav>`;

  return `
  <nav class="site-nav" style="position:sticky;top:0;z-index:999;background:${primaryColor};width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
    <div class="site-nav-inner" style="max-width:1200px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <ul class="nav-links-desktop" style="display:flex;gap:20px;list-style:none;margin:0;padding:0;flex:1;">
        <li><a href="${homeHref}" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;font-weight:700;">Home</a></li>
        <li><a href="#content" style="color:#fff;text-decoration:none;font-size:13px;font-weight:900;text-decoration:underline;text-underline-offset:3px;">Menu</a></li>
      </ul>
      <a href="${homeHref}" class="brand-name" style="font-family:var(--font-display);font-size:18px;font-weight:900;color:#fff;text-decoration:none;flex:1;text-align:center;">${esc(businessName)}</a>
      <div style="display:flex;gap:20px;align-items:center;flex:1;justify-content:flex-end;">
        <a href="${galleryHref}" class="nav-links-desktop" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;font-weight:700;">Gallery</a>
        <a href="${waUrl}" target="_blank" class="nav-cta" style="background:#fff;color:${primaryColor};padding:8px 18px;border-radius:999px;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;">${esc(ctaText)}</a>
      </div>
    </div>
  </nav>`;
}

function getFooterHTML(businessName: string, waUrl: string, telLink: string, phone: string, tokens: any, category?: string): string {
  // Category-aware WhatsApp CTA text
  const cat = (category || "").toLowerCase();
  const waCta = /cafe|coffee|restaurant|dining|food|pizza|bar|bakery|dhaba|biryani/.test(cat) ? "Order on WhatsApp"
    : /hotel|resort|lodge|homestay/.test(cat) ? "Book on WhatsApp"
    : /clinic|doctor|dental|hospital|pharmacy|eye/.test(cat) ? "Contact on WhatsApp"
    : /gym|fitness|yoga|crossfit/.test(cat) ? "Join on WhatsApp"
    : /salon|spa|beauty|parlour|grooming/.test(cat) ? "Book Appointment"
    : "Chat on WhatsApp";

  return `
  <footer style="background:${tokens.darkColor};padding:48px 24px 32px;">
    <div style="max-width:1200px;margin:0 auto;display:flex;flex-wrap:wrap;gap:32px;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-family:var(--font-display);font-size:22px;font-weight:900;color:#fff;margin-bottom:8px;">${esc(businessName)}</div>
        <a href="${waUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none;margin-top:12px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          ${waCta}
        </a>
      </div>
      <div style="color:rgba(255,255,255,0.5);font-size:12px;align-self:flex-end;">
        © ${new Date().getFullYear()} ${esc(businessName)}. All rights reserved.
      </div>
    </div>
  </footer>`;
}

function getPageShell(title: string, spec: any, content: string, waUrl: string, telLink: string): string {
  const { tokens, businessName, phone } = spec;
  const layoutVariant = (tokens as any).layoutVariant || "A";
  const isFood = /cafe|coffee|restaurant|dining|food|pizza|bar|bakery|dhaba/i.test(spec.category || "");
  const ctaText = isFood ? "Order Now →" : "Book Now →";
  const gFonts = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(tokens.displayFont)}:wght@700;800;900&family=${encodeURIComponent(tokens.bodyFont)}:wght@400;500;600;700&display=swap`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — ${esc(businessName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${gFonts}" rel="stylesheet">
  <style>
    :root {
      --color-primary: ${tokens.primaryColor};
      --color-dark: ${tokens.darkColor};
      --color-canvas: ${tokens.canvasColor};
      --color-surface: ${tokens.surfaceColor};
      --font-display: '${tokens.displayFont}', Georgia, serif;
      --font-body: '${tokens.bodyFont}', system-ui, sans-serif;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; padding: 0; font-family: var(--font-body); background: ${tokens.canvasColor}; color: ${tokens.darkColor}; overflow-x: hidden; }
    img { max-width: 100%; display: block; }
    a { color: inherit; }

    @media (max-width: 768px) {
      .site-nav-inner { padding: 12px 16px !important; }
      .nav-links-desktop { display: none !important; }
      .brand-name { font-size: 18px !important; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nav-cta { padding: 8px 14px !important; font-size: 12px !important; }
    }
  </style>
</head>
<body>
${getNavHTML(businessName, waUrl, tokens, layoutVariant, ctaText)}
${content}
${getFooterHTML(businessName, waUrl, telLink, phone || "", tokens, spec.category)}
</body>
</html>`;
}

// ── Page Builders ─────────────────────────────────────────────────────────────

/** Menu page — for food businesses (cafe, restaurant, pizza, etc.) */
function buildMenuContent(spec: any, waUrl: string): string {
  const { tokens, businessName, city, category } = spec;
  const photos = (spec.lead?.photoUrls ?? []).slice(0, 12);
  const subCat = spec.strategy?.subCategory?.value || "";

  // Menu categories by business type
  const isBengali = subCat === "bengali_heritage_restaurant";
  const isPizza   = subCat === "pizzeria" || /pizza/i.test(category);
  const isCafe    = subCat === "specialty_cafe" || /cafe|coffee/i.test(category);

  const categories = isBengali
    ? ["Rice & Polao", "Meat Curries", "Fish Dishes", "Dal & Vegetables", "Sweets & Desserts"]
    : isPizza
    ? ["Signature Pizzas", "Pasta & Sides", "Appetizers", "Beverages", "Desserts"]
    : isCafe
    ? ["All-Day Breakfast", "Beverages & Coffee", "Snacks & Sandwiches", "Desserts & Cakes", "Specials"]
    : ["Starters & Appetizers", "Main Course", "Breads & Rice", "Beverages", "Desserts"];

  const itemsByCategory: Record<string, Array<{ name: string; desc: string; price: string; photo?: string }>> = {};
  categories.forEach((cat, ci) => {
    itemsByCategory[cat] = Array.from({ length: 4 }, (_, i) => ({
      name: isBengali
        ? [["Mutton Polao", "Chicken Kosha", "Fish Curry", "Dal Makhani"], ["Beef Curry", "Mutton Rezala", "Prawn Malai", "Egg Curry"], ["Rohu Fish Fry", "Hilsa Bhapa", "Prawn Bhuna", "Catfish Curry"], ["Cholar Dal", "Aloo Posto", "Mixed Veg", "Shukto"], ["Mishti Doi", "Rasgolla", "Chomchom", "Sandesh"]][ci]?.[i] || `Special Item ${i + 1}`
        : isPizza
        ? [["Margherita Classic", "BBQ Chicken", "Veggie Delight", "Pepperoni Special"], ["Pasta Arrabiata", "Mac & Cheese", "Garlic Bread", "Fries"], ["Bruschetta", "Wings", "Onion Rings", "Nachos"], ["Cold Drink", "Lemonade", "Shake", "Coffee"], ["Brownie", "Ice Cream", "Cheesecake", "Tiramisu"]][ci]?.[i] || `Item ${i + 1}`
        : isCafe
        ? [["Eggs Benedict", "Pancake Stack", "French Toast", "Avocado Toast"], ["Cappuccino", "Cold Brew", "Matcha Latte", "Masala Chai"], ["Club Sandwich", "Grilled Panini", "Veg Wrap", "Quiche"], ["Blueberry Muffin", "Chocolate Cake", "Cheesecake", "Brownie"], ["Chef's Special", "Seasonal Bowl", "Weekend Brunch", "Fusion Platter"]][ci]?.[i] || `Special ${i + 1}`
        : [`Starter ${i + 1}`, `Main ${i + 1}`, `Bread ${i + 1}`, `Drink ${i + 1}`, `Dessert ${i + 1}`][ci] || `Item ${i + 1}`,
      desc: `Freshly prepared with premium ingredients. A house favourite at ${businessName}.`,
      price: `₹${[149, 199, 249, 299, 349, 399][Math.floor(Math.random() * 6)]}`,
      photo: photos[ci * 4 + i] || "",
    }));
  });

  const sectionsHTML = categories.map((cat, ci) => `
  <div id="content" style="margin-bottom:64px;">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;">
      <h2 style="font-family:var(--font-display);font-size:28px;font-weight:800;color:${tokens.darkColor};margin:0;">${esc(cat)}</h2>
      <div style="flex:1;height:2px;background:${tokens.primaryColor}22;"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;">
      ${itemsByCategory[cat].map((item, ii) => `
      <div style="background:${tokens.surfaceColor};border-radius:16px;overflow:hidden;border:1px solid ${tokens.primaryColor}15;transition:transform .25s,box-shadow .25s;" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 16px 40px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
        ${item.photo ? `<div style="height:180px;overflow:hidden;"><img src="${item.photo}" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : `<div style="height:80px;background:linear-gradient(135deg,${tokens.primaryColor}20,${tokens.primaryColor}40);display:flex;align-items:center;justify-content:center;font-size:32px;">🍽️</div>`}
        <div style="padding:20px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <h3 style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${tokens.darkColor};margin:0;line-height:1.3;">${esc(item.name)}</h3>
            <span style="background:${tokens.primaryColor};color:#fff;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;white-space:nowrap;flex-shrink:0;">${item.price}</span>
          </div>
          <p style="font-size:13px;color:${tokens.darkColor};opacity:0.6;margin:0 0 14px;line-height:1.5;">${esc(item.desc)}</p>
          <a href="${waUrl}" target="_blank" style="font-size:12px;font-weight:700;color:${tokens.primaryColor};text-decoration:none;">Order via WhatsApp →</a>
        </div>
      </div>`).join("")}
    </div>
  </div>`).join("");

  return `
  <!-- PAGE BANNER -->
  <section style="background:${tokens.darkColor};padding:64px 24px 48px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 50%,${tokens.primaryColor}30,transparent 60%);"></div>
    <div style="position:relative;z-index:1;max-width:700px;margin:0 auto;">
      <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">FULL MENU</span>
      <h1 style="font-family:var(--font-display);font-size:clamp(32px,5vw,60px);font-weight:900;color:#fff;margin:0 0 16px;line-height:1.1;">Our Menu</h1>
      <p style="color:rgba(255,255,255,0.65);font-size:16px;margin:0 0 28px;">Everything made fresh daily at ${esc(businessName)}, ${esc(city.split(",")[0])}</p>
      <a href="${waUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;">
        🛒 Order on WhatsApp
      </a>
    </div>
  </section>

  <!-- MENU CONTENT -->
  <section style="padding:64px 24px;">
    <div style="max-width:1200px;margin:0 auto;">
      ${sectionsHTML}
    </div>
  </section>`;
}

/** Gallery page — for all businesses */
function buildGalleryContent(spec: any): string {
  const { tokens, businessName, city, category } = spec;
  const scrapedPhotos = spec.lead?.photoUrls ?? [];
  const galleryDefaults = getCategoryGalleryPhotos(category);
  const allPhotos = [...scrapedPhotos, ...galleryDefaults].slice(0, 16);
  while (allPhotos.length < 8) allPhotos.push(galleryDefaults[0] || "");

  const h = businessName.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
  const galleryTitles = ["Our Visual Story", "Behind the Scenes", "Captured Moments", "Our World in Photos"];
  const galleryTitle = galleryTitles[h % galleryTitles.length];

  return `
  <!-- PAGE BANNER -->
  <section style="background:${tokens.darkColor};padding:64px 24px 48px;text-align:center;">
    <div style="max-width:700px;margin:0 auto;">
      <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">GALLERY</span>
      <h1 style="font-family:var(--font-display);font-size:clamp(32px,5vw,60px);font-weight:900;color:#fff;margin:0 0 12px;">${esc(galleryTitle)}</h1>
      <p style="color:rgba(255,255,255,0.65);font-size:16px;margin:0;">${esc(businessName)} — ${esc(city.split(",")[0])}</p>
    </div>
  </section>

  <!-- MASONRY GALLERY -->
  <section id="gallery" style="padding:64px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1200px;margin:0 auto;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        ${allPhotos.slice(0, 16).map((p: string, i: number) => `
        <div style="border-radius:12px;overflow:hidden;aspect-ratio:${i === 0 ? "16/10" : i === 5 ? "9/16" : "1/1"};${i === 0 ? "grid-column:span 2;grid-row:span 1;" : ""}transition:transform .3s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='none'">
          <img src="${p}" alt="${esc(businessName)} photo ${i + 1}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.style.background='${tokens.primaryColor}20';this.style.display='none'">
        </div>`).join("")}
      </div>

      <!-- Second gallery row with different layout -->
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        ${allPhotos.slice(8, 14).map((p: string, i: number) => `
        <div style="border-radius:12px;overflow:hidden;aspect-ratio:4/3;transition:transform .3s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='none'">
          <img src="${p}" alt="${esc(businessName)} ${i + 9}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.style.background='${tokens.primaryColor}15';this.style.display='none'">
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

/** Services page — for salons, clinics, gyms, professionals, home services */
function buildServicesContent(spec: any, waUrl: string): string {
  const { tokens, businessName, city, category } = spec;
  const subCat = spec.strategy?.subCategory?.value || "";

  const isSalon    = /salon|spa|beauty|hair/i.test(category) || /salon|spa/.test(subCat);
  const isGym      = /gym|fitness|yoga|crossfit/i.test(category) || /gym|yoga|crossfit/.test(subCat);
  const isMed      = /clinic|doctor|dental|hospital|pharmacy|eye/i.test(category) || /clinic|dental|medical|ayurvedic/.test(subCat);
  const isCoach    = /coaching|school|tutor/i.test(category) || /coaching/.test(subCat);
  const isPro      = /lawyer|ca|accountant|photographer/i.test(category);
  const isBanquets = /banquet|catering|party|event|celebration|rooftop|private dining/i.test(category) || /cafe|coffee|restaurant|dining|food|bistro/i.test(category);
  const isHotel    = /hotel|resort|lodge|homestay|inn|guest house/i.test(category);

  const serviceGroups = isBanquets
    ? [
        { title: "Banquets & Celebrations", icon: "🎉", items: [
          { name: "Private Dining Hall", price: "Custom Quote", desc: "Dedicated celebration space for birthdays, anniversaries, and family get-togethers." },
          { name: "Corporate Gathering Package", price: "Custom Quote", desc: "AV-equipped event space with curated refreshments and high-speed Wi-Fi." },
          { name: "Banquet Hall Rental", price: "Custom Quote", desc: "Spacious venue setup with custom decor, stage, and audio management." },
          { name: "Cocktail & Mocktail Counter", price: "Custom Quote", desc: "Dedicated mixologist bar counter for your private party." },
        ]},
        { title: "Catering & Live Counters", icon: "🍽️", items: [
          { name: "Full Buffet Catering", price: "₹450+/plate", desc: "Multi-course feast prepared fresh with full staff serving." },
          { name: "Live Street Food Counters", price: "₹250+/plate", desc: "Interactive live cooking stations for chaat, pasta, or grills." },
          { name: "High Tea & Hi-Snacks", price: "₹200+/person", desc: "Assorted savouries, signature bakery treats, tea, and artisanal coffee." },
          { name: "Custom Chef's Tasting Menu", price: "Custom Quote", desc: "Personalized curated menu crafted specifically for your guest list." },
        ]},
      ]
    : isHotel
    ? [
        { title: "Dining & Bar", icon: "🍽️", items: [
          { name: "Multi-Cuisine Restaurant", price: "A La Carte", desc: "Fine dining featuring regional specialties, continental dishes, and fresh mocktails." },
          { name: "Complimentary Breakfast Buffet", price: "Included / ₹350", desc: "Lavish spread of hot dishes, continental pastries, seasonal fruits, and fresh brews." },
          { name: "24/7 In-Room Dining", price: "A La Carte", desc: "Fresh hot meals and beverages delivered directly to your room anytime." },
          { name: "Rooftop Lounge & Bar", price: "A La Carte", desc: "Scenic city views paired with signature cocktails and evening grills." },
        ]},
        { title: "Guest Amenities & Wellness", icon: "✨", items: [
          { name: "Swimming Pool & Deck", price: "Guest Access", desc: "Temperature-controlled pool with sun loungers and towel service." },
          { name: "Spa & Ayurvedic Wellness", price: "₹1500+", desc: "Rejuvenating therapies, deep-tissue massages, and holistic wellness rituals." },
          { name: "Fitness Center", price: "Guest Access", desc: "Modern cardio and strength equipment open early to late." },
          { name: "Airport Transfer & Concierge", price: "On Request", desc: "Reliable chauffeur transfers and personalized local sightseeing assistance." },
        ]},
      ]
    : isSalon
    ? [
        { title: "Hair Services", icon: "✂️", items: [
          { name: "Haircut & Styling", price: "₹300+", desc: "Expert cuts tailored to your face shape and style preference." },
          { name: "Hair Colour", price: "₹800+", desc: "Premium global & fashion shades with professional application." },
          { name: "Keratin Treatment", price: "₹2500+", desc: "Smooth, frizz-free hair for up to 6 months." },
          { name: "Hair Spa", price: "₹600+", desc: "Deep conditioning treatment for lustrous, healthy hair." },
        ]},
        { title: "Skin & Face", icon: "✨", items: [
          { name: "Facial (Classic)", price: "₹700+", desc: "Deep cleansing and hydration for radiant skin." },
          { name: "Bridal Glow Facial", price: "₹1500+", desc: "Intensive brightening treatment for special occasions." },
          { name: "Cleanup", price: "₹350+", desc: "Quick refresh treatment for clean, clear skin." },
          { name: "Threading & Waxing", price: "₹100+", desc: "Precise shaping and smooth finish." },
        ]},
        { title: "Nail & Body", icon: "💅", items: [
          { name: "Manicure", price: "₹350+", desc: "Complete nail care for beautiful hands." },
          { name: "Pedicure", price: "₹450+", desc: "Relaxing foot treatment and nail finish." },
          { name: "Nail Art", price: "₹200+", desc: "Creative designs by our nail artists." },
          { name: "Body Massage", price: "₹1200+", desc: "Relaxing full-body massage therapy." },
        ]},
      ]
    : isGym
    ? [
        { title: "Memberships", icon: "💪", items: [
          { name: "Monthly Plan", price: "₹999/mo", desc: "Full access to all equipment and group classes." },
          { name: "Quarterly Plan", price: "₹2499/q", desc: "3 months access with 15% savings." },
          { name: "Annual Plan", price: "₹7999/yr", desc: "Best value — full year access with PT sessions." },
          { name: "Day Pass", price: "₹150/day", desc: "Single-day full access pass." },
        ]},
        { title: "Training Programs", icon: "🏋️", items: [
          { name: "Personal Training", price: "₹500/session", desc: "1-on-1 coaching with certified trainers." },
          { name: "Group Classes", price: "Included", desc: "Zumba, Yoga, HIIT, and more — daily schedule." },
          { name: "Nutrition Coaching", price: "₹1500/mo", desc: "Personalized diet plans and tracking." },
          { name: "Strength Program", price: "₹3000/mo", desc: "Progressive overload program for muscle gain." },
        ]},
      ]
    : isMed
    ? [
        { title: "Consultations", icon: "🩺", items: [
          { name: "General Consultation", price: "₹300", desc: "Comprehensive health assessment and advice." },
          { name: "Follow-up Visit", price: "₹150", desc: "Progress review and treatment adjustment." },
          { name: "Emergency Consultation", price: "₹500", desc: "Urgent care with priority scheduling." },
          { name: "Online Consultation", price: "₹200", desc: "Video or call consultation from home." },
        ]},
        { title: "Specialized Services", icon: "⚕️", items: [
          { name: "Diagnostic Tests", price: "Varies", desc: "Full range of lab and imaging diagnostics." },
          { name: "Preventive Checkup", price: "₹1500", desc: "Comprehensive health screening package." },
          { name: "Minor Procedures", price: "Varies", desc: "In-clinic minor surgical procedures." },
          { name: "Health Certificates", price: "₹200", desc: "Fitness and medical certificates." },
        ]},
      ]
    : isCoach
    ? [
        { title: "Courses Offered", icon: "📚", items: [
          { name: "Foundation Course", price: "₹2000/mo", desc: "Core concepts for beginners and starters." },
          { name: "Advanced Batch", price: "₹3500/mo", desc: "In-depth preparation for competitive exams." },
          { name: "Crash Course", price: "₹5000", desc: "Intensive revision for upcoming exams." },
          { name: "Online Classes", price: "₹1500/mo", desc: "Live interactive sessions from home." },
        ]},
      ]
    : isPro
    ? [
        { title: "Services", icon: "💼", items: [
          { name: "Initial Consultation", price: "Free", desc: "30-minute consultation to understand your needs." },
          { name: "Documentation", price: "Varies", desc: "Preparation and review of all documents." },
          { name: "Advisory Services", price: "₹500/hr", desc: "Expert advice on your specific situation." },
          { name: "Representation", price: "Varies", desc: "Full representation in meetings and proceedings." },
        ]},
      ]
    : [
        { title: "Our Services", icon: "⚙️", items: [
          { name: "Standard Service", price: "₹500+", desc: "Professional service tailored to your needs." },
          { name: "Premium Package", price: "₹1200+", desc: "Comprehensive solution with priority support." },
          { name: "Express Service", price: "₹800+", desc: "Fast turnaround for urgent requirements." },
          { name: "Consultation", price: "Free", desc: "Free initial assessment of your requirements." },
        ]},
      ];

  const bookText = isMed ? "Book Appointment" : isGym ? "Join Now" : isBanquets ? "Enquire Now" : isHotel ? "Reserve Now" : "Book Now";

  return `
  <!-- PAGE BANNER -->
  <section style="background:${tokens.darkColor};padding:64px 24px 48px;text-align:center;">
    <div style="max-width:700px;margin:0 auto;">
      <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">SERVICES & PRICING</span>
      <h1 style="font-family:var(--font-display);font-size:clamp(32px,5vw,60px);font-weight:900;color:#fff;margin:0 0 12px;">What We Offer</h1>
      <p style="color:rgba(255,255,255,0.65);font-size:16px;margin:0;">${esc(businessName)} — ${esc(city.split(",")[0])}</p>
    </div>
  </section>

  <!-- SERVICES CONTENT -->
  <section id="content" style="padding:64px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1100px;margin:0 auto;space-y:48px;">
      ${serviceGroups.map(group => `
      <div style="margin-bottom:56px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
          <span style="font-size:28px;">${group.icon}</span>
          <h2 style="font-family:var(--font-display);font-size:26px;font-weight:800;color:${tokens.darkColor};margin:0;">${esc(group.title)}</h2>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px;">
          ${group.items.map(item => `
          <div style="background:${tokens.surfaceColor};border-radius:16px;padding:24px;border:1px solid ${tokens.primaryColor}18;transition:all .25s;" onmouseover="this.style.borderColor='${tokens.primaryColor}';this.style.transform='translateY(-3px)'" onmouseout="this.style.borderColor='${tokens.primaryColor}18';this.style.transform='none'">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
              <h3 style="font-size:15px;font-weight:700;color:${tokens.darkColor};margin:0;line-height:1.3;">${esc(item.name)}</h3>
              <span style="background:${tokens.primaryColor}18;color:${tokens.primaryColor};padding:4px 10px;border-radius:999px;font-size:13px;font-weight:700;white-space:nowrap;flex-shrink:0;margin-left:8px;">${esc(item.price)}</span>
            </div>
            <p style="font-size:13px;color:${tokens.darkColor};opacity:0.6;margin:0 0 16px;line-height:1.5;">${esc(item.desc)}</p>
            <a href="${waUrl}" target="_blank" style="font-size:12px;font-weight:700;color:${tokens.primaryColor};text-decoration:none;">${bookText} →</a>
          </div>`).join("")}
        </div>
      </div>`).join("")}

      <!-- Booking CTA -->
      <div style="background:${tokens.primaryColor};border-radius:24px;padding:48px;text-align:center;">
        <h2 style="font-family:var(--font-display);font-size:32px;font-weight:900;color:#fff;margin:0 0 12px;">Ready to Get Started?</h2>
        <p style="color:rgba(255,255,255,0.75);font-size:16px;margin:0 0 28px;">Message us on WhatsApp for instant booking and pricing.</p>
        <a href="${waUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#fff;color:${tokens.primaryColor};padding:16px 40px;border-radius:999px;font-size:16px;font-weight:800;text-decoration:none;">
          💬 ${bookText} on WhatsApp
        </a>
      </div>
    </div>
  </section>`;
}

/** Rooms page — for hotels */
function buildRoomsContent(spec: any, waUrl: string): string {
  const { tokens, businessName, city } = spec;
  const photos = (spec.lead?.photoUrls ?? []).slice(0, 8);
  const galleryDefaults = getCategoryGalleryPhotos(spec.category);
  const allPhotos = [...photos, ...galleryDefaults].slice(0, 8);

  const rooms = [
    { name: "Deluxe Room", capacity: "2 Adults", price: "₹2,499/night", amenities: ["AC", "Free WiFi", "TV", "En-suite Bath"], photo: allPhotos[0] },
    { name: "Superior Room", capacity: "2 Adults + 1 Child", price: "₹3,499/night", amenities: ["AC", "Free WiFi", "TV", "En-suite Bath", "City View"], photo: allPhotos[1] },
    { name: "Suite", capacity: "2 Adults", price: "₹5,999/night", amenities: ["AC", "Free WiFi", "Smart TV", "Jacuzzi", "Panoramic View", "Mini Bar"], photo: allPhotos[2] },
    { name: "Family Room", capacity: "4 Adults", price: "₹4,999/night", amenities: ["AC", "Free WiFi", "TV", "Extra Beds", "Kitchenette"], photo: allPhotos[3] },
  ];

  return `
  <section style="background:${tokens.darkColor};padding:64px 24px 48px;text-align:center;">
    <div style="max-width:700px;margin:0 auto;">
      <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">ACCOMMODATIONS</span>
      <h1 style="font-family:var(--font-display);font-size:clamp(32px,5vw,60px);font-weight:900;color:#fff;margin:0 0 12px;">Our Rooms & Suites</h1>
      <p style="color:rgba(255,255,255,0.65);font-size:16px;margin:0;">${esc(businessName)}, ${esc(city.split(",")[0])}</p>
    </div>
  </section>
  <section id="content" style="padding:64px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1100px;margin:0 auto;">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:28px;">
        ${rooms.map(room => `
        <div style="background:${tokens.surfaceColor};border-radius:20px;overflow:hidden;border:1px solid ${tokens.primaryColor}15;transition:transform .25s,box-shadow .25s;" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 20px 48px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'">
          ${room.photo ? `<div style="height:240px;overflow:hidden;"><img src="${room.photo}" alt="${esc(room.name)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.style.background='${tokens.primaryColor}20';this.style.display='none'"></div>` : `<div style="height:240px;background:linear-gradient(135deg,${tokens.primaryColor}30,${tokens.primaryColor}50);display:flex;align-items:center;justify-content:center;font-size:48px;">🛏️</div>`}
          <div style="padding:28px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800;color:${tokens.darkColor};margin:0;">${esc(room.name)}</h2>
              <div style="text-align:right;">
                <div style="font-size:18px;font-weight:800;color:${tokens.primaryColor};">${room.price}</div>
                <div style="font-size:11px;color:${tokens.darkColor};opacity:0.5;">${room.capacity}</div>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
              ${room.amenities.map(a => `<span style="background:${tokens.primaryColor}15;color:${tokens.primaryColor};padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">${a}</span>`).join("")}
            </div>
            <a href="${waUrl}" target="_blank" style="display:inline-block;background:${tokens.primaryColor};color:#fff;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none;">Book This Room →</a>
          </div>
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

/** Programs page — gyms and fitness (alias Services) */
function buildProgramsContent(spec: any, waUrl: string): string {
  return buildServicesContent(spec, waUrl);
}

/** Portfolio page — photographers, agencies, professionals */
function buildPortfolioContent(spec: any): string {
  const { tokens, businessName, city, category } = spec;
  const photos = (spec.lead?.photoUrls ?? []).slice(0, 12);
  const galleryDefaults = getCategoryGalleryPhotos(category);
  const allPhotos = [...photos, ...galleryDefaults].slice(0, 12);

  return buildGalleryContent({ ...spec, lead: { ...spec.lead, photoUrls: allPhotos } });
}

/** Products page — retail businesses */
function buildProductsContent(spec: any, waUrl: string): string {
  const { tokens, businessName, city, category } = spec;
  const photos = (spec.lead?.photoUrls ?? []).slice(0, 8);
  const isClothing  = /clothing|fashion|boutique/i.test(category);
  const isElectronics = /electronic|mobile|phone/i.test(category);
  const isJewellery = /jewellery|jewelry|gold/i.test(category);
  const isMobile    = /mobile|phone|smartphone/i.test(category);

  const categories = isClothing
    ? ["Men's Collection", "Women's Collection", "Kids & Infants", "Accessories"]
    : isElectronics || isMobile
    ? ["Smartphones", "Accessories", "Tablets & Laptops", "Smart Gadgets"]
    : isJewellery
    ? ["Gold Jewellery", "Silver Collection", "Bridal Sets", "Daily Wear"]
    : ["Featured Products", "New Arrivals", "Best Sellers", "Offers"];

  return `
  <section style="background:${tokens.darkColor};padding:64px 24px 48px;text-align:center;">
    <div style="max-width:700px;margin:0 auto;">
      <span style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${tokens.primaryColor};display:block;margin-bottom:12px;">OUR COLLECTION</span>
      <h1 style="font-family:var(--font-display);font-size:clamp(32px,5vw,60px);font-weight:900;color:#fff;margin:0 0 12px;">Our Products</h1>
      <p style="color:rgba(255,255,255,0.65);font-size:16px;margin:0;">${esc(businessName)}, ${esc(city.split(",")[0])}</p>
    </div>
  </section>
  <section id="content" style="padding:64px 24px;background:${tokens.canvasColor};">
    <div style="max-width:1200px;margin:0 auto;">
      ${categories.map((cat, ci) => `
      <div style="margin-bottom:56px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;">
          <h2 style="font-family:var(--font-display);font-size:24px;font-weight:800;color:${tokens.darkColor};margin:0;">${esc(cat)}</h2>
          <div style="flex:1;height:2px;background:${tokens.primaryColor}20;"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;">
          ${Array.from({ length: 4 }, (_, ii) => `
          <div style="background:${tokens.surfaceColor};border-radius:16px;overflow:hidden;border:1px solid ${tokens.primaryColor}15;transition:transform .25s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='none'">
            ${photos[ci * 4 + ii] ? `<div style="height:200px;overflow:hidden;"><img src="${photos[ci * 4 + ii]}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : `<div style="height:160px;background:${tokens.primaryColor}15;display:flex;align-items:center;justify-content:center;font-size:36px;">🛍️</div>`}
            <div style="padding:16px;">
              <div style="font-weight:700;color:${tokens.darkColor};margin-bottom:4px;">Product ${ci * 4 + ii + 1}</div>
              <div style="font-size:14px;color:${tokens.primaryColor};font-weight:700;margin-bottom:12px;">Ask for Price →</div>
              <a href="${waUrl}" target="_blank" style="font-size:12px;font-weight:700;color:${tokens.primaryColor};text-decoration:none;">Enquire on WhatsApp</a>
            </div>
          </div>`).join("")}
        </div>
      </div>`).join("")}
    </div>
  </section>`;
}

// ── Master Multi-Page Builder ─────────────────────────────────────────────────

export type PageType = "home" | "menu" | "gallery" | "services" | "programs" | "rooms" | "portfolio" | "products" | "dining" | "facilities" | "treatments" | "events";

export interface MultiPageResult {
  ok: boolean;
  html?: string;
  pageType: PageType;
  error?: string;
}

export async function buildMultiPageHTML(
  lead: RankedLead,
  pageType: PageType,
  strategy?: BusinessStrategy
): Promise<MultiPageResult> {
  try {
    if (pageType === "home") {
      return { ok: false, pageType, error: "Use buildTemplateHTML for home page" };
    }

    const bizStrategy = strategy || buildDeterministicBusinessStrategy(lead);
    const spec = buildWebsiteSpec(lead, "ai-decides", bizStrategy);
    (spec as any).lead = lead;
    (spec as any).strategy = bizStrategy;

    const { businessName, phone } = spec;
    const waUrl = spec.whatsapp || waLink(phone || "", businessName);
    const tel = cleanPhone(phone);
    const telLink = tel ? `tel:${tel}` : "#";

    let content = "";
    let title = "";

    switch (pageType) {
      case "menu":
      case "dining":
        content = buildMenuContent(spec, waUrl);
        title = "Our Menu";
        break;
      case "gallery":
        content = buildGalleryContent(spec);
        title = "Gallery";
        break;
      case "services":
      case "facilities":
      case "treatments":
      case "events":
        content = buildServicesContent(spec, waUrl);
        title = "Services & Pricing";
        break;
      case "programs":
        content = buildProgramsContent(spec, waUrl);
        title = "Programs & Membership";
        break;
      case "rooms":
        content = buildRoomsContent(spec, waUrl);
        title = "Rooms & Suites";
        break;
      case "portfolio":
        content = buildPortfolioContent(spec);
        title = "Portfolio";
        break;
      case "products":
        content = buildProductsContent(spec, waUrl);
        title = "Our Products";
        break;
      default:
        return { ok: false, pageType, error: `Unknown page type: ${pageType}` };
    }

    const html = getPageShell(title, spec, content, waUrl, telLink);
    return { ok: true, html, pageType };

  } catch (err) {
    return { ok: false, pageType, error: (err as Error).message };
  }
}
