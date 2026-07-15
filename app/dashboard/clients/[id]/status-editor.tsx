"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatusEditor({
  clientId,
  status,
  tier,
}: {
  clientId: string;
  status: string;
  tier: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function update(field: "status" | "tier", value: string) {
    setLoading(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-3">
      <select
        className="input w-auto text-sm"
        value={status}
        disabled={loading}
        onChange={(e) => update("status", e.target.value)}
      >
        <option value="ACTIVE">Active</option>
        <option value="AT_RISK">At risk</option>
        <option value="CHURNED">Churned</option>
      </select>
      <select
        className="input w-auto text-sm"
        value={tier}
        disabled={loading}
        onChange={(e) => update("tier", e.target.value)}
      >
        <option value="STARTER">Starter</option>
        <option value="PRO">Pro</option>
        <option value="PREMIUM">Premium</option>
      </select>
    </div>
  );
}
