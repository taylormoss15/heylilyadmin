import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, cross-origin endpoint — this is what the footer accessibility
// badge on every client site calls to render its "last 30 days of checks"
// log. It's the client-facing view of the same scan data used internally,
// per the compliance-positioning decision: verifiable audit trail, not a
// static claim. Excluded from the admin auth gate in middleware.ts.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(_request: NextRequest, { params }: { params: { clientId: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.clientId },
    select: { id: true, name: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const scans = await prisma.accessibilityScan.findMany({
    where: { clientId: client.id, scannedAt: { gte: thirtyDaysAgo } },
    orderBy: { scannedAt: "desc" },
    select: {
      scannedAt: true,
      status: true,
      score: true,
      violationCount: true,
      seriousCount: true,
      passCount: true,
    },
  });

  const log = scans.map((scan) => ({
    checkedAt: scan.scannedAt.toISOString(),
    status: scan.status,
    score: scan.score,
    violationCount: scan.violationCount,
    seriousCount: scan.seriousCount,
    passCount: scan.passCount,
  }));

  return NextResponse.json(
    {
      client: { name: client.name },
      windowDays: 30,
      checkCadence: "weekly",
      checks: log,
    },
    { headers: CORS_HEADERS }
  );
}
