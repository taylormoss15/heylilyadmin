import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderPageRecord } from "@/lib/site/render-record";

// Returns the rendered page as text/html so the editor's preview iframe can
// load it directly via src. Gated by the admin session (middleware) — this
// is the internal preview, not the published public page.
export async function GET(_request: NextRequest, { params }: { params: { pageId: string } }) {
  const page = await prisma.page.findUnique({
    where: { id: params.pageId },
    include: { site: true },
  });
  if (!page) return new NextResponse("Page not found", { status: 404 });

  try {
    const { html } = renderPageRecord(page, page.site);
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return new NextResponse(`Render error: ${message}`, { status: 500 });
  }
}
