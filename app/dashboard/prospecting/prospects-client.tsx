"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { outcomeFor } from "@/lib/prospecting/issues";

export interface Issue {
  id: string;
  impact: string | null;
  help: string;
  nodeCount: number;
}

export interface ProspectRow {
  id: string;
  url: string;
  businessName: string | null;
  industry: string | null;
  estimatedRevenue: string | null;
  employees: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  scanStatus: string;
  scanError: string | null;
  score: number | null;
  violationCount: number;
  seriousCount: number;
  status: string;
  scannedAt: string | null;
  demoToken: string | null;
  issues: Issue[];
}

type SortKey = "score" | "businessName" | "url" | "industry" | "estimatedRevenue" | "employees";

// How risky a score reads. Per policy, anything below 100 carries exposure —
// so only a perfect score is "green".
function riskFor(score: number | null): { label: string; cls: string } {
  if (score === null) return { label: "—", cls: "text-slate-400" };
  if (score >= 100) return { label: "Compliant", cls: "text-emerald-600" };
  if (score >= 85) return { label: "At risk", cls: "text-amber-600" };
  if (score >= 60) return { label: "High risk", cls: "text-orange-600" };
  return { label: "Severe", cls: "text-red-600" };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ProspectsClient({
  initial,
  prevalence,
  totalScanned,
}: {
  initial: ProspectRow[];
  prevalence: Record<string, number>;
  totalScanned: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ProspectRow[]>(initial);
  const [urlsText, setUrlsText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);

  const [query, setQuery] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expanded, setExpanded] = useState<string | null>(null);

  function patchRow(id: string, patch: Partial<ProspectRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function addUrls(e: React.FormEvent) {
    e.preventDefault();
    const urls = urlsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setAdding(true);
    setAddMsg(null);
    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    setAdding(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAddMsg("Could not add those URLs.");
      return;
    }
    setUrlsText("");
    setAddMsg(
      `Added ${data.added}. ${data.duplicates} duplicate${data.duplicates === 1 ? "" : "s"} skipped` +
        (data.invalid ? `, ${data.invalid} invalid.` : ".")
    );
    if (Array.isArray(data.prospects) && data.prospects.length) {
      setRows((rs) => [...data.prospects.map(toRow), ...rs]);
    }
  }

  async function scanOne(id: string): Promise<ProspectRow | null> {
    const res = await fetch(`/api/prospects/${id}/scan`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.prospect) {
      const row = toRow(data.prospect);
      patchRow(id, row);
      return row;
    }
    return null;
  }

  async function scanPending() {
    const pending = rows.filter((r) => r.status === "PROSPECT" && r.scanStatus !== "COMPLETED");
    if (!pending.length) return;
    setScanning(true);
    setScanProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      await scanOne(pending[i].id);
      setScanProgress({ done: i + 1, total: pending.length });
    }
    setScanning(false);
    setScanProgress(null);
  }

  async function dismiss(id: string) {
    await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    patchRow(id, { status: "DISMISSED" });
  }

  async function restore(id: string) {
    await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PROSPECT" }),
    });
    patchRow(id, { status: "PROSPECT" });
  }

  async function remove(id: string) {
    await fetch(`/api/prospects/${id}`, { method: "DELETE" });
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  async function convert(id: string) {
    const res = await fetch(`/api/prospects/${id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.clientId) {
      router.push(`/dashboard/clients/${data.clientId}`);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (r.status === "DISMISSED" && !showDismissed) return false;
      if (q && !`${r.businessName ?? ""} ${r.url} ${r.industry ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "score") {
        // Unscanned sort last regardless of direction.
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return (a.score - b.score) * dir;
      }
      const av = (a[sortKey] ?? "").toString().toLowerCase();
      const bv = (b[sortKey] ?? "").toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [rows, query, showDismissed, sortKey, sortDir]);

  const pendingCount = rows.filter((r) => r.status === "PROSPECT" && r.scanStatus !== "COMPLETED").length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "score" ? "asc" : "asc");
    }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Prospecting</h1>
        <p className="text-sm text-slate-500">
          Run the compliance checker on any site to score its risk, then convert the best leads into accounts.
          Riskiest sites sort to the top.
        </p>
      </div>

      <form onSubmit={addUrls} className="card space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="urls">
          Add websites (one per line, or comma-separated)
        </label>
        <textarea
          id="urls"
          className="input min-h-[90px] w-full font-mono text-xs"
          placeholder={"competitor-one.com\nsomelocalbiz.com\nanother-site.com/"}
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button type="submit" className="btn text-sm" disabled={adding}>
            {adding ? "Adding…" : "Add & queue"}
          </button>
          <button
            type="button"
            onClick={scanPending}
            disabled={scanning || pendingCount === 0}
            className="btn-secondary text-sm"
          >
            {scanning && scanProgress
              ? `Scanning ${scanProgress.done}/${scanProgress.total}…`
              : `Scan pending (${pendingCount})`}
          </button>
          {addMsg && <span className="text-xs text-slate-500">{addMsg}</span>}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input w-full max-w-xs"
          placeholder="Search name, site, industry…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
          Show dismissed
        </label>
        <span className="text-xs text-slate-500">{visible.length} shown</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("score")}>Risk{arrow("score")}</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("businessName")}>Business{arrow("businessName")}</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("url")}>Website{arrow("url")}</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("industry")}>Industry{arrow("industry")}</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("estimatedRevenue")}>Est. revenue{arrow("estimatedRevenue")}</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("employees")}>Employees{arrow("employees")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const risk = riskFor(r.score);
              const isOpen = expanded === r.id;
              return (
                <FragmentRow
                  key={r.id}
                  r={r}
                  risk={risk}
                  isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : r.id)}
                  onScan={() => scanOne(r.id)}
                  onConvert={() => convert(r.id)}
                  onDismiss={() => dismiss(r.id)}
                  onRestore={() => restore(r.id)}
                  onRemove={() => remove(r.id)}
                  onPatch={(patch) => patchRow(r.id, patch)}
                  prevalence={prevalence}
                  totalScanned={totalScanned}
                />
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No prospects yet. Paste some websites above to score them.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Coming next: one-click PDF reports showing each site's score, top issues, and a preview of the
        fully-compliant redesign.
      </p>
    </div>
  );
}

function FragmentRow({
  r,
  risk,
  isOpen,
  onToggle,
  onScan,
  onConvert,
  onDismiss,
  onRestore,
  onRemove,
  onPatch,
  prevalence,
  totalScanned,
}: {
  r: ProspectRow;
  risk: { label: string; cls: string };
  isOpen: boolean;
  onToggle: () => void;
  onScan: () => void;
  onConvert: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<ProspectRow>) => void;
  prevalence: Record<string, number>;
  totalScanned: number;
}) {
  const [scanning, setScanning] = useState(false);
  const dimmed = r.status === "DISMISSED";

  async function runScan() {
    setScanning(true);
    await onScan();
    setScanning(false);
  }

  return (
    <>
      <tr className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${dimmed ? "opacity-50" : ""}`}>
        <td className="px-4 py-3">
          {r.scanStatus === "COMPLETED" ? (
            <span className={`font-semibold ${risk.cls}`}>
              {r.score}/100
              <span className="block text-[11px] font-normal">{risk.label}</span>
            </span>
          ) : r.scanStatus === "FAILED" ? (
            <span className="text-xs text-red-500" title={r.scanError ?? ""}>scan failed</span>
          ) : (
            <span className="text-xs text-slate-400">not scanned</span>
          )}
        </td>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-left font-medium text-brand-600 hover:underline">
            {r.businessName || hostOf(r.url)}
          </button>
        </td>
        <td className="px-4 py-3">
          <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">
            {hostOf(r.url)}
          </a>
        </td>
        <td className="px-4 py-3 text-slate-600">{r.industry || <span className="text-slate-300">—</span>}</td>
        <td className="px-4 py-3 text-slate-600">{r.estimatedRevenue || <span className="text-slate-300">—</span>}</td>
        <td className="px-4 py-3 text-slate-600">{r.employees || <span className="text-slate-300">—</span>}</td>
        <td className="px-4 py-3 text-right">
          <button onClick={onToggle} className="text-xs text-slate-500 hover:text-slate-800">
            {isOpen ? "Close" : "Details"}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/60">
          <td colSpan={7} className="px-4 py-4">
            <DetailsPanel
              r={r}
              scanning={scanning}
              onRunScan={runScan}
              onConvert={onConvert}
              onDismiss={onDismiss}
              onRestore={onRestore}
              onRemove={onRemove}
              onPatch={onPatch}
              prevalence={prevalence}
              totalScanned={totalScanned}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailsPanel({
  r,
  scanning,
  onRunScan,
  onConvert,
  onDismiss,
  onRestore,
  onRemove,
  onPatch,
  prevalence,
  totalScanned,
}: {
  r: ProspectRow;
  scanning: boolean;
  onRunScan: () => void;
  onConvert: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<ProspectRow>) => void;
  prevalence: Record<string, number>;
  totalScanned: number;
}) {
  const [fields, setFields] = useState({
    businessName: r.businessName ?? "",
    industry: r.industry ?? "",
    estimatedRevenue: r.estimatedRevenue ?? "",
    employees: r.employees ?? "",
    notes: r.notes ?? "",
  });
  const [saved, setSaved] = useState(false);

  async function saveFields() {
    const payload = {
      businessName: fields.businessName.trim() || null,
      industry: fields.industry.trim() || null,
      estimatedRevenue: fields.estimatedRevenue.trim() || null,
      employees: fields.employees.trim() || null,
      notes: fields.notes.trim() || null,
    };
    const res = await fetch(`/api/prospects/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      onPatch(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  const label = "block text-[11px] font-medium uppercase tracking-wide text-slate-500";
  const input = "input w-full text-sm";

  return (
    <div className="space-y-4">
    <IssuesSection r={r} prevalence={prevalence} totalScanned={totalScanned} />
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-3 md:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Business name</label>
            <input className={input} value={fields.businessName} onChange={(e) => setFields((f) => ({ ...f, businessName: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Industry</label>
            <input className={input} value={fields.industry} onChange={(e) => setFields((f) => ({ ...f, industry: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Est. revenue</label>
            <input className={input} placeholder="$1M–$5M" value={fields.estimatedRevenue} onChange={(e) => setFields((f) => ({ ...f, estimatedRevenue: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Employees</label>
            <input className={input} placeholder="11–50" value={fields.employees} onChange={(e) => setFields((f) => ({ ...f, employees: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className={label}>Notes</label>
          <textarea className="input min-h-[64px] w-full text-sm" value={fields.notes} onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveFields} className="btn-secondary text-sm">Save details</button>
          {saved && <span className="text-xs text-emerald-600">Saved.</span>}
          {(r.phone || r.email) && (
            <span className="text-xs text-slate-500">
              {r.phone && <>☎ {r.phone}</>} {r.email && <>· ✉ {r.email}</>}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">
          {r.scanStatus === "COMPLETED" ? (
            <>
              <span className="font-medium text-slate-700">{r.violationCount} violations</span> ({r.seriousCount} serious)
              {r.scannedAt && <> · scanned {new Date(r.scannedAt).toLocaleDateString()}</>}
            </>
          ) : r.scanStatus === "FAILED" ? (
            <span className="text-red-500">Scan failed: {r.scanError}</span>
          ) : (
            "Not scanned yet."
          )}
        </div>
        <button onClick={onRunScan} disabled={scanning} className="btn-secondary w-full text-sm">
          {scanning ? "Scanning…" : r.scanStatus === "COMPLETED" ? "Re-scan" : "Scan now"}
        </button>

        <DemoBlock prospectId={r.id} demoToken={r.demoToken} onGenerated={(t) => onPatch({ demoToken: t })} />

        <button onClick={onConvert} className="btn w-full text-sm">Convert to account →</button>
        <div className="flex gap-2">
          {r.status === "DISMISSED" ? (
            <button onClick={onRestore} className="btn-secondary flex-1 text-xs">Restore</button>
          ) : (
            <button onClick={onDismiss} className="btn-secondary flex-1 text-xs">Dismiss</button>
          )}
          <button onClick={onRemove} className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}

// The specific issues behind a prospect's score, with the "how common is this"
// prevalence stat and a ready-to-say expert talking point per issue. This is
// the internal operator view — full detail — so we CAN show the technical name
// here (unlike the customer-facing scorecard, which stays outcome-only).
function IssuesSection({
  r,
  prevalence,
  totalScanned,
}: {
  r: ProspectRow;
  prevalence: Record<string, number>;
  totalScanned: number;
}) {
  if (r.scanStatus !== "COMPLETED") return null;
  if (r.issues.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        ✓ No accessibility issues found — this site already passes. A rare one.
      </div>
    );
  }

  const sev = (i: Issue) => (i.impact === "critical" ? 0 : i.impact === "serious" ? 1 : 2);
  const ordered = [...r.issues].sort((a, b) => sev(a) - sev(b) || b.nodeCount - a.nodeCount);
  const top = ordered[0];
  const topSeen = prevalence[top.id] ?? 1;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <h4 className="text-sm font-semibold text-slate-900">
        Why this scores {r.score}/100 — {r.issues.length} issue{r.issues.length === 1 ? "" : "s"} found
      </h4>

      {/* Ready-to-say talking point */}
      <p className="mt-1 text-xs text-slate-600">
        Say it like an expert:{" "}
        <span className="italic">
          “{topSeen} of the {totalScanned} sites we&apos;ve scanned have this same issue. These are quick,
          low-cost fixes — they don&apos;t change how your site looks or works — but left alone they&apos;re an
          unforced error that exposes you to complaints and ADA claims.”
        </span>
      </p>

      <ul className="mt-3 space-y-2">
        {ordered.map((v, i) => {
          const seen = prevalence[v.id] ?? 1;
          const outcome = outcomeFor(v.id);
          const serious = v.impact === "serious" || v.impact === "critical";
          return (
            <li key={i} className="rounded-md border border-slate-200 bg-white p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${
                    serious ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {v.impact ?? "minor"}
                </span>
                <span className="text-sm font-medium text-slate-800">{v.help}</span>
                {v.nodeCount > 0 && (
                  <span className="text-xs text-slate-400">· {v.nodeCount} element{v.nodeCount === 1 ? "" : "s"}</span>
                )}
                {totalScanned > 0 && (
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    seen on {seen}/{totalScanned} sites
                  </span>
                )}
              </div>
              {outcome && <p className="mt-1 text-xs text-slate-500">{outcome}</p>}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11px] text-slate-400">
        Our builder fixes all of these automatically — generate the demo to show them the compliant version.
      </p>
    </div>
  );
}

// One-click sales demo: builds the interactive before/after redesign + the
// scorecard, both on public share links. Takes ~1 minute (scrape + AI design).
function DemoBlock({
  prospectId,
  demoToken,
  onGenerated,
}: {
  prospectId: string;
  demoToken: string | null;
  onGenerated: (token: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/demo`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        setError(typeof data.error === "string" ? data.error : "Demo generation failed");
        return;
      }
      onGenerated(data.token);
    } catch {
      setError("Demo generation failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function copy(path: string, label: string) {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 p-2.5">
      {busy ? (
        <div className="text-center text-xs text-slate-600">
          <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
          Building demo — scraping the site &amp; designing the new one… (~1 min)
        </div>
      ) : demoToken ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <a href={`/demo/${demoToken}`} target="_blank" rel="noreferrer" className="btn flex-1 text-center text-xs">
              Open demo ↗
            </a>
            <a href={`/demo/${demoToken}/report`} target="_blank" rel="noreferrer" className="btn-secondary flex-1 text-center text-xs">
              Scorecard ↗
            </a>
          </div>
          <div className="flex gap-2">
            <button onClick={() => copy(`/demo/${demoToken}`, "demo")} className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
              {copied === "demo" ? "Copied!" : "Copy demo link"}
            </button>
            <button onClick={() => copy(`/demo/${demoToken}/report`, "report")} className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
              {copied === "report" ? "Copied!" : "Copy scorecard link"}
            </button>
          </div>
          <button onClick={generate} className="w-full text-[11px] text-slate-500 hover:text-slate-800">
            Regenerate
          </button>
        </div>
      ) : (
        <button onClick={generate} className="btn w-full text-sm">
          ✨ Generate demo (before/after + scorecard)
        </button>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

function toRow(p: {
  id: string;
  url: string;
  businessName: string | null;
  industry: string | null;
  estimatedRevenue: string | null;
  employees: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  scanStatus: string;
  scanError: string | null;
  score: number | null;
  violationCount: number;
  seriousCount: number;
  status: string;
  scannedAt: string | null;
  demoToken: string | null;
  violations?: string | null;
}): ProspectRow {
  return {
    id: p.id,
    url: p.url,
    businessName: p.businessName,
    industry: p.industry,
    estimatedRevenue: p.estimatedRevenue,
    employees: p.employees,
    phone: p.phone,
    email: p.email,
    notes: p.notes,
    scanStatus: p.scanStatus,
    scanError: p.scanError,
    score: p.score,
    violationCount: p.violationCount,
    seriousCount: p.seriousCount,
    status: p.status,
    scannedAt: p.scannedAt,
    demoToken: p.demoToken,
    issues: parseIssuesJson(p.violations),
  };
}

function parseIssuesJson(json: string | null | undefined): Issue[] {
  try {
    const arr = JSON.parse(json || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v) => v && typeof v.id === "string")
      .map((v) => ({
        id: v.id,
        impact: typeof v.impact === "string" ? v.impact : null,
        help: typeof v.help === "string" ? v.help : v.id,
        nodeCount: typeof v.nodeCount === "number" ? v.nodeCount : 0,
      }));
  } catch {
    return [];
  }
}
