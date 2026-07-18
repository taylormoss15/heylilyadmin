import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanProspect } from "@/lib/prospecting/scan";

// Run (or re-run) the compliance scan for a single prospect. The UI calls
// this per row so a big list scans incrementally instead of one giant request.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  try {
    const result = await scanProspect(prospect.url);
    const updated = await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        // Only fill fields we don't already have (respect operator edits).
        businessName: prospect.businessName || result.businessName || null,
        phone: prospect.phone || result.phone || null,
        email: prospect.email || result.email || null,
        industry: prospect.industry || result.industry || null,
        employees: prospect.employees || result.employees || null,
        estimatedRevenue: prospect.estimatedRevenue || result.estimatedRevenue || null,
        // Objective site intelligence — refresh on every scan.
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
      },
    });
    return NextResponse.json({ prospect: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    const updated = await prisma.prospect.update({
      where: { id: prospect.id },
      data: { scanStatus: "FAILED", scanError: message.slice(0, 300), scannedAt: new Date() },
    });
    return NextResponse.json({ prospect: updated, error: message }, { status: 200 });
  }
}
