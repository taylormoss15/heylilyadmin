import type { Page, Site } from "@prisma/client";
import { parseBusinessData, parsePageIR, parseTheme } from "@/lib/site/ir";
import { renderPage, type RenderResult } from "@/lib/site/renderer";
import { finalizeCustomHtml } from "@/lib/site/finalize";

/**
 * Render a stored Page (+ its Site) into HTML. If the page has AI-generated
 * customHtml, that's used (with the compliance layer injected/guaranteed);
 * otherwise it renders deterministically from the structured IR.
 */
export function renderPageRecord(
  page: Page,
  site: Site & { clientId: string },
  adminBaseUrl?: string
): RenderResult {
  const business = parseBusinessData(site.businessData);

  if (page.customHtml && page.customHtml.trim()) {
    const html = finalizeCustomHtml(page.customHtml, {
      clientId: site.clientId,
      business,
      adminBaseUrl,
      showCookieBanner: site.showCookieBanner,
    });
    return { html, warnings: [] };
  }

  const theme = parseTheme(site.theme);
  const ir = parsePageIR(page.ir);
  return renderPage(ir, theme, business, page.title, {
    clientId: site.clientId,
    adminBaseUrl,
    showCookieBanner: site.showCookieBanner,
  });
}
