"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SiteRow {
  id: string;
  name: string;
  status: string;
  pageCount: number;
}

interface ImportResult {
  riskScore: number | null;
  violationCount: number;
  seriousCount: number;
  extracted: { businessName: string; phone: string | null; email: string | null; address: string | null; services: string[] };
  siteId: string;
}

export default function SiteList({ clientId, sites }: { clientId: string; sites: SiteRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function createSite() {
    setCreating(true);
    const res = await fetch(`/api/clients/${clientId}/sites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setCreating(false);
    if (res.ok) {
      const { site } = await res.json();
      router.push(`/dashboard/sites/${site.id}`);
    }
  }

  async function importSite() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    const res = await fetch(`/api/clients/${clientId}/sites/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: importUrl }),
    });
    setImporting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImportError(typeof data.error === "string" ? data.error : "Import failed");
      return;
    }
    setImportResult({ ...data, siteId: data.site.id });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Websites</h2>
        <button onClick={createSite} disabled={creating} className="btn-secondary text-sm">
          {creating ? "Creating…" : "+ New site"}
        </button>
      </div>

      {/* Import an existing site — scrapes content + scores its accessibility risk. */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Import from an existing website
        </label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="theirexistingsite.com"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
          />
          <button onClick={importSite} disabled={importing} className="btn text-sm whitespace-nowrap">
            {importing ? "Analyzing…" : "Analyze & import"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Pulls their content, phone, email &amp; address, and scores their current site&apos;s accessibility risk.
        </p>
        {importError && <p className="text-sm text-red-600">{importError}</p>}
        {importResult && (() => {
          const total = importResult.violationCount;
          const serious = importResult.seriousCount;
          const clean = total === 0;
          const contactCount = [importResult.extracted.phone, importResult.extracted.email, importResult.extracted.address].filter(Boolean).length;
          const containerTone = clean
            ? "border-emerald-200 bg-emerald-50"
            : serious > 0
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50";
          return (
            <div className={`rounded-lg border p-3 space-y-2 ${containerTone}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{importResult.extracted.businessName}</span>
                <span className={`badge ${clean ? "bg-emerald-100 text-emerald-800" : serious > 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                  {clean ? "✓ Compliant" : serious > 0 ? "⚠ At risk — serious issues" : "⚠ Accessibility issues"}
                </span>
              </div>
              {clean ? (
                <p className="text-xs text-emerald-700">No accessibility issues detected on their current site.</p>
              ) : (
                <p className={`text-xs ${serious > 0 ? "text-red-700" : "text-amber-700"}`}>
                  <strong>
                    {total} accessibility {total === 1 ? "issue" : "issues"} found
                    {serious > 0 ? ` — ${serious} serious` : ""}.
                  </strong>{" "}
                  Under the ADA, each is potential legal exposure for this business. (Compliance score {importResult.riskScore ?? "—"}/100 — anything below 100 means unresolved issues.)
                </p>
              )}
              <p className="text-xs text-slate-500">{contactCount} contact detail(s) pulled from their site.</p>
              <Link href={`/dashboard/sites/${importResult.siteId}`} className="btn text-sm inline-block">
                Open &amp; redesign with AI →
              </Link>
            </div>
          );
        })()}
      </div>

      {sites.length === 0 ? (
        <p className="text-sm text-slate-400">
          No website yet. Create one to start from a compliance-ready template.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sites.map((site) => (
            <li key={site.id} className="flex items-center justify-between py-2">
              <div>
                <Link href={`/dashboard/sites/${site.id}`} className="font-medium text-brand-600 hover:underline">
                  {site.name}
                </Link>
                <div className="text-xs text-slate-500">
                  {site.pageCount} page{site.pageCount === 1 ? "" : "s"}
                </div>
              </div>
              <span className={`badge ${site.status === "PUBLISHED" ? "badge-active" : "badge-churned"}`}>
                {site.status.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
