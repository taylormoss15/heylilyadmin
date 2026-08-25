import { prisma } from "@/lib/prisma";
import type { AeoCheck } from "@/lib/prospecting/aeo";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import ProspectsClient, { type ProspectRow, type Issue } from "./prospects-client";

export const dynamic = "force-dynamic";

function parseAeoChecks(json: string | null): AeoCheck[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

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
  const me = await getCurrentUser();
  const owner = isOwner(me);

  // Converted prospects fall off the board — they live in Accounts now.
  const prospects = await prisma.prospect.findMany({
    where: { status: { not: "CONVERTED" } },
    orderBy: [{ trustScore: "asc" }, { createdAt: "desc" }],
  });

  const reps = await prisma.adminUser.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } });
  const repName = new Map(reps.map((r) => [r.id, r.name || r.email]));

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
    platform: p.platform,
    builtBy: p.builtBy,
    professionalism: p.professionalism,
    professionalismNote: p.professionalismNote,
    aeoScore: p.aeoScore,
    aeoChecks: parseAeoChecks(p.aeoChecks),
    source: p.source,
    leadEmail: p.leadEmail,
    leadName: p.leadName,
    trustScore: p.trustScore,
    trustBreakdown: p.trustBreakdown,
    ownerId: p.ownerId,
    ownerName: p.ownerId ? repName.get(p.ownerId) ?? null : null,
    demoBooked: p.demoBookedAt != null,
    bookedWith: p.bookedWith,
    emailed: p.emailedAt != null,
    unsubscribed: p.unsubscribedAt != null,
    hasEmail: Boolean(p.email || p.leadEmail),
  }));

  return (
    <ProspectsClient
      initial={rows}
      prevalence={prevalence}
      totalScanned={scanned.length}
      currentUser={me ? { id: me.id, name: me.name || me.email, isOwner: owner } : null}
      reps={reps.map((r) => ({ id: r.id, name: r.name || r.email }))}
    />
  );
}
