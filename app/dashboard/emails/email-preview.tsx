"use client";

import { useState } from "react";

interface Sample {
  key: string;
  label: string;
  description: string;
  subject: string;
  html: string;
}

export default function EmailPreview({ samples }: { samples: Sample[] }) {
  const [active, setActive] = useState(samples[0]?.key ?? "");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sample = samples.find((s) => s.key === active) ?? samples[0];

  async function sendTest() {
    if (!sample) return;
    setSending(true);
    setMsg(null);
    const res = await fetch("/api/email/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: sample.key }),
    });
    setSending(false);
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Sent a test to ${data.to}. Check your inbox.` : data.error || "Could not send the test.");
  }

  if (!sample) return null;
  const width = device === "phone" ? 390 : 680;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      {/* Template list */}
      <div className="space-y-1">
        {samples.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              s.key === active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s.label}
            <span className="block text-[11px] font-normal text-slate-400">{s.description}</span>
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(["desktop", "phone"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`rounded-md px-3 py-1 capitalize ${device === d ? "bg-slate-800 text-white" : "text-slate-600"}`}
              >
                {d}
              </button>
            ))}
          </div>
          <button onClick={sendTest} disabled={sending} className="btn ml-auto text-sm">
            {sending ? "Sending…" : "Send test to me"}
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          <span className="text-slate-400">Subject:</span> <span className="font-medium text-slate-800">{sample.subject}</span>
        </div>
        {msg && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{msg}</p>}

        <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100 p-3">
          <iframe
            key={sample.key + device}
            title={`${sample.label} preview`}
            srcDoc={sample.html}
            className="mx-auto block rounded bg-white"
            style={{ width, height: 620, border: 0, maxWidth: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
