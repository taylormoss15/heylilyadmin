import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { renderPageRecord } from "@/lib/site/render-record";
import { validateRender } from "@/lib/site/validate";
import { scanClientAndPersist } from "@/lib/integrations/accessibility-scanner";

// Assisted publish. GoHighLevel's API is READ-ONLY for funnel/website pages
// — there is no endpoint to create or update a Custom HTML Page (confirmed
// against GHL's docs; it's a requested-but-unavailable feature). So publish
// here means: validate the page, mark it ready, and hand back the export
// URL + steps for pasting it into GHL. Optionally, once the operator has the
// page live, they submit the live URL, which we register with the
// accessibility scanner so the published page joins the same ongoing
// compliance audit trail the rest of the product uses.

const bodySchema = z.object({
  liveUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest, { params }: { params: { pageId: string } }) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const page = await prisma.page.findUnique({
    where: { id: params.pageId },
    include: { site: { include: { client: true } } },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Always re-validate at publish time — a page can't ship if it regresses.
  const render = renderPageRecord(page, page.site);
  const report = await validateRender(render);

  if (!report.ok) {
    await prisma.publishRecord.create({
      data: {
        pageId: page.id,
        status: "BLOCKED",
        a11yScore: report.a11yScore,
        sizeBytes: report.sizeBytes,
        error: report.blockers.join(" "),
      },
    });
    return NextResponse.json(
      { ok: false, report, message: "Fix the blockers before publishing." },
      { status: 422 }
    );
  }

  // Step 2: operator has pasted the page into GHL and is confirming the live URL.
  if (parsed.data.liveUrl) {
    const record = await prisma.publishRecord.create({
      data: {
        pageId: page.id,
        status: "PUBLISHED",
        externalRef: parsed.data.liveUrl,
        a11yScore: report.a11yScore,
        sizeBytes: report.sizeBytes,
        publishedAt: new Date(),
      },
    });
    await prisma.site.update({ where: { id: page.site.id }, data: { status: "PUBLISHED" } });

    // Register the live page for ongoing compliance monitoring: point the
    // client's scan target at it (if not already set) and run a first scan
    // now, so the published site immediately has an audit-trail entry.
    if (!page.site.client.siteUrl) {
      await prisma.client.update({
        where: { id: page.site.client.id },
        data: { siteUrl: parsed.data.liveUrl },
      });
    }
    const scan = await scanClientAndPersist({ ...page.site.client, siteUrl: parsed.data.liveUrl });

    return NextResponse.json({
      ok: true,
      publishRecordId: record.id,
      liveUrl: parsed.data.liveUrl,
      firstScanStatus: scan.status,
      message: "Published and registered for ongoing accessibility monitoring.",
    });
  }

  // Step 1: validated and ready — return the export URL + instructions.
  const record = await prisma.publishRecord.create({
    data: {
      pageId: page.id,
      status: "VALIDATED",
      a11yScore: report.a11yScore,
      sizeBytes: report.sizeBytes,
    },
  });

  return NextResponse.json({
    ok: true,
    ready: true,
    publishRecordId: record.id,
    report,
    exportUrl: `/api/pages/${page.id}/export`,
    instructions: [
      "Download the generated HTML file.",
      "In GHL, create a Custom HTML Page for this client and paste the file's contents.",
      "Publish it in GHL under the client's domain, then copy the live URL.",
      "Paste the live URL below to register it for ongoing compliance monitoring.",
    ],
  });
}
