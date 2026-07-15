import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderPageRecord } from "@/lib/site/render-record";
import { validateRender } from "@/lib/site/validate";

// Renders the page and runs the publish gate (axe-core a11y + 5MB size +
// render warnings). Records the outcome on PublishRecord so a page's
// validation history is tied back to it.
export async function POST(_request: NextRequest, { params }: { params: { pageId: string } }) {
  const page = await prisma.page.findUnique({
    where: { id: params.pageId },
    include: { site: true },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const render = renderPageRecord(page, page.site);
  const report = await validateRender(render);

  await prisma.publishRecord.create({
    data: {
      pageId: page.id,
      status: report.ok ? "VALIDATED" : "BLOCKED",
      a11yScore: report.a11yScore,
      sizeBytes: report.sizeBytes,
      error: report.blockers.length ? report.blockers.join(" ") : null,
    },
  });

  return NextResponse.json({ report });
}
