import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ScanButton from "../scan-button";
import NoteForm from "../note-form";

export const dynamic = "force-dynamic";

interface StoredViolation {
  id: string;
  impact: string | null;
  help: string;
  nodeCount: number;
}

function parseViolations(json: string): StoredViolation[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default async function ClientCompliancePage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 30 },
      remediationNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      sites: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });

  if (!client) notFound();

  const latest = client.accessibilityScans.find((s) => s.status === "COMPLETED");
  const latestIssues = latest && latest.violationCount > 0 ? parseViolations(latest.violations) : [];

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

      {latestIssues.length > 0 && (
        <section className="card space-y-3 border-amber-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium text-slate-900">What to fix</h2>
              <p className="text-xs text-slate-500">
                The exact issues from the latest scan. Fastest fix: open the builder and click
                “Fix accessibility with AI,” then re-scan.
              </p>
            </div>
            <Link
              href={`/dashboard/clients/${client.id}/website`}
              className="btn shrink-0 text-sm"
            >
              Fix in website builder →
            </Link>
          </div>
          <ul className="space-y-1.5 text-sm">
            {latestIssues.map((v, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${
                    v.impact === "serious" || v.impact === "critical"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {v.impact ?? "minor"}
                </span>
                <span className="text-slate-700">
                  {v.help}
                  {v.nodeCount ? <span className="text-slate-400"> · {v.nodeCount} element{v.nodeCount === 1 ? "" : "s"}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
