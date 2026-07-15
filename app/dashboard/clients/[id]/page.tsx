import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TIER_CONFIG } from "@/lib/tier-config";
import type { Tier } from "@/lib/types";
import ScanButton from "./scan-button";
import NoteForm from "./note-form";
import SeatForm from "./seat-form";
import SeatRow from "./seat-row";
import StatusEditor from "./status-editor";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 30 },
      remediationNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      uptimeIncidents: { orderBy: { startedAt: "desc" }, take: 20 },
      uptimeMonitor: true,
      emailSeats: true,
      ghlSyncLogs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!client) notFound();

  const openIncident = client.uptimeIncidents.find((i) => !i.resolvedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{client.name}</h1>
          <p className="text-sm text-slate-500">
            {client.domain ?? "no domain"} · {TIER_CONFIG[client.tier as Tier].label} ($
            {TIER_CONFIG[client.tier as Tier].monthlyPriceUsd}/mo)
            {client.ghlLocationId && <> · GHL location {client.ghlLocationId}</>}
          </p>
        </div>
        <StatusEditor clientId={client.id} status={client.status} tier={client.tier} />
      </div>

      {openIncident && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Site has been down since {new Date(openIncident.startedAt).toLocaleString()}
          {openIncident.reason ? ` — ${openIncident.reason}` : ""}. Internal alert only, per policy —
          no client-facing status page.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-900">Accessibility audit trail</h2>
            <ScanButton clientId={client.id} />
          </div>

          {client.accessibilityScans.length === 0 ? (
            <p className="text-sm text-slate-400">No scans yet.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-24 pb-2">Date</th>
                  <th className="pb-2">Score</th>
                  <th className="w-32 pb-2">Violations</th>
                </tr>
              </thead>
              <tbody>
                {client.accessibilityScans.map((scan) => (
                  <tr key={scan.id} className="border-t border-slate-100">
                    <td className="py-2 align-top">{new Date(scan.scannedAt).toLocaleDateString()}</td>
                    <td className="py-2 align-top">
                      {scan.status === "COMPLETED" ? (
                        scan.score ?? "—"
                      ) : (
                        <span
                          className="block truncate text-red-600"
                          title={scan.errorMessage ?? "failed"}
                        >
                          failed{scan.errorMessage ? `: ${scan.errorMessage}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-2 align-top">
                      {scan.status === "COMPLETED"
                        ? `${scan.violationCount} (${scan.seriousCount} serious)`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Remediation notes</h3>
            <NoteForm clientId={client.id} />
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {client.remediationNotes.map((note) => (
                <li key={note.id}>
                  <span className="text-slate-400">{new Date(note.createdAt).toLocaleDateString()}:</span>{" "}
                  {note.note}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-400">
            Public log for this client's site badge:{" "}
            <code className="rounded bg-slate-100 px-1">/api/compliance/{client.id}/log</code>
          </p>
        </section>

        <section className="card space-y-4">
          <h2 className="font-medium text-slate-900">Uptime incidents</h2>
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
                    {incident.resolvedAt ? ` → resolved ${new Date(incident.resolvedAt).toLocaleString()}` : " (ongoing)"}
                  </span>
                  {incident.reason && <div className="text-slate-500">{incident.reason}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-4 md:col-span-2">
          <h2 className="font-medium text-slate-900">Managed email seats</h2>
          <SeatForm clientId={client.id} />
          {client.emailSeats.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Provider</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {client.emailSeats.map((seat) => (
                  <SeatRow
                    key={seat.id}
                    clientId={client.id}
                    seatId={seat.id}
                    seatEmail={seat.seatEmail}
                    provider={seat.provider}
                    status={seat.status}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card space-y-2 md:col-span-2">
          <h2 className="font-medium text-slate-900">Recent GHL sync activity</h2>
          {client.ghlSyncLogs.length === 0 ? (
            <p className="text-sm text-slate-400">No sync activity yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-600">
              {client.ghlSyncLogs.map((log) => (
                <li key={log.id} className={log.success ? "" : "text-red-600"}>
                  {new Date(log.createdAt).toLocaleString()} — {log.action}
                  {!log.success && log.errorMessage ? `: ${log.errorMessage}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
