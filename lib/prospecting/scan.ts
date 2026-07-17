import { chromium } from "playwright";
import { scanOpenPage, type ScanSummary } from "@/lib/integrations/accessibility-scanner";

// Lightweight prospecting scan: load a prospect's site once, grab just enough
// to identify the business (name, phone, email), and run the real WCAG scan
// for its risk score. Unlike the full site importer this builds no editable
// site — it's purely for the Prospecting scoreboard.

export interface ProspectScrape {
  businessName?: string;
  phone?: string;
  email?: string;
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
      const h1 = (document.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim();
      const tel = (document.querySelector('a[href^="tel:"]') as HTMLAnchorElement)?.href?.replace("tel:", "");
      const mail = (document.querySelector('a[href^="mailto:"]') as HTMLAnchorElement)?.href
        ?.replace("mailto:", "")
        .split("?")[0];
      return { title: document.title || "", metaName, h1, tel, mail };
    });

    const scan = await scanOpenPage(page);

    const nameRaw = raw.metaName || raw.title || raw.h1 || "";
    const businessName = nameRaw.split(/\s[|–—-]\s/)[0].trim().slice(0, 80) || undefined;

    return {
      businessName,
      phone: raw.tel?.trim() || undefined,
      email: raw.mail?.trim() || undefined,
      scan,
    };
  } finally {
    await browser.close();
  }
}
