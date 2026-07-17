import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBusinessData, parsePageIR } from "@/lib/site/ir";
import { generateCustomSite } from "@/lib/site/ai-designer";
import { renderPageRecord } from "@/lib/site/render-record";
import { getSessionFromCookies } from "@/lib/auth";

const bodySchema = z.object({
  pageId: z.string().min(1),
  instruction: z.string().optional(),
});

// Generate a full bespoke custom-HTML design for a page. Stores the AI's
// HTML on the page (rendered with compliance injected), snapshots a version,
// and returns the validation report so the UI can show the a11y score.
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

  const assets = await prisma.siteAsset.findMany({
    where: { siteId: site.id, kind: "image" },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  let result;
  try {
    result = await generateCustomSite({
      business: parseBusinessData(site.businessData),
      ir: parsePageIR(page.ir),
      instruction: parsed.data.instruction,
      clientId: site.clientId,
      showCookieBanner: site.showCookieBanner,
      imageUrls: assets.map((a) => a.cdnUrl),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Design generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const updatedPage = await prisma.page.update({
    where: { id: page.id },
    data: { customHtml: result.html },
  });

  const session = await getSessionFromCookies();
  const render = renderPageRecord(updatedPage, site);
  await prisma.pageVersion.create({
    data: { pageId: page.id, ir: updatedPage.ir, html: render.html, createdBy: `${session?.userId ?? "system"} (ai-design)` },
  });

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    dryRun: result.dryRun,
    report: result.report,
  });
}
