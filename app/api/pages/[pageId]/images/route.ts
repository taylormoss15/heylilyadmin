import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractImageUrls, replaceImageUrl } from "@/lib/site/images";
import { renderPageRecord } from "@/lib/site/render-record";
import { getSessionFromCookies } from "@/lib/auth";

// GET: list the image URLs used in this page's custom design.
export async function GET(_request: NextRequest, { params }: { params: { pageId: string } }) {
  const page = await prisma.page.findUnique({ where: { id: params.pageId } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  if (!page.customHtml) {
    return NextResponse.json({ customDesign: false, images: [] });
  }
  return NextResponse.json({ customDesign: true, images: extractImageUrls(page.customHtml) });
}

const swapSchema = z.object({
  oldUrl: z.string().min(1),
  newUrl: z.string().url(),
});

// POST: swap one image for another (e.g. a higher-res upload) in the custom
// HTML — a deterministic replace of every occurrence, then snapshot a version.
export async function POST(request: NextRequest, { params }: { params: { pageId: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = swapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const page = await prisma.page.findUnique({ where: { id: params.pageId }, include: { site: true } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  if (!page.customHtml) {
    return NextResponse.json({ error: "This page has no custom design to edit." }, { status: 400 });
  }

  const { html, count } = replaceImageUrl(page.customHtml, parsed.data.oldUrl, parsed.data.newUrl);
  if (count === 0) {
    return NextResponse.json({ error: "That image wasn't found in the current design." }, { status: 404 });
  }

  const updated = await prisma.page.update({ where: { id: page.id }, data: { customHtml: html } });

  const session = await getSessionFromCookies();
  const render = renderPageRecord(updated, page.site);
  await prisma.pageVersion.create({
    data: { pageId: page.id, ir: updated.ir, html: render.html, createdBy: `${session?.userId ?? "system"} (image-swap)` },
  });

  return NextResponse.json({ ok: true, replaced: count, images: extractImageUrls(html) });
}
