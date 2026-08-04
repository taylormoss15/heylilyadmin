import { complianceBadge, contactFormWidget, cookieBanner, faqPageJsonLd, localBusinessJsonLd } from "@/lib/site/renderer";
import type { BusinessData } from "@/lib/site/ir";

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Takes the AI's bespoke HTML and guarantees the compliance layer is present
// no matter what the model produced: a valid <html lang>, LocalBusiness
// JSON-LD, the accessibility badge, and (optionally) the cookie banner. Each
// piece is injected only if missing, so it's idempotent and never doubles up.

export interface FinalizeOptions {
  clientId: string;
  business: BusinessData;
  adminBaseUrl?: string;
  showCookieBanner?: boolean;
  showBadge?: boolean; // default true; false for prospect demos (no client audit log yet)
}

export function finalizeCustomHtml(rawHtml: string, opts: FinalizeOptions): string {
  const adminBaseUrl = opts.adminBaseUrl || process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";
  let html = (rawHtml || "").trim();

  // Ensure a doctype.
  if (!/^<!doctype/i.test(html)) {
    html = `<!DOCTYPE html>\n${html}`;
  }

  // Ensure <html> carries a lang attribute (an axe requirement).
  if (/<html\b(?![^>]*\blang=)[^>]*>/i.test(html)) {
    html = html.replace(/<html\b([^>]*)>/i, '<html$1 lang="en">');
  } else if (!/<html\b/i.test(html)) {
    html = html.replace(/<!DOCTYPE html>/i, '<!DOCTYPE html>\n<html lang="en">') + "\n</html>";
  }

  // ---- AEO head: rich structured data + meta description + Open Graph ----
  const headBits: string[] = [];
  if (!/application\/ld\+json/i.test(html)) {
    headBits.push(localBusinessJsonLd(opts.business));
    const faq = faqPageJsonLd(opts.business.faqs);
    if (faq) headBits.push(faq);
  }
  const desc = opts.business.seoDescription || opts.business.tagline;
  if (desc && !/<meta\s+name=["']description["']/i.test(html)) {
    headBits.push(`<meta name="description" content="${escAttr(desc)}">`);
  }
  if (!/property=["']og:title["']/i.test(html)) {
    const ogTitle = opts.business.seoTitle || opts.business.name;
    headBits.push(`<meta property="og:title" content="${escAttr(ogTitle)}">`);
    headBits.push(`<meta property="og:type" content="website">`);
    if (desc) headBits.push(`<meta property="og:description" content="${escAttr(desc)}">`);
    headBits.push(`<meta name="twitter:card" content="summary_large_image">`);
  }
  if (headBits.length) {
    const block = headBits.join("\n");
    html = insertBefore(html, /<\/head>/i, block) ?? html.replace(/<body\b[^>]*>/i, (m) => `${m}\n${block}`);
  }

  // Cookie banner (optional) — only if not already present.
  const footerBits: string[] = [];
  if (opts.showCookieBanner && !/id="heylily-cookie"/.test(html)) {
    footerBits.push(cookieBanner());
  }
  // Accessibility badge — always, unless suppressed or already present.
  if (opts.showBadge !== false && !/id="heylily-a11y-badge"|widget\/accessibility-badge\.js/.test(html)) {
    footerBits.push(complianceBadge(opts.clientId, adminBaseUrl));
  }
  // Contact-form relay — only if the page actually has a form and isn't a demo
  // (demos suppress the badge/relay). Wires the form to email entries.
  if (opts.showBadge !== false && /<form\b/i.test(html) && !/widget\/contact-forms\.js/.test(html)) {
    footerBits.push(contactFormWidget(opts.clientId, adminBaseUrl));
  }

  if (footerBits.length) {
    const block = footerBits.join("\n");
    const injected = insertBefore(html, /<\/body>/i, block);
    html = injected ?? `${html}\n${block}`;
  }

  return html;
}

function insertBefore(html: string, marker: RegExp, snippet: string): string | null {
  if (!marker.test(html)) return null;
  return html.replace(marker, `${snippet}\n$&`);
}
