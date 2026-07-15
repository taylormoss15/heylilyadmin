import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { businessDataSchema, themeSchema } from "@/lib/site/ir";

export async function GET(_request: NextRequest, { params }: { params: { siteId: string } }) {
  const site = await prisma.site.findUnique({
    where: { id: params.siteId },
    include: { pages: { orderBy: { isHome: "desc" } }, client: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({ site });
}

const updateSiteSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  showCookieBanner: z.boolean().optional(),
  theme: themeSchema.optional(),
  businessData: businessDataSchema.optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { siteId: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.site.findUnique({ where: { id: params.siteId } });
  if (!existing) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.showCookieBanner !== undefined) data.showCookieBanner = parsed.data.showCookieBanner;
  if (parsed.data.theme !== undefined) data.theme = JSON.stringify(parsed.data.theme);
  if (parsed.data.businessData !== undefined) data.businessData = JSON.stringify(parsed.data.businessData);

  const site = await prisma.site.update({ where: { id: params.siteId }, data });
  return NextResponse.json({ site });
}

export async function DELETE(_request: NextRequest, { params }: { params: { siteId: string } }) {
  const existing = await prisma.site.findUnique({ where: { id: params.siteId } });
  if (!existing) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  await prisma.site.delete({ where: { id: params.siteId } });
  return NextResponse.json({ ok: true });
}
