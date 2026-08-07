import type { TechSignals } from "@/lib/prospecting/aeo";

// Static (no-browser) extraction of the same on-page signals scanProspect
// gathers live, but read straight from an HTML string. Lets us score the AI
// redesign's "after" Trust Score with the exact same engine as the live
// "before" — so 62 → 92 is a real, apples-to-apples comparison, not a claim.

function attr(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? (m[1] || "").trim() : "";
}

export function analyzeHtmlSignals(html: string, url: string): TechSignals {
  const lower = html.toLowerCase();

  const title = attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s+/g, " ").trim();
  const description =
    attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    attr(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const generator = attr(html, /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i);
  const robots = attr(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const lang = attr(html, /<html[^>]+lang=["']([^"']*)["']/i);

  const has = (re: RegExp) => re.test(html);
  const hasCanonical = has(/<link[^>]+rel=["']canonical["']/i);
  const hasViewport = has(/<meta[^>]+name=["']viewport["']/i);
  const hasFavicon = has(/<link[^>]+rel=["'][^"']*icon[^"']*["']/i);
  const ogTitle = has(/property=["']og:title["']/i);
  const ogImage = has(/property=["']og:image["']/i);
  const twitterCard = has(/name=["']twitter:card["']/i);

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  const headingCount = (html.match(/<h[1-6][\s>]/gi) || []).length;

  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgTotal = imgs.length;
  const imgWithAlt = imgs.filter((t) => /\balt=["'][^"']+["']/i.test(t)).length;

  const jsonLdTypes: string[] = [];
  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const parsed = JSON.parse(body);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const o of arr) {
        const ty = o && o["@type"];
        if (typeof ty === "string") jsonLdTypes.push(ty);
        else if (Array.isArray(ty)) ty.forEach((x) => typeof x === "string" && jsonLdTypes.push(x));
      }
    } catch {
      /* ignore malformed ld+json */
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text ? text.split(" ").filter(Boolean).length : 0;

  const hasAnalytics = /gtag\(|googletagmanager|google-analytics|fbq\(|clarity\.ms|hotjar/i.test(lower);
  const hasWpContent = /\/wp-(content|includes)\//i.test(lower);

  return {
    generator,
    title,
    description,
    hasCanonical,
    hasViewport,
    lang,
    hasFavicon,
    robots,
    ogTitle,
    ogImage,
    twitterCard,
    h1Count,
    headingCount,
    imgTotal,
    imgWithAlt,
    jsonLdTypes,
    words,
    hasAnalytics,
    hasWpContent,
    hosts: [],
    credit: "",
  };
}
