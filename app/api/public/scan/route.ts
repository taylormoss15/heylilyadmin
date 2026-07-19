import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProspectUrl, scanProspect } from "@/lib/prospecting/scan";
import { getClientIp, isScanAllowed, consumeScan, DAILY_SCAN_LIMIT } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ url: z.string().min(3).max(300) });

// Public, unauthenticated free scan (the heylily.ai lead magnet). Scans a
// visitor's own site, records it as an inbound Prospect on the board, and
// returns only the TEASER — headline scores + Critical/Warnings/Passed counts.
// The full findings are gated behind the email step (/api/public/lead).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid website address." }, { status: 400 });
  }

  const url = normalizeProspectUrl(parsed.data.url);
  if (!url) {
    return NextResponse.json({ error: "That doesn't look like a valid website address." }, { status: 400 });
  }

  // Daily per-IP cap so nobody can use our scanner to audit their own sites.
  const ip = getClientIp(request);
  const { allowed } = await isScanAllowed(ip);
  if (!allowed) {
    return NextResponse.json(
      {
        error: `You've reached the daily limit of ${DAILY_SCAN_LIMIT} free scans. Please try again tomorrow — or book a call and we'll scan the rest for you.`,
      },
      { status: 429 }
    );
  }

  const existing = await prisma.prospect.findUnique({ where: { url } });

  // Reuse a very recent scan (10 min) so a refresh/re-submit doesn't re-run
  // the whole headless scan — also a light abuse guard.
  const fresh =
    existing &&
    existing.scanStatus === "COMPLETED" &&
    existing.scannedAt &&
    Date.now() - new Date(existing.scannedAt).getTime() < 10 * 60 * 1000;

  let prospect = existing;
  if (!fresh) {
    // Only a real (non-reused) scan consumes the daily quota.
    await consumeScan(ip);
    let result;
    try {
      result = await scanProspect(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      return NextResponse.json({ error: `We couldn't load that site: ${message}` }, { status: 502 });
    }

    const data = {
      businessName: existing?.businessName || result.businessName || null,
      phone: existing?.phone || result.phone || null,
      email: existing?.email || result.email || null,
      industry: existing?.industry || result.industry || null,
      employees: existing?.employees || result.employees || null,
      estimatedRevenue: existing?.estimatedRevenue || result.estimatedRevenue || null,
      platform: result.platform ?? null,
      builtBy: result.builtBy ?? null,
      professionalism: result.professionalism ?? null,
      professionalismNote: result.professionalismNote ?? null,
      aeoScore: result.aeoScore ?? null,
      aeoChecks: result.aeoChecks ? JSON.stringify(result.aeoChecks) : null,
      scanStatus: "COMPLETED",
      scanError: null,
      score: result.scan.score,
      violationCount: result.scan.violationCount,
      seriousCount: result.scan.seriousCount,
      passCount: result.scan.passCount,
      violations: JSON.stringify(result.scan.violations.slice(0, 20)),
      scannedAt: new Date(),
    };

    prospect = existing
      ? await prisma.prospect.update({ where: { id: existing.id }, data })
      : await prisma.prospect.create({ data: { url, source: "inbound", ...data } });
  }

  if (!prospect) {
    return NextResponse.json({ error: "Scan failed" }, { status: 502 });
  }

  // Build the teaser buckets (counts only — no fix details).
  let failedSeo = 0;
  let passedSeo = 0;
  try {
    const checks = JSON.parse(prospect.aeoChecks || "[]");
    if (Array.isArray(checks)) {
      failedSeo = checks.filter((c) => c && !c.pass).length;
      passedSeo = checks.filter((c) => c && c.pass).length;
    }
  } catch {
    /* ignore */
  }
  const minorA11y = Math.max(0, prospect.violationCount - prospect.seriousCount);

  return NextResponse.json({
    ref: prospect.id,
    businessName: prospect.businessName,
    url: prospect.url,
    compliance: { score: prospect.score, serious: prospect.seriousCount, total: prospect.violationCount },
    seo: { score: prospect.aeoScore },
    platform: prospect.platform,
    buckets: {
      critical: prospect.seriousCount,
      warnings: failedSeo + minorA11y,
      passed: passedSeo,
    },
  });
}
