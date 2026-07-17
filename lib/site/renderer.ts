import type { BusinessData, PageIR, Section, Theme } from "@/lib/site/ir";

// Deterministic renderer: (page IR + site theme + business data) → one
// self-contained HTML file. This is the ONLY place markup is produced, so
// it is where every compliance guarantee lives:
//   - semantic HTML5 landmarks + exactly one <h1>
//   - alt text on every image (also enforced upstream in the IR schema)
//   - JSON-LD (LocalBusiness, FAQPage) from business data
//   - mobile-first inline critical CSS with responsive breakpoints
//   - footer compliance badge + optional cookie banner
//   - inlined CSS/JS so the output is a single file that loads fast and
//     fits GHL's Custom HTML Pages constraints
// Nothing here reaches out to a network at render time.

export interface RenderOptions {
  clientId: string;
  adminBaseUrl?: string; // where the compliance badge widget is served from
  showCookieBanner?: boolean;
}

export interface RenderResult {
  html: string;
  warnings: string[];
}

// ---- HTML escaping (all interpolated content is escaped) ----

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Attribute values reuse esc(); URLs get a scheme check so a stored value
// can't smuggle in javascript: on a link/src.
function safeUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (/^\s*javascript:/i.test(trimmed)) return "#";
  return esc(trimmed);
}

const FONT_STACKS: Record<Theme["fonts"], { heading: string; body: string }> = {
  modern: {
    heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  classic: {
    heading: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  editorial: {
    heading: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    body: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  },
};

function css(theme: Theme): string {
  const p = theme.palette;
  const fonts = FONT_STACKS[theme.fonts] ?? FONT_STACKS.modern;
  const r = theme.radius;
  return `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:${fonts.body};color:${esc(p.ink)};background:${esc(p.ground)};line-height:1.6;font-size:17px}
h1,h2,h3{font-family:${fonts.heading};line-height:1.15;letter-spacing:-.01em}
img{max-width:100%;height:auto;display:block}
a{color:${esc(p.accent)}}
:focus-visible{outline:3px solid ${esc(p.accent)};outline-offset:2px}
.wrap{width:100%;max-width:1080px;margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-9999px;top:auto}
.skip:focus{left:8px;top:8px;background:${esc(p.paper)};padding:8px 14px;border-radius:${r}px;z-index:100}
.site-header{border-bottom:1px solid rgba(0,0,0,.08);background:${esc(p.ground)}}
.site-header .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:66px}
.brand{font-family:${fonts.heading};font-weight:700;font-size:20px;color:${esc(p.primary)};text-decoration:none}
.nav{display:flex;gap:22px}
.nav a{text-decoration:none;color:${esc(p.muted)};font-size:15px}
.nav a:hover{color:${esc(p.ink)}}
.nav-toggle{display:none;background:none;border:1px solid rgba(0,0,0,.15);border-radius:8px;padding:8px 10px;font-size:15px;cursor:pointer;color:${esc(p.ink)}}
main section{padding:64px 0}
main section:nth-child(even){background:${esc(p.paper)}}
.hero{padding:88px 0}
.hero h1{font-size:clamp(30px,6vw,52px);margin:0 0 16px;max-width:16ch}
.hero p.sub{font-size:clamp(17px,2.4vw,21px);color:${esc(p.muted)};margin:0 0 28px;max-width:52ch}
.hero-media{margin-top:32px}
.hero-media img{border-radius:${r}px;width:100%;object-fit:cover}
h2.section-h{font-size:clamp(24px,4vw,34px);margin:0 0 24px;color:${esc(p.primary)}}
.prose{max-width:64ch;font-size:18px}
.btn{display:inline-block;background:${esc(p.accent)};color:#fff;text-decoration:none;padding:13px 24px;border-radius:${r}px;font-weight:600;font-size:16px}
.btn:hover{filter:brightness(.94)}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.card{background:${esc(p.ground)};border:1px solid rgba(0,0,0,.08);border-radius:${r}px;padding:22px}
.card h3{margin:0 0 8px;font-size:19px;color:${esc(p.primary)}}
.card p{margin:0;color:${esc(p.muted)}}
.gallery{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.gallery img{border-radius:${r}px;width:100%;aspect-ratio:4/3;object-fit:cover}
.faq details{border-bottom:1px solid rgba(0,0,0,.1);padding:16px 0}
.faq summary{font-weight:600;cursor:pointer;font-size:18px;color:${esc(p.primary)}}
.faq details p{margin:12px 0 0;color:${esc(p.muted)}}
.quote{background:${esc(p.ground)};border-left:4px solid ${esc(p.accent)};border-radius:${r}px;padding:20px 22px}
.quote blockquote{margin:0;font-size:18px}
.quote cite{display:block;margin-top:10px;color:${esc(p.muted)};font-style:normal;font-size:15px}
form.contact{max-width:520px;display:flex;flex-direction:column;gap:14px}
form.contact label{font-weight:600;font-size:15px;display:flex;flex-direction:column;gap:6px}
form.contact input,form.contact textarea{font:inherit;padding:11px 13px;border:1px solid rgba(0,0,0,.2);border-radius:${r}px;background:${esc(p.ground)};color:${esc(p.ink)}}
.site-footer{background:${esc(p.primary)};color:#fff;padding:44px 0}
.site-footer a{color:#fff}
.site-footer .cols{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.site-footer h3{font-size:16px;margin:0 0 10px}
.site-footer p,.site-footer li{color:rgba(255,255,255,.82);margin:0 0 6px;list-style:none}
.site-footer ul{padding:0;margin:0}
.cookie{position:fixed;left:0;right:0;bottom:0;background:${esc(p.primary)};color:#fff;padding:14px 20px;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;z-index:90}
.cookie button{background:${esc(p.accent)};color:#fff;border:none;border-radius:${r}px;padding:9px 18px;font:inherit;font-weight:600;cursor:pointer}
@media (max-width:720px){
  .nav{display:none}
  .nav.open{display:flex;position:absolute;top:66px;left:0;right:0;flex-direction:column;background:${esc(p.ground)};padding:16px 20px;border-bottom:1px solid rgba(0,0,0,.1)}
  .nav-toggle{display:inline-block}
  .site-header .wrap{position:relative}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();
}

// ---- Section rendering. Only the hero emits <h1>; everything else <h2>. ----

// Sections that appear in the nav get a stable id so anchor links resolve.
const NAV_ANCHORS: Partial<Record<Section["type"], string>> = {
  about: "about",
  services: "services",
  contact: "contact",
};

function renderSection(section: Section, isFirstHeading: boolean): string {
  const anchorId = NAV_ANCHORS[section.type];
  const anchor = anchorId ? ` id="${anchorId}"` : "";
  switch (section.type) {
    case "hero":
      return `<section class="hero"${anchor}><div class="wrap">
<h1>${esc(section.heading)}</h1>
${section.subheading ? `<p class="sub">${esc(section.subheading)}</p>` : ""}
${section.ctaLabel && section.ctaHref ? `<a class="btn" href="${safeUrl(section.ctaHref)}">${esc(section.ctaLabel)}</a>` : ""}
${section.image ? `<div class="hero-media"><img src="${safeUrl(section.image.url)}" alt="${esc(section.image.alt)}"></div>` : ""}
</div></section>`;

    case "about":
      return `<section${anchor}><div class="wrap">
${heading(section.heading ?? "About", isFirstHeading)}
<div class="prose">${paragraphs(section.body)}</div>
</div></section>`;

    case "services":
      return `<section${anchor}><div class="wrap">
${heading(section.heading ?? "Services", isFirstHeading)}
<div class="grid">
${section.items
  .map(
    (item) =>
      `<div class="card"><h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ""}</div>`
  )
  .join("\n")}
</div></div></section>`;

    case "gallery":
      return `<section${anchor}><div class="wrap">
${heading(section.heading ?? "Gallery", isFirstHeading)}
<div class="gallery">
${section.images.map((img) => `<img src="${safeUrl(img.url)}" alt="${esc(img.alt)}">`).join("\n")}
</div></div></section>`;

    case "faq":
      return `<section${anchor}><div class="wrap">
${heading(section.heading ?? "FAQ", isFirstHeading)}
<div class="faq">
${section.items
  .map(
    (item) =>
      `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`
  )
  .join("\n")}
</div></div></section>`;

    case "testimonials":
      return `<section${anchor}><div class="wrap">
${heading(section.heading ?? "Testimonials", isFirstHeading)}
<div class="grid">
${section.items
  .map(
    (item) =>
      `<div class="quote"><blockquote>${esc(item.quote)}</blockquote>${item.author ? `<cite>${esc(item.author)}</cite>` : ""}</div>`
  )
  .join("\n")}
</div></div></section>`;

    case "cta":
      return `<section${anchor}><div class="wrap">
${heading(section.heading, isFirstHeading)}
${section.body ? `<p class="prose">${esc(section.body)}</p>` : ""}
<p><a class="btn" href="${safeUrl(section.buttonHref)}">${esc(section.buttonLabel)}</a></p>
</div></section>`;

    case "contact":
      return `<section id="contact"><div class="wrap">
${heading(section.heading ?? "Contact", isFirstHeading)}
${section.body ? `<p class="prose">${esc(section.body)}</p>` : ""}
${
  section.showForm
    ? `<form class="contact" method="post" action="#" aria-label="Contact form">
<label>Name<input type="text" name="name" autocomplete="name" required></label>
<label>Email<input type="email" name="email" autocomplete="email" required></label>
<label>Message<textarea name="message" rows="4" required></textarea></label>
<button class="btn" type="submit">Send message</button>
</form>`
    : ""
}
</div></section>`;
  }
}

function heading(text: string, isFirstHeading: boolean): string {
  // If no hero supplied the h1, the first section heading becomes the h1
  // so the page always has exactly one, in document order.
  const tag = isFirstHeading ? "h1" : "h2";
  const cls = isFirstHeading ? "" : ' class="section-h"';
  return `<${tag}${cls}>${esc(text)}</${tag}>`;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ---- JSON-LD ----

function jsonLd(business: BusinessData, ir: PageIR): string {
  const localBusiness: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
  };
  if (business.tagline) localBusiness.description = business.tagline;
  if (business.phone) localBusiness.telephone = business.phone;
  if (business.email) localBusiness.email = business.email;
  if (business.priceRange) localBusiness.priceRange = business.priceRange;
  if (business.address) {
    localBusiness.address = {
      "@type": "PostalAddress",
      streetAddress: business.address.street,
      addressLocality: business.address.city,
      addressRegion: business.address.region,
      postalCode: business.address.postal,
      addressCountry: business.address.country,
    };
  }

  const blocks = [localBusiness];

  const faq = ir.sections.find((s) => s.type === "faq");
  if (faq && faq.type === "faq") {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    } as never);
  }

  // JSON.stringify output is embedded in a <script type="application/ld+json">;
  // escape "<" to prevent a "</script>" in any field from closing the tag.
  return blocks
    .map(
      (b) =>
        `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, "\\u003c")}</script>`
    )
    .join("\n");
}

// ---- Nav ----

function navLinks(ir: PageIR): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (ir.sections.some((s) => s.type === "about")) links.push({ label: "About", href: "#about" });
  if (ir.sections.some((s) => s.type === "services")) links.push({ label: "Services", href: "#services" });
  if (ir.sections.some((s) => s.type === "contact")) links.push({ label: "Contact", href: "#contact" });
  return links;
}

// ---- The compliance badge (client-facing audit log) ----
// Exported so the custom-HTML finalizer injects the identical badge/cookie
// as the structured renderer.

export function complianceBadge(clientId: string, adminBaseUrl: string): string {
  const base = adminBaseUrl.replace(/\/$/, "");
  return `<script>window.HEYLILY_CLIENT_ID=${JSON.stringify(clientId)};window.HEYLILY_API_BASE=${JSON.stringify(
    base
  )};</script>
<script src="${esc(base)}/widget/accessibility-badge.js" defer></script>`;
}

export function cookieBanner(): string {
  return `<div class="cookie" id="heylily-cookie" role="region" aria-label="Cookie consent" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#1b2430;color:#fff;padding:14px 20px;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;font:14px system-ui,sans-serif">
<span>We use cookies to improve your experience.</span>
<button type="button" onclick="document.getElementById('heylily-cookie').remove()" style="background:#3b6fe0;color:#fff;border:none;border-radius:8px;padding:9px 18px;font:inherit;font-weight:600;cursor:pointer">Accept</button>
</div>`;
}

/** LocalBusiness JSON-LD from business data — used to guarantee the AEO baseline on custom HTML pages. */
export function localBusinessJsonLd(business: BusinessData): string {
  const block: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: business.name,
  };
  if (business.tagline) block.description = business.tagline;
  if (business.phone) block.telephone = business.phone;
  if (business.email) block.email = business.email;
  if (business.priceRange) block.priceRange = business.priceRange;
  if (business.address) {
    block.address = {
      "@type": "PostalAddress",
      streetAddress: business.address.street,
      addressLocality: business.address.city,
      addressRegion: business.address.region,
      postalCode: business.address.postal,
      addressCountry: business.address.country,
    };
  }
  return `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, "\\u003c")}</script>`;
}

// ---- Top-level render ----

export function renderPage(
  ir: PageIR,
  theme: Theme,
  business: BusinessData,
  pageTitle: string,
  options: RenderOptions
): RenderResult {
  const warnings: string[] = [];
  const adminBaseUrl = options.adminBaseUrl || process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";

  const hasHero = ir.sections.some((s) => s.type === "hero");
  let firstHeadingUsed = hasHero; // if there's a hero, its h1 is already the first heading

  const body = ir.sections
    .map((section) => {
      const isFirst = !firstHeadingUsed && section.type !== "hero";
      if (isFirst) firstHeadingUsed = true;
      return renderSection(section, isFirst);
    })
    .join("\n");

  if (!hasHero && !firstHeadingUsed) {
    warnings.push("Page has no hero and no section headings — an <h1> could not be placed.");
  }

  // Warn on any relative asset URLs (GHL requires absolute CDN URLs).
  for (const section of ir.sections) {
    const urls: string[] = [];
    if (section.type === "hero" && section.image) urls.push(section.image.url);
    if (section.type === "gallery") urls.push(...section.images.map((i) => i.url));
    for (const u of urls) {
      if (u && !/^https?:\/\//i.test(u) && !u.startsWith("data:")) {
        warnings.push(`Asset URL is not absolute (GHL requires absolute CDN URLs): ${u}`);
      }
    }
  }

  const nav = navLinks(ir);
  const description = business.tagline || business.about || `${business.name} — official website`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle || business.name)}</title>
<meta name="description" content="${esc(description).slice(0, 300)}">
${jsonLd(business, ir)}
<style>${css(theme)}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="#top">${esc(business.name)}</a>
    ${
      nav.length
        ? `<button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" onclick="var n=document.getElementById('site-nav');var o=n.classList.toggle('open');this.setAttribute('aria-expanded',o)">Menu</button>
    <nav class="nav" id="site-nav" aria-label="Primary">${nav
      .map((l) => `<a href="${safeUrl(l.href)}">${esc(l.label)}</a>`)
      .join("")}</nav>`
        : ""
    }
  </div>
</header>
<main id="main">
<span id="top"></span>
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <h3>${esc(business.name)}</h3>
        ${business.tagline ? `<p>${esc(business.tagline)}</p>` : ""}
      </div>
      ${
        business.phone || business.email || business.address
          ? `<div><h3>Contact</h3>
        ${business.phone ? `<p>${esc(business.phone)}</p>` : ""}
        ${business.email ? `<p>${esc(business.email)}</p>` : ""}
        ${
          business.address
            ? `<p>${esc(
                [business.address.street, business.address.city, business.address.region, business.address.postal]
                  .filter(Boolean)
                  .join(", ")
              )}</p>`
            : ""
        }
      </div>`
          : ""
      }
      ${
        business.hours.length
          ? `<div><h3>Hours</h3><ul>${business.hours
              .map((h) => `<li>${esc(h.label)}: ${esc(h.value)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
    </div>
  </div>
</footer>
${options.showCookieBanner ? cookieBanner() : ""}
${complianceBadge(options.clientId, adminBaseUrl)}
</body>
</html>`;

  return { html, warnings };
}
