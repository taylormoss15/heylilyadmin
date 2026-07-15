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

export default function SiteList({ clientId, sites }: { clientId: string; sites: SiteRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Websites</h2>
        <button onClick={createSite} disabled={creating} className="btn-secondary text-sm">
          {creating ? "Creating…" : "+ New site"}
        </button>
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
