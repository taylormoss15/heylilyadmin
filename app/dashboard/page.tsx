import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ClientsTable, { type ClientRow } from "./clients-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 1 },
      uptimeIncidents: { where: { resolvedAt: null }, orderBy: { startedAt: "desc" }, take: 1 },
      _count: { select: { emailSeats: true } },
    },
  });

  const counts = {
    active: clients.filter((c) => c.status === "ACTIVE").length,
    atRisk: clients.filter((c) => c.status === "AT_RISK").length,
    openIncidents: clients.filter((c) => c.uptimeIncidents.length > 0).length,
  };

  const rows: ClientRow[] = clients.map((c) => {
    const lastScan = c.accessibilityScans[0];
    const openIncident = c.uptimeIncidents[0];
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      tier: c.tier,
      status: c.status,
      lastScan: lastScan
        ? { status: lastScan.status, score: lastScan.score, scannedAt: lastScan.scannedAt.toISOString() }
        : null,
      openIncidentSince: openIncident ? openIncident.startedAt.toISOString() : null,
      emailSeats: c._count.emailSeats,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            {clients.length} account{clients.length === 1 ? "" : "s"} · {counts.active} active ·{" "}
            {counts.atRisk} at risk · {counts.openIncidents} with open incidents
          </p>
        </div>
        <Link href="/dashboard/clients/new" className="btn">
          + New account
        </Link>
      </div>

      <ClientsTable clients={rows} />
    </div>
  );
}
