import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { starterSite } from "@/lib/site/ir";
import { renderPageRecord } from "@/lib/site/render-record";

const createSiteSchema = z.object({
  name: z.string().min(1).optional(),
});

/** Create a new website for a client, pre-populated with starter content. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = createSiteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const siteName = parsed.data.name || `${client.name} website`;
  const starter = starterSite(client.name);

  const site = await prisma.site.create({
    data: {
      clientId: client.id,
      name: siteName,
      theme: JSON.stringify(starter.theme),
      businessData: JSON.stringify(starter.businessData),
      showCookieBanner: client.hasTrackers,
      pages: {
        create: {
          path: "/",
          title: `${client.name} — Home`,
          ir: JSON.stringify(starter.homeIr),
          isHome: true,
        },
      },
    },
    include: { pages: true },
  });

  // Snapshot the initial rendered HTML as version 1.
  const homePage = site.pages[0];
  const render = renderPageRecord(homePage, site);
  await prisma.pageVersion.create({
    data: { pageId: homePage.id, ir: homePage.ir, html: render.html, createdBy: "system" },
  });

  return NextResponse.json({ site }, { status: 201 });
}
