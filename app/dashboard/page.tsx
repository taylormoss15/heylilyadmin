import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TIER_CONFIG } from "@/lib/tier-config";
import type { Tier } from "@/lib/types";

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
    churned: clients.filter((c) => c.status === "CHURNED").length,
    openIncidents: clients.filter((c) => c.uptimeIncidents.length > 0).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500">
            {clients.length} client{clients.length === 1 ? "" : "s"} · {counts.active} active ·{" "}
            {counts.atRisk} at risk · {counts.openIncidents} with open incidents
          </p>
        </div>
        <Link href="/dashboard/clients/new" className="btn">
          + New client
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last a11y scan</th>
              <th className="px-4 py-3">Uptime</th>
              <th className="px-4 py-3">Email seats</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const lastScan = client.accessibilityScans[0];
              const openIncident = client.uptimeIncidents[0];
              return (
                <tr key={client.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/clients/${client.id}`} className="font-medium text-brand-600 hover:underline">
                      {client.name}
                    </Link>
                    <div className="text-xs text-slate-500">{client.domain ?? "no domain set"}</div>
                  </td>
                  <td className="px-4 py-3">{TIER_CONFIG[client.tier as Tier].label}</td>
                  <td className="px-4 py-3">
                    <span className={`badge badge-${client.status.toLowerCase()}`}>
                      {client.status.replace("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lastScan ? (
                      <span>
                        {lastScan.status === "COMPLETED" ? `${lastScan.score ?? "—"} score` : "failed"} ·{" "}
                        {new Date(lastScan.scannedAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-slate-400">never scanned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {openIncident ? (
                      <span className="text-red-600 font-medium">down since {new Date(openIncident.startedAt).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-emerald-600">up</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{client._count.emailSeats}</td>
                </tr>
              );
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No clients yet. Add your first one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
