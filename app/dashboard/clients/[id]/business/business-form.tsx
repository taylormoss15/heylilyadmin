"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Values {
  name: string;
  domain: string;
  siteUrl: string;
  ghlLocationId: string;
  hostingProvider: string;
  domainRegistrar: string;
  dnsProvider: string;
  internalNotes: string;
  hasTrackers: boolean;
}

// Business/ops details for an account — the stuff we need when troubleshooting.
// Saves straight to the client record via PATCH.
export default function BusinessForm({ clientId, initial }: { clientId: string; initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // Send empty strings as null so we clear rather than store "".
    const payload = {
      name: values.name.trim() || undefined,
      domain: values.domain.trim() || null,
      siteUrl: values.siteUrl.trim() || null,
      ghlLocationId: values.ghlLocationId.trim() || null,
      hostingProvider: values.hostingProvider.trim() || null,
      domainRegistrar: values.domainRegistrar.trim() || null,
      dnsProvider: values.dnsProvider.trim() || null,
      internalNotes: values.internalNotes.trim() || null,
      hasTrackers: values.hasTrackers,
    };
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not save. Check the site URL is a full https:// address.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const field = "input w-full";
  const label = "block text-xs font-medium uppercase tracking-wide text-slate-500";

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-medium text-slate-900">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="bf-name">Business name</label>
            <input id="bf-name" className={field} value={values.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="bf-domain">Domain</label>
            <input id="bf-domain" className={field} placeholder="example.com" value={values.domain} onChange={(e) => set("domain", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="bf-siteurl">Site URL (scan/monitor target)</label>
            <input id="bf-siteurl" className={field} placeholder="https://example.com" value={values.siteUrl} onChange={(e) => set("siteUrl", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="bf-ghl">GHL location ID</label>
            <input id="bf-ghl" className={field} value={values.ghlLocationId} onChange={(e) => set("ghlLocationId", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-medium text-slate-900">Hosting & domain</h2>
          <p className="text-xs text-slate-500">Where things live, so anyone on the team can troubleshoot fast.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="bf-host">Hosting provider</label>
            <input id="bf-host" className={field} placeholder="Coolify / Lightsail" value={values.hostingProvider} onChange={(e) => set("hostingProvider", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="bf-reg">Domain registrar</label>
            <input id="bf-reg" className={field} placeholder="GoDaddy" value={values.domainRegistrar} onChange={(e) => set("domainRegistrar", e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="bf-dns">DNS provider</label>
            <input id="bf-dns" className={field} placeholder="Cloudflare" value={values.dnsProvider} onChange={(e) => set("dnsProvider", e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={values.hasTrackers} onChange={(e) => set("hasTrackers", e.target.checked)} />
          Site uses trackers / cookies (shows a cookie banner on published sites)
        </label>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-medium text-slate-900">Internal notes</h2>
          <p className="text-xs text-slate-500">Troubleshooting history, gotchas, credentials location, anything future-you needs.</p>
        </div>
        <textarea
          className="input min-h-[140px] w-full"
          placeholder="e.g. DNS A record points to 34.x.x.x. Client manages their own GoDaddy login. Rezdy booking embedded on /book."
          value={values.internalNotes}
          onChange={(e) => set("internalNotes", e.target.value)}
        />
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
