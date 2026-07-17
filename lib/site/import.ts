import { chromium } from "playwright";
import { scanOpenPage } from "@/lib/integrations/accessibility-scanner";
import type { ScanSummary } from "@/lib/integrations/accessibility-scanner";
import { defaultTheme, type BusinessData, type PageIR, type Section } from "@/lib/site/ir";

// Imports an existing (often bad) website: loads it once in a headless
// browser to BOTH scrape its real content/contact details AND run the
// accessibility scanner for its "risk score". The scraped content seeds a
// new editable site the AI then redesigns — and the risk score becomes the
// client's first audit-trail entry (the "before" in the demo).

export interface ImportedContent {
  businessName: string;
  tagline?: string;
  paragraphs: string[];
  headings: string[];
  services: string[];
  phone?: string;
  email?: string;
  address?: string;
  social: { label: string; href: string }[];
}

export interface ImportResult {
  sourceUrl: string;
  content: ImportedContent;
  scan: ScanSummary;
  businessData: BusinessData;
  homeIr: PageIR;
}

function launchBrowser() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  return chromium.launch({ headless: true, executablePath });
}

export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  const url = normalizeUrl(rawUrl);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Extract everything we can in one pass, in the page context. NOTE:
    // this callback is serialized and run in the browser, so it must be
    // self-contained — no named inner helpers (bundlers decorate those with
    // a __name() call that isn't defined in the page), no outer references.
    const raw = await page.evaluate(() => {
      const metaName = (document.querySelector('meta[property="og:site_name"]') as HTMLMetaElement)?.content;
      const metaDesc =
        (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content ||
        (document.querySelector('meta[property="og:description"]') as HTMLMetaElement)?.content;

      const h1 = (document.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim();
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((h) => (h.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 1 && t.length < 120)
        .slice(0, 25);

      const paragraphs = Array.from(document.querySelectorAll("p, li"))
        .map((p) => (p.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 40 && t.length < 600)
        .slice(0, 12);

      const bodyText = document.body ? document.body.innerText : "";

      // tel: / mailto: links first, then fall back to regex over body text.
      const telLink = (document.querySelector('a[href^="tel:"]') as HTMLAnchorElement)?.href?.replace("tel:", "");
      const mailLink = (document.querySelector('a[href^="mailto:"]') as HTMLAnchorElement)?.href?.replace("mailto:", "").split("?")[0];

      const socialHosts = ["facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com", "tiktok.com", "yelp.com"];
      const social: { label: string; href: string }[] = [];
      for (const a of Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[]) {
        const host = socialHosts.find((h) => a.href.includes(h));
        if (host && !social.some((s) => s.href === a.href)) {
          social.push({ label: host.split(".")[0], href: a.href });
        }
      }

      return {
        title: document.title || "",
        metaName,
        metaDesc,
        h1,
        headings,
        paragraphs,
        bodyText: bodyText.slice(0, 20000),
        telLink,
        mailLink,
        social: social.slice(0, 6),
      };
    });

    const scan = await scanOpenPage(page);

    const content = shapeContent(raw, url);
    const businessData = toBusinessData(content);
    const homeIr = toSeedIr(content);

    return { sourceUrl: url, content, scan, businessData, homeIr };
  } finally {
    await browser.close();
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

interface RawScrape {
  title: string;
  metaName?: string;
  metaDesc?: string;
  h1: string;
  headings: string[];
  paragraphs: string[];
  bodyText: string;
  telLink?: string;
  mailLink?: string;
  social: { label: string; href: string }[];
}

const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// A loose US-style street address, matched WITHIN a single line (no \s that
// could cross a newline into adjacent text): number + words + street-type,
// then an optional city/state/zip tail.
const ADDRESS_RE =
  /\d{1,6}[ \t]+[\w. ]{2,40}\b(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|pl|place|suite|ste|hwy|highway)\b[\w.,# \t-]{0,45}/i;

function shapeContent(raw: RawScrape, url: string): ImportedContent {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const businessName = cleanName(raw.metaName || raw.title || raw.h1 || host);

  const phone = raw.telLink?.trim() || raw.bodyText.match(PHONE_RE)?.[0]?.trim();
  const email = raw.mailLink?.trim() || raw.bodyText.match(EMAIL_RE)?.[0]?.trim();
  // Match the address one line at a time so it can't run into adjacent text.
  const addressLine = raw.bodyText.split(/\n+/).map((l) => l.trim()).find((l) => ADDRESS_RE.test(l));
  const address = addressLine?.match(ADDRESS_RE)?.[0]?.replace(/\s+/g, " ").trim();

  // Services: short headings that aren't the business name or generic nav.
  const generic = /^(home|about|contact|services|menu|gallery|blog|reviews|faq|welcome)$/i;
  const services = raw.headings
    .filter((h) => !generic.test(h) && h.toLowerCase() !== businessName.toLowerCase() && h.length < 60)
    .slice(0, 6);

  return {
    businessName,
    tagline: raw.metaDesc?.trim() || undefined,
    paragraphs: raw.paragraphs,
    headings: raw.headings,
    services,
    phone: phone && phone.length <= 25 ? phone : undefined,
    email,
    address,
    social: raw.social,
  };
}

function cleanName(s: string): string {
  // Strip common "Name | tagline" / "Name - tagline" suffixes.
  return s.split(/\s[|–—-]\s/)[0].trim().slice(0, 80) || s.trim();
}

function toBusinessData(c: ImportedContent): BusinessData {
  return {
    name: c.businessName,
    tagline: c.tagline,
    about: c.paragraphs.slice(0, 2).join("\n\n") || undefined,
    phone: c.phone,
    email: c.email,
    address: c.address ? { street: c.address } : undefined,
    hours: [],
    services: c.services.map((name) => ({ name })),
    social: c.social,
  };
}

function toSeedIr(c: ImportedContent): PageIR {
  const sections: Section[] = [];

  sections.push({
    type: "hero",
    heading: c.tagline || `Welcome to ${c.businessName}`,
    subheading: c.tagline && c.paragraphs[0] ? c.paragraphs[0].slice(0, 160) : undefined,
    ctaLabel: c.phone ? "Call now" : "Get in touch",
    ctaHref: c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : "#contact",
  });

  if (c.paragraphs.length) {
    sections.push({ type: "about", heading: "About us", body: c.paragraphs.join("\n\n") });
  }

  if (c.services.length) {
    sections.push({
      type: "services",
      heading: "What we do",
      items: c.services.map((name) => ({ name })),
    });
  }

  sections.push({
    type: "contact",
    heading: "Get in touch",
    body: [c.phone && `Call us at ${c.phone}`, c.email && `Email ${c.email}`].filter(Boolean).join(" · ") || undefined,
    showForm: true,
  });

  return { sections };
}

export { defaultTheme };
