import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderPageRecord } from "@/lib/site/render-record";

// Downloads the generated page as a single .html file ready to paste/upload
// into GHL's Custom HTML Pages. This is the "assisted publish" path until
// GHL's publish API is verified (see docs/website-builder-plan.md §7).
export async function GET(_request: NextRequest, { params }: { params: { pageId: string } }) {
  const page = await prisma.page.findUnique({
    where: { id: params.pageId },
    include: { site: true },
  });
  if (!page) return new NextResponse("Page not found", { status: 404 });

  const { html } = renderPageRecord(page, page.site);
  const filename = (page.path === "/" ? "index" : page.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")) + ".html";

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
