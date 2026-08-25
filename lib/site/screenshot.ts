import { chromium } from "playwright";

// Render an HTML string in a headless browser and return a compact JPEG data
// URL — used to capture an "after" screenshot of the redesign for the outreach
// email's before/after. Best-effort: returns undefined on any failure.
export async function screenshotHtml(html: string): Promise<string | undefined> {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20000 });
    const buf = await page.screenshot({ type: "jpeg", quality: 55 });
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  } finally {
    await browser?.close().catch(() => {});
  }
}
