"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Mark an account paid / not paid. Until checkout auto-sets it, the operator
// flips this when a customer buys — which puts them on the Launchpad.
export default function PaidToggle({ clientId, paid }: { clientId: string; paid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: boolean) {
    setBusy(true);
    await fetch(`/api/clients/${clientId}/paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: next }),
    });
    setBusy(false);
    router.refresh();
  }

  return paid ? (
    <button onClick={() => set(false)} disabled={busy} className="text-xs text-slate-400 hover:text-slate-600">
      {busy ? "…" : "Mark unpaid"}
    </button>
  ) : (
    <button onClick={() => set(true)} disabled={busy} className="btn text-sm">
      {busy ? "…" : "Mark as paid"}
    </button>
  );
}
