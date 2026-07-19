import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function DemosPage() {
  const demos = await prisma.demo.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const opened = demos.filter((d) => d.views > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Demos</h1>
        <p className="text-sm text-slate-500">
          {demos.length} demo{demos.length === 1 ? "" : "s"} generated · {opened} opened by the prospect
        </p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Compliance</th>
              <th className="px-4 py-3">Opens</th>
              <th className="px-4 py-3">Last opened</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Links</th>
            </tr>
          </thead>
          <tbody>
            {demos.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{d.businessName || hostOf(d.sourceUrl)}</div>
                  <div className="text-xs text-slate-500">{hostOf(d.sourceUrl)}</div>
                </td>
                <td className="px-4 py-3">
                  {d.beforeScore ?? "—"}
                  <span className="text-slate-400">/100</span>
                </td>
                <td className="px-4 py-3">
                  {d.views > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {d.views} open{d.views === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">not opened</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {d.lastViewedAt ? new Date(d.lastViewedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <Link href={`/demo/${d.token}`} target="_blank" className="text-brand-600 hover:underline">
                      Demo ↗
                    </Link>
                    <Link href={`/demo/${d.token}/report`} target="_blank" className="text-brand-600 hover:underline">
                      Scorecard ↗
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {demos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No demos yet. Generate one from a prospect on the Prospecting board.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
