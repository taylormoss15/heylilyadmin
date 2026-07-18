import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBusinessData, parsePageIR } from "@/lib/site/ir";
import { fixCustomSite } from "@/lib/site/ai-designer";
import { renderPageRecord } from "@/lib/site/render-record";
import { getSessionFromCookies } from "@/lib/auth";

const bodySchema = z.object({ pageId: z.string().min(1) });

// One-click "Fix accessibility with AI": repairs the current custom-HTML
// page's violations while preserving the design, re-validates, and saves.
export async function POST(request: NextRequest, { params }: { params: { siteId: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: params.siteId } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const page = await prisma.page.findFirst({ where: { id: parsed.data.pageId, siteId: site.id } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  if (!page.customHtml) {
    return NextResponse.json(
      {
        error:
          "This page uses the structured builder, which is compliant by construction. Generate a custom design first if you want AI to fix bespoke HTML.",
      },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await fixCustomSite(
      {
        business: parseBusinessData(site.businessData),
        ir: parsePageIR(page.ir),
        clientId: site.clientId,
        showCookieBanner: site.showCookieBanner,
      },
      page.customHtml
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fix failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const updatedPage = await prisma.page.update({
    where: { id: page.id },
    data: { customHtml: result.html },
  });

  const session = await getSessionFromCookies();
  const render = renderPageRecord(updatedPage, site);
  await prisma.pageVersion.create({
    data: { pageId: page.id, ir: updatedPage.ir, html: render.html, createdBy: `${session?.userId ?? "system"} (ai-fix)` },
  });

  return NextResponse.json({ ok: true, summary: result.summary, dryRun: result.dryRun, report: result.report });
}
