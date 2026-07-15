"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NoteForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setLoading(true);
    await fetch(`/api/clients/${clientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setNote("");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        className="input"
        placeholder="Log a remediation note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="btn-secondary text-sm" disabled={loading}>
        Add
      </button>
    </form>
  );
}
