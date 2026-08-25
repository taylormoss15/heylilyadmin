"use client";

import { useState } from "react";

export default function UnsubButton({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    await fetch(`/api/unsubscribe/${id}`, { method: "POST" }).catch(() => {});
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return <p className="text-sm font-medium text-emerald-600">You&apos;re unsubscribed. Thank you.</p>;
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
    >
      {busy ? "…" : "Confirm unsubscribe"}
    </button>
  );
}
