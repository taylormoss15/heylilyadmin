import { complianceBadge, cookieBanner, localBusinessJsonLd } from "@/lib/site/renderer";
import type { BusinessData } from "@/lib/site/ir";

// Takes the AI's bespoke HTML and guarantees the compliance layer is present
// no matter what the model produced: a valid <html lang>, LocalBusiness
// JSON-LD, the accessibility badge, and (optionally) the cookie banner. Each
// piece is injected only if missing, so it's idempotent and never doubles up.

export interface FinalizeOptions {
  clientId: string;
  business: BusinessData;
  adminBaseUrl?: string;
  showCookieBanner?: boolean;
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

  // LocalBusiness JSON-LD (AEO baseline) — only if the page has no ld+json.
  if (!/application\/ld\+json/i.test(html)) {
    const ld = localBusinessJsonLd(opts.business);
    html = insertBefore(html, /<\/head>/i, ld) ?? html.replace(/<body\b[^>]*>/i, (m) => `${m}\n${ld}`);
  }

  // Cookie banner (optional) — only if not already present.
  const footerBits: string[] = [];
  if (opts.showCookieBanner && !/id="heylily-cookie"/.test(html)) {
    footerBits.push(cookieBanner());
  }
  // Accessibility badge — always, unless already present.
  if (!/id="heylily-a11y-badge"|widget\/accessibility-badge\.js/.test(html)) {
    footerBits.push(complianceBadge(opts.clientId, adminBaseUrl));
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
