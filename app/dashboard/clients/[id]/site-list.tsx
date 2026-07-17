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
        {importResult && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                {importResult.extracted.businessName}
              </span>
              <span className={`badge ${(importResult.riskScore ?? 0) >= 90 ? "badge-active" : "badge-at_risk"}`}>
                Risk score: {importResult.riskScore ?? "—"}/100
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {importResult.violationCount} accessibility issue{importResult.violationCount === 1 ? "" : "s"} found
              ({importResult.seriousCount} serious) ·{" "}
              {[importResult.extracted.phone, importResult.extracted.email, importResult.extracted.address]
                .filter(Boolean).length}{" "}
              contact detail(s) pulled
            </p>
            <Link href={`/dashboard/sites/${importResult.siteId}`} className="btn text-sm inline-block">
              Open &amp; redesign with AI →
            </Link>
          </div>
        )}
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
