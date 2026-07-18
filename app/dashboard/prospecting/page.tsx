import { prisma } from "@/lib/prisma";
import ProspectsClient, { type ProspectRow, type Issue } from "./prospects-client";

export const dynamic = "force-dynamic";

function parseIssues(json: string | null): Issue[] {
  try {
    const arr = JSON.parse(json || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v) => v && typeof v.id === "string")
      .map((v) => ({
        id: v.id,
        impact: typeof v.impact === "string" ? v.impact : null,
        help: typeof v.help === "string" ? v.help : v.id,
        nodeCount: typeof v.nodeCount === "number" ? v.nodeCount : 0,
      }));
  } catch {
    return [];
  }
}

export default async function ProspectingPage() {
  // Converted prospects fall off the board — they live in Accounts now.
  const prospects = await prisma.prospect.findMany({
    where: { status: { not: "CONVERTED" } },
    orderBy: [{ score: "asc" }, { createdAt: "desc" }],
  });

  // Prevalence across everything we've scanned, for the "seen on N of M sites"
  // expert talking point in the details drawer.
  const scanned = prospects.filter((p) => p.scanStatus === "COMPLETED");
  const prevalence: Record<string, number> = {};
  for (const p of scanned) {
    const ids = new Set(parseIssues(p.violations).map((v) => v.id));
    for (const id of ids) prevalence[id] = (prevalence[id] ?? 0) + 1;
  }

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
    demoToken: p.demoToken,
    issues: parseIssues(p.violations),
  }));

  return <ProspectsClient initial={rows} prevalence={prevalence} totalScanned={scanned.length} />;
}
