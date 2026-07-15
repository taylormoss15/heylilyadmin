import type { Page, Site } from "@prisma/client";
import { parseBusinessData, parsePageIR, parseTheme } from "@/lib/site/ir";
import { renderPage, type RenderResult } from "@/lib/site/renderer";

/** Render a stored Page (+ its Site) into HTML, parsing the JSON columns. */
export function renderPageRecord(
  page: Page,
  site: Site & { clientId: string },
  adminBaseUrl?: string
): RenderResult {
  const theme = parseTheme(site.theme);
  const business = parseBusinessData(site.businessData);
  const ir = parsePageIR(page.ir);
  return renderPage(ir, theme, business, page.title, {
    clientId: site.clientId,
    adminBaseUrl,
    showCookieBanner: site.showCookieBanner,
  });
}
