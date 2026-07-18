import { chromium } from "playwright";
import { scanOpenPage, type ScanSummary } from "@/lib/integrations/accessibility-scanner";
import { inferProspectProfile } from "@/lib/prospecting/industry";

// Lightweight prospecting scan: load a prospect's site once, grab just enough
// to identify the business (name, phone, email), run the real WCAG scan for
// its risk score, and ask the AI to infer the industry. Unlike the full site
// importer this builds no editable site — it's purely for the scoreboard.

export interface ProspectScrape {
  businessName?: string;
  phone?: string;
  email?: string;
  industry?: string;
  employees?: string;
  estimatedRevenue?: string;
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
      return { title: document.title || "", metaName, metaDesc, h1, tel, mail, bodyText };
    });

    const scan = await scanOpenPage(page);

    const nameRaw = raw.metaName || raw.title || raw.h1 || "";
    const businessName = nameRaw.split(/\s[|–—-]\s/)[0].trim().slice(0, 80) || undefined;

    // Best-effort AI industry/size inference from the page's own text.
    const profile = await inferProspectProfile({
      businessName,
      url,
      text: [raw.title, raw.metaDesc, raw.h1, raw.bodyText].filter(Boolean).join("\n"),
    });

    return {
      businessName,
      phone: raw.tel?.trim() || undefined,
      email: raw.mail?.trim() || undefined,
      industry: profile.industry,
      employees: profile.employees,
      estimatedRevenue: profile.estimatedRevenue,
      scan,
    };
  } finally {
    await browser.close();
  }
}
