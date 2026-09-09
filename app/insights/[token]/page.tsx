import { prisma } from "@/lib/prisma";
import { verifyInsightToken } from "@/lib/insights/token";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

function fmtDay(d: string) {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function InsightsPage({ params }: { params: { token: string } }) {
  const ok = verifyInsightToken(params.token);
  if (!ok) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="text-3xl">🔒</div>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">This link has expired</h1>
        <p className="mt-2 text-sm text-slate-500">
          For privacy, insight links stop working after a while. Check your latest Hey Lily report email for a fresh link.
        </p>
      </div>
    );
  }

  const client = await prisma.client.findUnique({ where: { id: ok.clientId } });
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const metrics = await prisma.siteMetric.findMany({
    where: { clientId: ok.clientId, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  const sum = (k: "pageviews" | "telTaps" | "formFills", days?: number) => {
    const cutoff = days ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
    return metrics.filter((m) => !cutoff || m.date >= cutoff).reduce((n, m) => n + m[k], 0);
  };

  const last30 = metrics.slice(-30);
  const maxViews = Math.max(1, ...last30.map((m) => m.pageviews));

  const tiles = [
    { label: "Website visits", v30: sum("pageviews", 30), vAll: sum("pageviews") },
    { label: "Calls tapped", v30: sum("telTaps", 30), vAll: sum("telTaps") },
    { label: "Contact forms", v30: sum("formFills", 30), vAll: sum("formFills") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-bold tracking-tight text-brand-600">Hey Lily</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{client?.name || "Your website"} — the numbers</h1>
          {client?.domain && <p className="text-sm text-slate-500">{client.domain}</p>}
        </div>
        <span className="text-xs text-slate-400">Last 90 days</span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-4xl font-extrabold text-slate-900">{t.v30.toLocaleString()}</div>
            <div className="mt-1 text-sm font-medium text-slate-600">{t.label}</div>
            <div className="mt-1 text-xs text-slate-400">last 30 days · {t.vAll.toLocaleString()} in 90</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Website visits, last 30 days</h2>
        {last30.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No visits recorded yet — data appears here as people find your site.</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-1">
            {last30.map((m) => (
              <div key={m.date} className="group relative flex-1" title={`${fmtDay(m.date)}: ${m.pageviews} visits`}>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-brand-500 to-fuchsia-500"
                  style={{ height: `${Math.max(2, (m.pageviews / maxViews) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
        {last30.length > 0 && (
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>{fmtDay(last30[0].date)}</span>
            <span>{fmtDay(last30[last30.length - 1].date)}</span>
          </div>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        Hey Lily manages this website and reports what it&apos;s doing for your business. This private link expires for your security.
      </p>
    </div>
  );
}
