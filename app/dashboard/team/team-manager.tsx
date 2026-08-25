"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  calendlyUrl: string | null;
  isMe: boolean;
}

export default function TeamManager({ users }: { users: User[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SALES", calendlyUrl: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not create the user.");
      return;
    }
    setForm({ name: "", email: "", password: "", role: "SALES", calendlyUrl: "" });
    setOpen(false);
    router.refresh();
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Calendly</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.name || "—"} {u.isMe && <span className="text-xs text-slate-400">(you)</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.role === "OWNER" ? "bg-slate-800 text-white" : "bg-brand-100 text-brand-700"}`}>
                    {u.role === "OWNER" ? "Owner" : "Sales"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {u.calendlyUrl ? <span className="text-emerald-600">✓ set</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <form onSubmit={create} className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Add a teammate</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            <input className="input" type="email" placeholder="email@heylily.ai" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            <input className="input" type="password" placeholder="Temporary password (8+ chars)" value={form.password} onChange={(e) => set("password", e.target.value)} required />
            <select className="input" value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="SALES">Sales rep</option>
              <option value="OWNER">Owner (full access)</option>
            </select>
            <input className="input sm:col-span-2" placeholder="Calendly link (optional)" value={form.calendlyUrl} onChange={(e) => set("calendlyUrl", e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn text-sm">{busy ? "Adding…" : "Add teammate"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="btn text-sm">+ Add teammate</button>
      )}
    </div>
  );
}
