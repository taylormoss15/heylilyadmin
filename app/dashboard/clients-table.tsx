"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TIER_CONFIG } from "@/lib/tier-config";
import type { Tier } from "@/lib/types";

export interface ClientRow {
  id: string;
  name: string;
  domain: string | null;
  tier: string;
  status: string;
  lastScan: { status: string; score: number | null; scannedAt: string } | null;
  openIncidentSince: string | null;
  emailSeats: number;
}

const STATUSES = ["ALL", "ACTIVE", "AT_RISK", "CHURNED"] as const;
const TIERS = ["ALL", "STARTER", "PRO", "PREMIUM"] as const;

// Filterable accounts list. Search matches name/domain; status and tier narrow
// the list. All client-side over the rows the server already loaded.
export default function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (status !== "ALL" && c.status !== status) return false;
      if (tier !== "ALL" && c.tier !== tier) return false;
      if (q && !`${c.name} ${c.domain ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clients, query, status, tier]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input w-full max-w-xs"
          placeholder="Search name or domain…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input w-auto text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All statuses" : s.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
        <select className="input w-auto text-sm" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? "All tiers" : TIER_CONFIG[t as Tier].label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {filtered.length} of {clients.length}
        </span>
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
            {filtered.map((client) => (
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
                  {client.lastScan ? (
                    <span>
                      {client.lastScan.status === "COMPLETED" ? `${client.lastScan.score ?? "—"} score` : "failed"} ·{" "}
                      {new Date(client.lastScan.scannedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-slate-400">never scanned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {client.openIncidentSince ? (
                    <span className="font-medium text-red-600">
                      down since {new Date(client.openIncidentSince).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-emerald-600">up</span>
                  )}
                </td>
                <td className="px-4 py-3">{client.emailSeats}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {clients.length === 0
                    ? "No clients yet. Add your first one to get started."
                    : "No accounts match those filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
