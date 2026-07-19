"use client";

import { useState } from "react";

interface Teaser {
  ref: string;
  businessName: string | null;
  url: string;
  compliance: { score: number | null; serious: number; total: number };
  seo: { score: number | null };
  platform: string | null;
  buckets: { critical: number; warnings: number; passed: number };
}

function band(score: number | null, seo = false): { label: string; color: string } {
  if (score === null) return { label: seo ? "Not measured" : "Unscored", color: "#64748b" };
  if (seo) {
    if (score >= 80) return { label: "Strong", color: "#059669" };
    if (score >= 50) return { label: "Needs work", color: "#d97706" };
    return { label: "Poor", color: "#dc2626" };
  }
  if (score >= 100) return { label: "Compliant", color: "#059669" };
  if (score >= 85) return { label: "At risk", color: "#d97706" };
  if (score >= 60) return { label: "High risk", color: "#ea580c" };
  return { label: "Severe risk", color: "#dc2626" };
}

type Phase = "idle" | "scanning" | "teaser" | "revealed" | "declined";

export default function ScanApp({ ctaUrl }: { ctaUrl: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [teaser, setTeaser] = useState<Teaser | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setPhase("scanning");
    setError(null);
    try {
      const res = await fetch("/api/public/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Scan failed.");
        setPhase("idle");
        return;
      }
      setTeaser(data);
      setPhase("teaser");
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("idle");
    }
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (!teaser) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: teaser.ref, email, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Please try again.");
        return;
      }
      setIssues(Array.isArray(data.issues) ? data.issues : []);
      setPhase("revealed");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const cb = teaser ? band(teaser.compliance.score) : null;
  const sb = teaser ? band(teaser.seo.score, true) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <span className="text-base font-bold text-brand-600">Hey Lily</span>
        <a href={ctaUrl} target="_blank" rel="noreferrer" className="text-sm text-slate-500 hover:text-slate-800">
          heylily.ai
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20">
        {/* ---- Idle / scanning: the hook ---- */}
        {(phase === "idle" || phase === "scanning") && (
          <div className="pt-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Is your website a lawsuit waiting to happen?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              Get a free, instant scan of your site&apos;s accessibility (ADA/WCAG) risk and search/SEO health —
              the same two things that quietly cost small businesses customers and settlements.
            </p>

            <form onSubmit={runScan} className="mx-auto mt-8 flex max-w-lg flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1"
                placeholder="yourbusiness.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={phase === "scanning"}
              />
              <button type="submit" className="btn whitespace-nowrap" disabled={phase === "scanning"}>
                {phase === "scanning" ? "Scanning…" : "Scan my site — free"}
              </button>
            </form>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {phase === "scanning" && (
              <div className="mt-10 flex flex-col items-center gap-3 text-slate-500">
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-500" />
                <p className="text-sm">Loading your site and checking 40+ signals… this takes ~20 seconds.</p>
              </div>
            )}
          </div>
        )}

        {/* ---- Teaser + gate ---- */}
        {phase === "teaser" && teaser && cb && sb && (
          <div className="pt-4">
            <h1 className="text-2xl font-bold">Here&apos;s how {teaser.businessName || teaser.url} scored</h1>
            <p className="text-sm text-slate-500">{teaser.url}{teaser.platform ? ` · built on ${teaser.platform}` : ""}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ScoreTile cap="Compliance" score={teaser.compliance.score} band={cb} />
              <ScoreTile cap="Search / SEO" score={teaser.seo.score} band={sb} />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Bucket tone="crit" n={teaser.buckets.critical} label="Critical" />
              <Bucket tone="warn" n={teaser.buckets.warnings} label="Warnings" />
              <Bucket tone="pass" n={teaser.buckets.passed} label="Passed" />
            </div>

            {/* Lawsuit framing */}
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-red-700">Why this matters</p>
              <p className="mt-1">
                These ADA/accessibility lawsuits typically end in a <strong>$25,000–$50,000 settlement</strong> — or a
                long, painful legal fight you&apos;ll lose, because the site genuinely isn&apos;t compliant.
              </p>
              <p className="mt-2">
                It&apos;s unfair, and we hate that there are sharks who go after small businesses like this. That&apos;s
                exactly why Hey Lily exists — to give you a genuinely high-quality, fully-compliant site at a price
                that actually makes sense.
              </p>
            </div>

            {/* Gate */}
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">See your full report + a free redesign preview</h2>
              <p className="mt-1 text-sm text-slate-500">
                We&apos;ll show you exactly what&apos;s hurting you — and build you a free preview of a fully-compliant
                version of your site.
              </p>
              <form onSubmit={submitLead} className="mt-4 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                  <input
                    className="input"
                    type="email"
                    required
                    placeholder="you@business.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn w-full" disabled={submitting}>
                  {submitting ? "Unlocking…" : "Show me my full report — free"}
                </button>
              </form>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button
                onClick={() => setPhase("declined")}
                className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600"
              >
                No thanks — I&apos;m OK with my site being at risk
              </button>
            </div>
          </div>
        )}

        {/* ---- Revealed ---- */}
        {phase === "revealed" && teaser && (
          <div className="pt-4">
            <h1 className="text-2xl font-bold">Your full report</h1>
            <p className="text-sm text-slate-500">Here&apos;s exactly what&apos;s costing {teaser.businessName || "you"} customers and creating risk.</p>

            {issues.length > 0 && (
              <ul className="mt-5 space-y-2">
                {issues.map((it, i) => (
                  <li key={i} className="flex gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm">
                    <span className="text-red-500">✕</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 rounded-2xl bg-slate-900 p-6 text-center text-white">
              <h2 className="text-lg font-semibold">We&apos;ll build you a fully-compliant version — free to preview</h2>
              <p className="mt-1 text-sm text-slate-300">
                A bespoke redesign that fixes every one of these, scores 100/100 on compliance, and is built to win
                you more calls and bookings.
              </p>
              <a href={ctaUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-400">
                Book my free redesign preview →
              </a>
            </div>
          </div>
        )}

        {/* ---- Declined ---- */}
        {phase === "declined" && (
          <div className="pt-16 text-center">
            <h1 className="text-2xl font-bold">No pressure at all.</h1>
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              Your scan is saved. If you change your mind — or you&apos;d rather just see what a fully-compliant,
              modern version of your site could look like — we&apos;re here and happy to help.
            </p>
            <a href={ctaUrl} target="_blank" rel="noreferrer" className="btn mt-6 inline-block">
              Talk to Hey Lily
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

function ScoreTile({ cap, score, band }: { cap: string; score: number | null; band: { label: string; color: string } }) {
  return (
    <div className="rounded-xl border bg-white p-4 text-center" style={{ borderColor: band.color }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cap}</div>
      <div className="mt-1 text-4xl font-extrabold" style={{ color: band.color }}>
        {score ?? "—"}
        <span className="text-lg font-semibold text-slate-400">/100</span>
      </div>
      <div className="text-xs font-semibold" style={{ color: band.color }}>{band.label}</div>
    </div>
  );
}

function Bucket({ tone, n, label }: { tone: "crit" | "warn" | "pass"; n: number; label: string }) {
  const map = {
    crit: { box: "border-red-100 bg-red-50", chip: "bg-red-100 text-red-600", icon: "✕" },
    warn: { box: "border-amber-100 bg-amber-50", chip: "bg-amber-100 text-amber-600", icon: "⚠" },
    pass: { box: "border-emerald-100 bg-emerald-50", chip: "bg-emerald-100 text-emerald-600", icon: "✓" },
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${map.box}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${map.chip}`}>{map.icon}</span>
        <span className="font-bold text-slate-900">
          {n} {label}
        </span>
      </div>
    </div>
  );
}
