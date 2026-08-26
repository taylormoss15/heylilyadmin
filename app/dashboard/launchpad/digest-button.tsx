"use client";

import { useState } from "react";

// Sends the paid-but-not-live digest to the logged-in owner right now, so they
// can pull the list on demand and verify the daily email actually works.
export default function DigestButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/launchpad/digest", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMsg(`Sent to ${data.to} · ${data.pending} waiting`);
      } else {
        setMsg(typeof data.reason === "string" ? data.reason : "Could not send — check RESEND_API_KEY.");
      }
    } catch {
      setMsg("Could not send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={send} disabled={busy} className="btn-secondary text-sm">
        {busy ? "Sending…" : "✉️ Email me this now"}
      </button>
      {msg ? (
        <span className="text-[11px] text-slate-500">{msg}</span>
      ) : (
        <span className="text-[11px] text-slate-400">Daily to {email}</span>
      )}
    </div>
  );
}
