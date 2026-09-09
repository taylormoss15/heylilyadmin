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
import { scanProspect } from "@/lib/prospecting/scan";
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
    // If a rep captured this (bot-blocked) site with the bookmarklet, build the
    // demo from that captured HTML instead of re-fetching (which would be blocked).
    imported = await importFromUrl(prospect.url, prospect.capturedHtml ? { html: prospect.capturedHtml } : undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load that site";
    return NextResponse.json({ error: `Couldn't load the site: ${message}` }, { status: 502 });
  }

  // If we couldn't find their hours, publish a sensible, editable default on the
  // site WE build (Mon–Fri 9–5) — most local firms are close, they can correct
  // it before going live, and it earns the "hours published" trust signal. This
  // only affects our redesign, never their current site's "before" score.
  if (!imported.businessData.hours || imported.businessData.hours.length === 0) {
    imported.businessData.hours = [
      { label: "Monday – Friday", value: "9:00 AM – 5:00 PM" },
      { label: "Saturday – Sunday", value: "Closed" },
    ];
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
  // same engine so 62 → 92 is a real comparison. "Before" reuses the prospect's
  // stored score (the exact number they saw on the homepage/free scan) so it's
  // identical end-to-end; only if there's no stored score do we compute it fresh.
  const beforeTrust = prospect.trustScore ?? (() => {
    if (!imported.html) return null;
    const aeo = computeAeo(analyzeHtmlSignals(imported.html, prospect.url), prospect.url);
    return computeTrustScore({
      accessibilityScore: imported.scan.score,
      violationCount: imported.scan.violationCount,
      seriousCount: imported.scan.seriousCount,
      aeoChecks: aeo.checks,
    }).score;
  })();

  // The "after" score runs the finalized site through the EXACT same scan
  // engine as the public lead-magnet scanner (scanProspect). So the number we
  // sell is byte-for-byte the number a prospect gets if they run their new site
  // through "score my site" once it's live — guaranteed, not approximated.
  const afterTrust = redesignHtml
    ? (await scanProspect(prospect.url, { html: redesignHtml, scoreOnly: true })).trust.score
    : null;

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
