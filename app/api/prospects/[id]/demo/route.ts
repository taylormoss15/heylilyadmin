import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { importFromUrl } from "@/lib/site/import";
import { generateCustomSite } from "@/lib/site/ai-designer";
import { finalizeCustomHtml } from "@/lib/site/finalize";
import { outcomeIssues } from "@/lib/prospecting/issues";
import { analyzeHtmlSignals } from "@/lib/prospecting/html-signals";
import { computeAeo } from "@/lib/prospecting/aeo";
import { computeTrustScore } from "@/lib/prospecting/trust-score";
import { screenshotHtml } from "@/lib/site/screenshot";

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

  // Digital Trust Score, before → projected after — both computed with the
  // same engine so 62 → 92 is a real comparison. "Before" from the live site's
  // HTML; "after" from the finalized redesign (compliance is a clean 100).
  const beforeTrust = (() => {
    if (!imported.html) return prospect.trustScore ?? null;
    const aeo = computeAeo(analyzeHtmlSignals(imported.html, prospect.url), prospect.url);
    return computeTrustScore({
      accessibilityScore: imported.scan.score,
      violationCount: imported.scan.violationCount,
      seriousCount: imported.scan.seriousCount,
      aeoChecks: aeo.checks,
    }).score;
  })();

  const afterTrust = (() => {
    if (!redesignHtml) return null;
    const aeo = computeAeo(analyzeHtmlSignals(redesignHtml, "https://preview.heylily.ai"), "https://preview.heylily.ai");
    return computeTrustScore({
      accessibilityScore: afterScore ?? 100,
      violationCount: 0,
      seriousCount: 0,
      aeoChecks: aeo.checks,
    }).score;
  })();

  // Capture an "after" screenshot of the redesign for the outreach before/after.
  const afterShot = redesignHtml ? await screenshotHtml(redesignHtml) : null;

  const demo = await prisma.demo.create({
    data: {
      token,
      prospectId: prospect.id,
      ownerId: prospect.ownerId,
      sourceUrl: prospect.url,
      businessName: prospect.businessName || imported.content.businessName,
      beforeScore: imported.scan.score,
      beforeViolations: imported.scan.violationCount,
      beforeSerious: imported.scan.seriousCount,
      beforeShot: imported.screenshot ?? null,
      issues: JSON.stringify(issues),
      // Carry the on-page/SEO snapshot from the prospect's scan (if any) so the
      // scorecard can show the search-optimization gaps alongside compliance.
      seoScore: prospect.aeoScore ?? null,
      seoChecks: prospect.aeoChecks ?? null,
      platform: prospect.platform ?? null,
      redesignHtml,
      businessData: JSON.stringify(imported.businessData),
      afterScore,
      afterShot: afterShot ?? null,
      beforeTrust,
      afterTrust,
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
