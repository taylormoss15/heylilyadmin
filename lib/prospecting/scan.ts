import { chromium } from "playwright";
import { scanOpenPage, type ScanSummary } from "@/lib/integrations/accessibility-scanner";
import { inferProspectProfile } from "@/lib/prospecting/industry";
import { detectPlatform, computeAeo, type TechSignals, type AeoCheck } from "@/lib/prospecting/aeo";

// Lightweight prospecting scan: load a prospect's site once and learn as much
// as we can in a single pass — the business identity, the real WCAG risk
// score, who built the site, how professional it looks (AI), and an on-page /
// AEO scorecard. Purely for the prospecting scoreboard (builds no site).

export interface ProspectScrape {
  businessName?: string;
  phone?: string;
  email?: string;
  industry?: string;
  employees?: string;
  estimatedRevenue?: string;
  platform?: string;
  builtBy?: string;
  professionalism?: number;
  professionalismNote?: string;
  aeoScore?: number;
  aeoChecks?: AeoCheck[];
  scan: ScanSummary;
}

export function normalizeProspectUrl(input: string): string {
  let s = input.trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.hash = "";
    // Drop a lone trailing slash so "site.com" and "site.com/" dedupe.
    let out = u.toString();
    if (u.pathname === "/" && !u.search) out = `${u.protocol}//${u.hostname}`;
    return out;
  } catch {
    return "";
  }
}

function launchBrowser() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  return chromium.launch({ headless: true, executablePath });
}

export async function scanProspect(url: string): Promise<ProspectScrape> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Self-contained (runs in the page context) — no outer refs / named helpers.
    const raw = await page.evaluate(() => {
      const metaName = (document.querySelector('meta[property="og:site_name"]') as HTMLMetaElement)?.content;
      const metaDesc =
        (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content ||
        (document.querySelector('meta[property="og:description"]') as HTMLMetaElement)?.content ||
        "";
      const h1 = (document.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim();
      const tel = (document.querySelector('a[href^="tel:"]') as HTMLAnchorElement)?.href?.replace("tel:", "");
      const mail = (document.querySelector('a[href^="mailto:"]') as HTMLAnchorElement)?.href
        ?.replace("mailto:", "")
        .split("?")[0];
      const bodyText = (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 6000);

      // ---- Site-intelligence / on-page signals ----
      const generator = (document.querySelector('meta[name="generator"]') as HTMLMetaElement)?.content || "";
      const robots = (document.querySelector('meta[name="robots"]') as HTMLMetaElement)?.content || "";
      const imgs = Array.from(document.querySelectorAll("img"));
      const imgWithAlt = imgs.filter((i) => (i.getAttribute("alt") || "").trim().length > 0).length;

      const jsonLdTypes: string[] = [];
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).forEach((s) => {
        try {
          const parsed = JSON.parse(s.textContent || "{}");
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          arr.forEach((o) => {
            const ty = o && o["@type"];
            if (typeof ty === "string") jsonLdTypes.push(ty);
            else if (Array.isArray(ty)) ty.forEach((x) => typeof x === "string" && jsonLdTypes.push(x));
          });
        } catch {
          /* ignore malformed ld+json */
        }
      });

      const hostsSet: Record<string, boolean> = {};
      Array.from(document.querySelectorAll("script[src], link[href]")).forEach((el) => {
        const u = el.getAttribute("src") || el.getAttribute("href") || "";
        try {
          hostsSet[new URL(u, location.href).hostname] = true;
        } catch {
          /* ignore */
        }
      });
      const hosts = Object.keys(hostsSet);
      const hasAnalytics = hosts.some((h) =>
        /googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|clarity\.ms|hotjar\.com/i.test(h)
      );
      const hasWpContent = Array.from(document.querySelectorAll("script[src], link[href]")).some((el) =>
        /\/wp-(content|includes)\//i.test(el.getAttribute("src") || el.getAttribute("href") || "")
      );

      const footer = document.querySelector("footer") || document.body;
      const ftext = footer ? footer.textContent || "" : "";
      const creditMatch = ftext.match(
        /(powered by|website by|site by|designed by|built by|created by|web design by)[^.\n|•·]{0,50}/i
      );
      const credit = creditMatch ? creditMatch[0].replace(/\s+/g, " ").trim() : "";

      const words = bodyText.split(/\s+/).filter(Boolean).length;

      return {
        title: document.title || "",
        metaName,
        metaDesc,
        h1,
        tel,
        mail,
        bodyText,
        generator,
        robots,
        hasCanonical: !!document.querySelector('link[rel="canonical"]'),
        hasViewport: !!document.querySelector('meta[name="viewport"]'),
        lang: document.documentElement.getAttribute("lang") || "",
        hasFavicon: !!document.querySelector('link[rel~="icon"]'),
        ogTitle: !!document.querySelector('meta[property="og:title"]'),
        ogImage: !!document.querySelector('meta[property="og:image"]'),
        twitterCard: !!document.querySelector('meta[name="twitter:card"]'),
        h1Count: document.querySelectorAll("h1").length,
        headingCount: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
        imgTotal: imgs.length,
        imgWithAlt,
        jsonLdTypes,
        words,
        hasAnalytics,
        hasWpContent,
        hosts,
        credit,
      };
    });

    const scan = await scanOpenPage(page);

    // Small screenshot for the AI's professionalism judgment (viewport only).
    let screenshot: string | undefined;
    try {
      await page.setViewportSize({ width: 1024, height: 768 });
      const buf = await page.screenshot({ type: "jpeg", quality: 45 });
      screenshot = `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      screenshot = undefined;
    }

    const nameRaw = raw.metaName || raw.title || raw.h1 || "";
    const businessName = nameRaw.split(/\s[|–—-]\s/)[0].trim().slice(0, 80) || undefined;

    const tech: TechSignals = {
      generator: raw.generator,
      title: raw.title,
      description: raw.metaDesc,
      hasCanonical: raw.hasCanonical,
      hasViewport: raw.hasViewport,
      lang: raw.lang,
      hasFavicon: raw.hasFavicon,
      robots: raw.robots,
      ogTitle: raw.ogTitle,
      ogImage: raw.ogImage,
      twitterCard: raw.twitterCard,
      h1Count: raw.h1Count,
      headingCount: raw.headingCount,
      imgTotal: raw.imgTotal,
      imgWithAlt: raw.imgWithAlt,
      jsonLdTypes: raw.jsonLdTypes,
      words: raw.words,
      hasAnalytics: raw.hasAnalytics,
      hasWpContent: raw.hasWpContent,
      hosts: raw.hosts,
      credit: raw.credit,
    };
    const platform = detectPlatform(tech);
    const aeo = computeAeo(tech, url);

    // Best-effort AI enrichment: industry, size, professionalism, who built it.
    const profile = await inferProspectProfile({
      businessName,
      url,
      text: [raw.title, raw.metaDesc, raw.h1, raw.bodyText].filter(Boolean).join("\n"),
      screenshot,
      platformHint: platform,
      creditHint: raw.credit || undefined,
    });

    return {
      businessName,
      phone: raw.tel?.trim() || undefined,
      email: raw.mail?.trim() || undefined,
      industry: profile.industry,
      employees: profile.employees,
      estimatedRevenue: profile.estimatedRevenue,
      platform,
      builtBy: profile.builtBy || raw.credit || undefined,
      professionalism: profile.professionalism,
      professionalismNote: profile.professionalismNote,
      aeoScore: aeo.score,
      aeoChecks: aeo.checks,
      scan,
    };
  } finally {
    await browser.close();
  }
}
