import { prisma } from "@/lib/prisma";
import ProspectsClient, { type ProspectRow } from "./prospects-client";

export const dynamic = "force-dynamic";

export default async function ProspectingPage() {
  // Converted prospects fall off the board — they live in Accounts now.
  const prospects = await prisma.prospect.findMany({
    where: { status: { not: "CONVERTED" } },
    orderBy: [{ score: "asc" }, { createdAt: "desc" }],
  });

  const rows: ProspectRow[] = prospects.map((p) => ({
    id: p.id,
    url: p.url,
    businessName: p.businessName,
    industry: p.industry,
    estimatedRevenue: p.estimatedRevenue,
    employees: p.employees,
    phone: p.phone,
    email: p.email,
    notes: p.notes,
    scanStatus: p.scanStatus,
    scanError: p.scanError,
    score: p.score,
    violationCount: p.violationCount,
    seriousCount: p.seriousCount,
    status: p.status,
    scannedAt: p.scannedAt ? p.scannedAt.toISOString() : null,
  }));

  return <ProspectsClient initial={rows} />;
}
