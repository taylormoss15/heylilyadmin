import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ScanButton from "../scan-button";
import NoteForm from "../note-form";

export const dynamic = "force-dynamic";

export default async function ClientCompliancePage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 30 },
      remediationNotes: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!client) notFound();

  const latest = client.accessibilityScans.find((s) => s.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Accessibility compliance</h1>
          <p className="text-sm text-slate-500">
            The audit trail behind this client's public compliance badge.
          </p>
        </div>
        <ScanButton clientId={client.id} />
      </div>

      {latest && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            latest.violationCount === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {latest.violationCount === 0 ? (
            <>Fully compliant as of {new Date(latest.scannedAt).toLocaleDateString()} — 0 violations. The public badge reads compliant.</>
          ) : (
            <>
              {latest.violationCount} open violation{latest.violationCount === 1 ? "" : "s"} ({latest.seriousCount}{" "}
              serious) as of {new Date(latest.scannedAt).toLocaleDateString()}. The badge stays honest — fix these before it reads compliant.
            </>
          )}
        </div>
      )}

      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Audit trail</h2>
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
                      <span className="block truncate text-red-600" title={scan.errorMessage ?? "failed"}>
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
    </div>
  );
}
