import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TIER_CONFIG } from "@/lib/tier-config";
import type { Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

// Account overview: a scannable summary that links into each area. The heavy
// lifting for each section lives on its own sub-page under the sidebar.
export default async function ClientOverviewPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 1 },
      uptimeIncidents: { orderBy: { startedAt: "desc" }, take: 20 },
      uptimeMonitor: true,
      ghlSyncLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { emailSeats: true, sites: true, accessibilityScans: true } },
    },
  });

  if (!client) notFound();

  const base = `/dashboard/clients/${client.id}`;
  const lastScan = client.accessibilityScans[0];
  const openIncident = client.uptimeIncidents.find((i) => !i.resolvedAt);
  const lastLog = client.ghlSyncLogs[0];

  const cards = [
    {
      href: `${base}/website`,
      label: "Website",
      value: `${client._count.sites} site${client._count.sites === 1 ? "" : "s"}`,
      hint: "Design & AI editor",
    },
    {
      href: `${base}/compliance`,
      label: "Accessibility",
      value: lastScan
        ? lastScan.status === "COMPLETED"
          ? `${lastScan.violationCount === 0 ? "Fully compliant" : `${lastScan.violationCount} to fix`}`
          : "Last scan failed"
        : "Never scanned",
      hint: `${client._count.accessibilityScans} scan${client._count.accessibilityScans === 1 ? "" : "s"} on record`,
      tone: lastScan && lastScan.status === "COMPLETED" && lastScan.violationCount === 0 ? "good" : lastScan ? "warn" : "muted",
    },
    {
      href: `${base}/uptime`,
      label: "Uptime",
      value: openIncident ? "Down now" : client.uptimeMonitor ? "Up" : "No monitor",
      hint: client.uptimeMonitor ? client.uptimeMonitor.url : "Not registered yet",
      tone: openIncident ? "bad" : client.uptimeMonitor ? "good" : "muted",
    },
    {
      href: `${base}/email`,
      label: "Managed email",
      value: `${client._count.emailSeats} seat${client._count.emailSeats === 1 ? "" : "s"}`,
      hint: "Mailboxes",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{client.name}</h1>
        <p className="text-sm text-slate-500">
          {client.domain ?? "no domain"} · {TIER_CONFIG[client.tier as Tier].label} ($
          {TIER_CONFIG[client.tier as Tier].monthlyPriceUsd}/mo)
          {client.ghlLocationId && <> · GHL location {client.ghlLocationId}</>}
        </p>
      </div>

      {openIncident && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Site has been down since {new Date(openIncident.startedAt).toLocaleString()}
          {openIncident.reason ? ` — ${openIncident.reason}` : ""}. Internal alert only, per policy —
          no client-facing status page.{" "}
          <Link href={`${base}/uptime`} className="underline">
            View incidents
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card block transition hover:border-brand-500 hover:shadow-sm"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
            <div
              className={`mt-1 text-lg font-semibold ${
                c.tone === "good"
                  ? "text-emerald-600"
                  : c.tone === "bad"
                  ? "text-red-600"
                  : c.tone === "warn"
                  ? "text-amber-600"
                  : "text-slate-900"
              }`}
            >
              {c.value}
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">{c.hint}</div>
          </Link>
        ))}
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Latest GHL activity</div>
          <div className="mt-1 text-sm text-slate-700">
            {lastLog
              ? `${new Date(lastLog.createdAt).toLocaleString()} — ${lastLog.action}`
              : "No sync activity yet."}
          </div>
        </div>
        <Link href={`${base}/activity`} className="text-sm text-brand-600 hover:underline">
          View all →
        </Link>
      </div>
    </div>
  );
}
