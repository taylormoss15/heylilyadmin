import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProspectUrl, scanProspect } from "@/lib/prospecting/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const bodySchema = z.object({
  token: z.string().min(10),
  url: z.string().min(3).max(300),
  html: z.string().min(1).max(4_000_000),
});

// Manual scan from a rep's browser bookmarklet. The rep's own session already
// loaded the (bot-blocked) site, so they send us the rendered HTML + their
// capture token; we score that DOM exactly like a normal scan and save it as a
// scored lead assigned to them. No cookies — auth is the personal token.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing token, url, or page content." }, { status: 400, headers: CORS });
  }

  const rep = await prisma.adminUser.findFirst({ where: { captureToken: parsed.data.token } });
  if (!rep) return NextResponse.json({ error: "Invalid capture token — regenerate it in your account." }, { status: 401, headers: CORS });

  const url = normalizeProspectUrl(parsed.data.url);
  if (!url) return NextResponse.json({ error: "That doesn't look like a valid website address." }, { status: 400, headers: CORS });

  let result;
  try {
    result = await scanProspect(url, { html: parsed.data.html });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: `Couldn't score that page: ${message}` }, { status: 502, headers: CORS });
  }

  const existing = await prisma.prospect.findUnique({ where: { url } });
  const data = {
    businessName: existing?.businessName || result.businessName || null,
    phone: existing?.phone || result.phone || null,
    email: existing?.email || result.email || null,
    industry: existing?.industry || result.industry || null,
    platform: result.platform ?? null,
    aeoScore: result.aeoScore ?? null,
    aeoChecks: result.aeoChecks ? JSON.stringify(result.aeoChecks) : null,
    trustScore: result.trust.score,
    trustBreakdown: JSON.stringify({ pillars: result.trust.pillars, capped: result.trust.capped, band: result.trust.band }),
    siteStatus: result.siteStatus ?? "ok",
    capturedHtml: parsed.data.html, // reused to build the demo without re-fetching
    scanStatus: "COMPLETED",
    scanError: null,
    score: result.scan.score,
    violationCount: result.scan.violationCount,
    seriousCount: result.scan.seriousCount,
    passCount: result.scan.passCount,
    violations: JSON.stringify(result.scan.violations.slice(0, 20)),
    scannedAt: new Date(),
    // Assign to the rep who captured it (unless already owned).
    ownerId: existing?.ownerId || rep.id,
  };

  const prospect = existing
    ? await prisma.prospect.update({ where: { id: existing.id }, data })
    : await prisma.prospect.create({ data: { url, source: "manual", ...data } });

  return NextResponse.json(
    { ok: true, trustScore: prospect.trustScore, businessName: prospect.businessName, url: prospect.url },
    { headers: CORS }
  );
}
