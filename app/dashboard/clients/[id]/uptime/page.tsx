import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientUptimePage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      uptimeIncidents: { orderBy: { startedAt: "desc" }, take: 50 },
      uptimeMonitor: true,
    },
  });

  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Uptime</h1>
        <p className="text-sm text-slate-500">Incident history. Alerts are internal only — no client-facing status page.</p>
      </div>

      <section className="card space-y-4">
        {client.uptimeMonitor ? (
          <p className="text-xs text-slate-500">
            Monitoring {client.uptimeMonitor.url} via {client.uptimeMonitor.provider}
          </p>
        ) : (
          <p className="text-xs text-amber-600">No uptime monitor registered for this client yet.</p>
        )}

        {client.uptimeIncidents.length === 0 ? (
          <p className="text-sm text-slate-400">No incidents recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {client.uptimeIncidents.map((incident) => (
              <li key={incident.id} className="border-t border-slate-100 pt-2">
                <span className={incident.resolvedAt ? "text-slate-500" : "text-red-600 font-medium"}>
                  {new Date(incident.startedAt).toLocaleString()}
                  {incident.resolvedAt
                    ? ` → resolved ${new Date(incident.resolvedAt).toLocaleString()}`
                    : " (ongoing)"}
                </span>
                {incident.reason && <div className="text-slate-500">{incident.reason}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
