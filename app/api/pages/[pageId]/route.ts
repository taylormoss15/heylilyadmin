import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { pageIrSchema } from "@/lib/site/ir";
import { renderPageRecord } from "@/lib/site/render-record";
import { getSessionFromCookies } from "@/lib/auth";

const updatePageSchema = z.object({
  title: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  ir: pageIrSchema.optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { pageId: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updatePageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.page.findUnique({
    where: { id: params.pageId },
    include: { site: true },
  });
  if (!existing) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.path !== undefined) data.path = parsed.data.path;
  if (parsed.data.ir !== undefined) data.ir = JSON.stringify(parsed.data.ir);

  const page = await prisma.page.update({ where: { id: params.pageId }, data });

  // Snapshot a new version on every content edit (undo + design audit trail).
  if (parsed.data.ir !== undefined) {
    const session = await getSessionFromCookies();
    const render = renderPageRecord(page, existing.site);
    await prisma.pageVersion.create({
      data: { pageId: page.id, ir: page.ir, html: render.html, createdBy: session?.userId ?? "system" },
    });
  }

  return NextResponse.json({ page });
}
