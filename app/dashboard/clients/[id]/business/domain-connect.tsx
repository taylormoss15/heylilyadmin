"use client";

import { useState } from "react";

// Connect a client's domain to Cloudflare while they keep their registrar:
// create the zone, show the two nameservers to set, and re-check activation.
export default function DomainConnect({
  clientId,
  domain,
  initialNameServers,
  initialStatus,
}: {
  clientId: string;
  domain: string | null;
  initialNameServers: string[];
  initialStatus: string | null;
}) {
  const [nameServers, setNameServers] = useState<string[]>(initialNameServers);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/connect-domain`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not connect the domain.");
        return;
      }
      setNameServers(Array.isArray(data.nameServers) ? data.nameServers : []);
      setStatus(data.status ?? null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function copy(v: string) {
    navigator.clipboard?.writeText(v).then(() => {
      setCopied(v);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const active = status === "active";
  const connected = nameServers.length > 0;

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-medium text-slate-900">Domain &amp; hosting</h2>
        <p className="text-xs text-slate-500">
          Keep the domain where it is — just repoint the nameservers to Cloudflare for fast hosting + free SSL.
        </p>
      </div>

      {!domain ? (
        <p className="text-sm text-amber-600">Set the domain above and save, then connect it here.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-800">{domain}</span>
            {connected && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {active ? "Active ✓" : "Pending nameservers"}
              </span>
            )}
            <button onClick={connect} disabled={busy} className="btn-secondary ml-auto text-sm">
              {busy ? "Working…" : connected ? "Re-check status" : "Connect to Cloudflare"}
            </button>
          </div>

          {connected && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-600">
                At the domain&apos;s registrar (GoDaddy, Namecheap, etc.), replace the nameservers with these two:
              </p>
              <div className="mt-2 space-y-1.5">
                {nameServers.map((ns) => (
                  <div key={ns} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-1.5">
                    <code className="text-sm text-slate-800">{ns}</code>
                    <button onClick={() => copy(ns)} className="text-[11px] text-brand-600 hover:underline">
                      {copied === ns ? "Copied!" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {active
                  ? "Live on Cloudflare. Deploy the site and the custom domain attaches automatically."
                  : "It activates automatically once the new nameservers propagate (a few minutes to a few hours). Click Re-check to update."}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </section>
  );
}
