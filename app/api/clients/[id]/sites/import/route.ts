import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defaultTheme } from "@/lib/site/ir";
import { importFromUrl } from "@/lib/site/import";
import { renderPageRecord } from "@/lib/site/render-record";

const bodySchema = z.object({ url: z.string().min(3) });

/**
 * Create a new site for a client by importing an existing website: scrape
 * its content + contact details into an editable site, and record the old
 * site's accessibility "risk score" as the client's first audit entry (the
 * "before" in the sales demo). The AI can then redesign from here.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let imported;
  try {
    imported = await importFromUrl(parsed.data.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load that URL";
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 502 });
  }

  const site = await prisma.site.create({
    data: {
      clientId: client.id,
      name: `${imported.content.businessName} website`,
      theme: JSON.stringify(defaultTheme()),
      businessData: JSON.stringify(imported.businessData),
      showCookieBanner: client.hasTrackers,
      pages: {
        create: {
          path: "/",
          title: `${imported.content.businessName} — Home`,
          ir: JSON.stringify(imported.homeIr),
          isHome: true,
        },
      },
    },
    include: { pages: true },
  });

  // Record the imported (old) site's accessibility scan as the client's
  // "before" risk score — it lands in the same audit trail the badge shows.
  await prisma.accessibilityScan.create({
    data: {
      clientId: client.id,
      url: imported.sourceUrl,
      violationCount: imported.scan.violationCount,
      seriousCount: imported.scan.seriousCount,
      passCount: imported.scan.passCount,
      incompleteCount: imported.scan.incompleteCount,
      score: imported.scan.score,
      violations: JSON.stringify(imported.scan.violations),
      status: "COMPLETED",
    },
  });

  const homePage = site.pages[0];
  const render = renderPageRecord(homePage, site);
  await prisma.pageVersion.create({
    data: { pageId: homePage.id, ir: homePage.ir, html: render.html, createdBy: "import" },
  });

  return NextResponse.json(
    {
      site,
      riskScore: imported.scan.score,
      violationCount: imported.scan.violationCount,
      seriousCount: imported.scan.seriousCount,
      topIssues: imported.scan.violations.slice(0, 8),
      extracted: {
        businessName: imported.content.businessName,
        phone: imported.content.phone ?? null,
        email: imported.content.email ?? null,
        address: imported.content.address ?? null,
        services: imported.content.services,
      },
    },
    { status: 201 }
  );
}
