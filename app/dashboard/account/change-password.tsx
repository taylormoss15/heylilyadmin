"use client";

import { useState } from "react";

export default function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (form.newPassword.length < 8) return setMsg({ ok: false, text: "New password must be at least 8 characters." });
    if (form.newPassword !== form.confirm) return setMsg({ ok: false, text: "The new passwords don't match." });

    setBusy(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setMsg({ ok: true, text: "Password changed. Use it next time you log in." });
    } else {
      setMsg({ ok: false, text: typeof data.error === "string" ? data.error : "Could not change your password." });
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-md space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">Change your password</h2>
      <input
        className="input w-full text-sm"
        type="password"
        autoComplete="current-password"
        placeholder="Current password"
        value={form.currentPassword}
        onChange={(e) => set("currentPassword", e.target.value)}
        required
      />
      <input
        className="input w-full text-sm"
        type="password"
        autoComplete="new-password"
        placeholder="New password (8+ characters)"
        value={form.newPassword}
        onChange={(e) => set("newPassword", e.target.value)}
        required
      />
      <input
        className="input w-full text-sm"
        type="password"
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={form.confirm}
        onChange={(e) => set("confirm", e.target.value)}
        required
      />
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      <button type="submit" disabled={busy} className="btn text-sm">{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
