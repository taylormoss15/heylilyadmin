import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { importFromUrl } from "@/lib/site/import";
import { generateCustomSite } from "@/lib/site/ai-designer";
import { finalizeCustomHtml } from "@/lib/site/finalize";
import { outcomeIssues } from "@/lib/prospecting/issues";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Generate a full sales demo for a prospect in one shot: scrape + screenshot
// their current site, score it, build the AI redesign, and store it all under
// a public token served at /demo/[token] (interactive before/after) and
// /demo/[token]/report (print-friendly scorecard).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  let imported;
  try {
    imported = await importFromUrl(prospect.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load that site";
    return NextResponse.json({ error: `Couldn't load the site: ${message}` }, { status: 502 });
  }

  const token = randomBytes(9).toString("base64url");

  let redesignHtml: string | null = null;
  let afterScore: number | null = null;
  let dryRun = false;
  try {
    const design = await generateCustomSite({
      business: imported.businessData,
      ir: imported.homeIr,
      clientId: `demo:${token}`,
      showCookieBanner: false,
      showBadge: false, // no client audit log behind a prospect demo yet
      adminBaseUrl: process.env.ADMIN_BASE_URL,
      imageUrls: imported.content.images.slice(0, 12),
    });
    // Store the fully finalized (self-contained) HTML so /demo can serve it.
    redesignHtml = finalizeCustomHtml(design.html, {
      clientId: `demo:${token}`,
      business: imported.businessData,
      adminBaseUrl: process.env.ADMIN_BASE_URL,
      showCookieBanner: false,
      showBadge: false,
    });
    afterScore = design.report.a11yScore;
    dryRun = design.dryRun;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Design generation failed";
    return NextResponse.json({ error: `Redesign failed: ${message}` }, { status: 502 });
  }

  const issues = outcomeIssues(imported.scan.violations);

  const demo = await prisma.demo.create({
    data: {
      token,
      prospectId: prospect.id,
      sourceUrl: prospect.url,
      businessName: prospect.businessName || imported.content.businessName,
      beforeScore: imported.scan.score,
      beforeViolations: imported.scan.violationCount,
      beforeSerious: imported.scan.seriousCount,
      beforeShot: imported.screenshot ?? null,
      issues: JSON.stringify(issues),
      redesignHtml,
      afterScore,
      dryRun,
      status: "READY",
    },
  });

  // Backfill the prospect's score/name from this fresh scan if it had none,
  // and remember the latest demo token for quick linking.
  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      demoToken: token,
      businessName: prospect.businessName || imported.content.businessName,
      ...(prospect.scanStatus !== "COMPLETED"
        ? {
            scanStatus: "COMPLETED",
            score: imported.scan.score,
            violationCount: imported.scan.violationCount,
            seriousCount: imported.scan.seriousCount,
            passCount: imported.scan.passCount,
            violations: JSON.stringify(imported.scan.violations.slice(0, 20)),
            scannedAt: new Date(),
          }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    token: demo.token,
    dryRun,
    demoUrl: `/demo/${demo.token}`,
    reportUrl: `/demo/${demo.token}/report`,
  });
}
