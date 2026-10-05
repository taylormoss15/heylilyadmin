"use client";

import { useState } from "react";

export default function AdminPreviewBanner({ prospectId, recipients, reviewStatus, blocked, aiConfigured }: {
  prospectId: string;
  recipients: string[];
  reviewStatus: string;
  blocked: string | null;
  aiConfigured: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(reviewStatus === "APPROVED");

  async function act(edit: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/${edit ? "demo/edit" : "review"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit ? { instruction } : { status: "APPROVED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed. Please try again.");
      if (edit) {
        // Reload both the rendered site iframe and the report screenshots.
        window.location.reload();
      } else {
        setApproved(true);
        setMessage("Approved and queued for sending. No email has been sent.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Admin website review" className="border-b border-indigo-200 bg-indigo-50 px-4 py-3 text-slate-900 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">AI website changes</h2>
          <p className="break-words text-xs">Send to: {recipients.length ? recipients.join(", ") : "No recipient email — add one in the dashboard."}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void act(true); }} className="flex flex-wrap items-center gap-2">
          <label htmlFor="ai-preview-change" className="sr-only">Describe your website changes</label>
          <input id="ai-preview-change" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Describe a quick website change…" disabled={busy || !aiConfigured} className="w-72 max-w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={busy || !aiConfigured || !instruction.trim()} className="btn-secondary text-sm disabled:opacity-50">{busy ? "Working…" : "Apply AI changes"}</button>
        </form>
        <button onClick={() => void act(false)} disabled={busy || approved || Boolean(blocked) || Boolean(instruction.trim())} className="btn text-sm disabled:opacity-50">{approved ? "Approved — queued" : "Approve & Queue"}</button>
      </div>
      <div aria-live="polite" className="mx-auto max-w-7xl text-xs">
        {!aiConfigured && <p className="mt-2">AI editing is not configured for this environment.</p>}
        {blocked && <p className="mt-2">{blocked}</p>}
        {instruction.trim() && <p className="mt-2">Apply your changes or clear the text before approving.</p>}
        {message && <p className="mt-2">{message}</p>}
      </div>
    </section>
  );
}
