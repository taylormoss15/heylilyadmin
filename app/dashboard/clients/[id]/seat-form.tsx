"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SeatForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState("GOOGLE_WORKSPACE");
  const [seatEmail, setSeatEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/seats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, seatEmail }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to provision seat");
      return;
    }
    setSeatEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <select className="input w-auto" value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="GOOGLE_WORKSPACE">Google Workspace</option>
        <option value="MICROSOFT_365">Microsoft 365</option>
      </select>
      <input
        type="email"
        required
        className="input"
        placeholder="name@client-domain.com"
        value={seatEmail}
        onChange={(e) => setSeatEmail(e.target.value)}
      />
      <button type="submit" className="btn-secondary text-sm" disabled={loading}>
        {loading ? "Provisioning…" : "Provision seat"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
