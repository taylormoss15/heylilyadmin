"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    domain: "",
    ghlLocationId: "",
    tier: "STARTER",
    hasTrackers: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        domain: form.domain || undefined,
        ghlLocationId: form.ghlLocationId || undefined,
        tier: form.tier,
        hasTrackers: form.hasTrackers,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(JSON.stringify(data.error ?? "Failed to create client"));
      return;
    }

    const { client } = await res.json();
    router.push(`/dashboard/clients/${client.id}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">New client</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Business name</label>
          <input
            required
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Domain</label>
          <input
            className="input"
            placeholder="example.com"
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">GHL Location ID</label>
          <input
            className="input"
            placeholder="from the sub-account URL / API"
            value={form.ghlLocationId}
            onChange={(e) => setForm({ ...form, ghlLocationId: e.target.value })}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tier</label>
          <select
            className="input"
            value={form.tier}
            onChange={(e) => setForm({ ...form, tier: e.target.value })}
          >
            <option value="STARTER">Starter — $197/mo</option>
            <option value="PRO">Pro — $397/mo</option>
            <option value="PREMIUM">Premium — $597/mo</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.hasTrackers}
            onChange={(e) => setForm({ ...form, hasTrackers: e.target.checked })}
          />
          Runs trackers/ad pixels (enables cookie consent banner)
        </label>

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Creating…" : "Create client"}
        </button>
      </form>
    </div>
  );
}
