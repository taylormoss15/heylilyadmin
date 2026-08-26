"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { outcomeFor } from "@/lib/prospecting/issues";
import type { AeoCheck } from "@/lib/prospecting/aeo";
import { trustBand } from "@/lib/prospecting/trust-score";

interface TrustBreakdown {
  pillars: { compliance: number; seo: number; aeo: number; experience: number };
  capped: boolean;
  band: { label: string; tone: string };
}

const TONE_TEXT: Record<string, string> = {
  excellent: "text-emerald-600",
  good: "text-emerald-600",
  fair: "text-amber-600",
  poor: "text-orange-600",
  critical: "text-red-600",
};

function trustFor(score: number | null): { label: string; cls: string } {
  if (score === null) return { label: "—", cls: "text-slate-400" };
  const b = trustBand(score);
  return { label: b.label, cls: TONE_TEXT[b.tone] ?? "text-slate-600" };
}

function parseTrust(json: string | null): TrustBreakdown | null {
  try {
    const o = JSON.parse(json || "");
    return o && o.pillars ? (o as TrustBreakdown) : null;
  } catch {
    return null;
  }
}

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
  platform: string | null;
  builtBy: string | null;
  professionalism: number | null;
  professionalismNote: string | null;
  aeoScore: number | null;
  aeoChecks: AeoCheck[];
  source: string;
  leadEmail: string | null;
  leadName: string | null;
  trustScore: number | null;
  trustBreakdown: string | null;
  ownerId: string | null;
  ownerName: string | null;
  demoBooked: boolean;
  bookedWith: string | null;
  emailed: boolean;
  unsubscribed: boolean;
  hasEmail: boolean;
  reviewStatus: string;
  contactName: string | null;
  contactEmail: string | null;
}

type SortKey = "score" | "businessName" | "url" | "industry" | "estimatedRevenue" | "employees";

// The 6-step pipeline. Each lead sits in exactly one stage, derived from its
// state — this drives the step bar and the contextual bulk actions.
type Stage = "scan" | "build" | "review" | "queued" | "sent" | "rejected" | "off";

const PIPELINE: { key: Stage; n: number; label: string }[] = [
  { key: "scan", n: 2, label: "Scan & score" },
  { key: "build", n: 3, label: "Build websites" },
  { key: "review", n: 4, label: "Review & approve" },
  { key: "queued", n: 5, label: "Queued to send" },
  { key: "sent", n: 6, label: "Sent" },
];

const STAGE_LABEL: Record<Stage, string> = {
  scan: "To scan",
  build: "Scored — build website",
  review: "Built — review",
  queued: "Queued to send",
  sent: "Sent",
  rejected: "Rejected",
  off: "Dismissed",
};

function stageOf(r: ProspectRowLike): Stage {
  if (r.status === "DISMISSED") return "off";
  if (r.emailed) return "sent";
  if (r.reviewStatus === "REJECTED") return "rejected";
  if (r.reviewStatus === "APPROVED") return "queued";
  if (r.demoToken) return "review";
  if (r.scanStatus === "COMPLETED") return "build";
  return "scan";
}

interface ProspectRowLike {
  status: string;
  emailed: boolean;
  reviewStatus: string;
  demoToken: string | null;
  scanStatus: string;
}

interface LeadRow {
  url: string;
  businessName?: string;
  email?: string;
  phone?: string;
  name?: string;
}

// Parse a CSV lead list. Handles quoted fields and maps common header names to
// our fields; the website/url column is required per row.
function parseCsvLeads(text: string): LeadRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const find = (...cands: string[]) => headers.findIndex((h) => cands.some((c) => h.includes(c)));
  const iUrl = find("website", "url", "domain", "site");
  const iBiz = find("business", "company", "firm", "practice", "organization");
  const iEmail = find("email");
  const iPhone = find("phone", "tel", "mobile");
  const iName = find("firstname", "contact", "name");
  if (iUrl < 0) return [];

  const rows: LeadRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitRow(lines[r]);
    const url = (cols[iUrl] || "").trim();
    if (!url) continue;
    rows.push({
      url,
      businessName: iBiz >= 0 ? cols[iBiz] : undefined,
      email: iEmail >= 0 ? cols[iEmail] : undefined,
      phone: iPhone >= 0 ? cols[iPhone] : undefined,
      name: iName >= 0 ? cols[iName] : undefined,
    });
  }
  return rows;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface CurrentUser {
  id: string;
  name: string;
  isOwner: boolean;
}

export default function ProspectsClient({
  initial,
  prevalence,
  totalScanned,
  currentUser,
  reps,
}: {
  initial: ProspectRow[];
  prevalence: Record<string, number>;
  totalScanned: number;
  currentUser: CurrentUser | null;
  reps: { id: string; name: string }[];
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
  const [bookedOnly, setBookedOnly] = useState(false);
  const [distributing, setDistributing] = useState(false);
  // Reps land on their own leads; owners see everything.
  const [ownerFilter, setOwnerFilter] = useState<"mine" | "unassigned" | "all">(
    currentUser && !currentUser.isOwner ? "mine" : "all"
  );

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState<{ done: number; total: number } | null>(null);

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Step 3: build the AI websites for the selected (scored) leads, in sequence.
  async function buildWebsites() {
    const ids = [...selected].filter((id) => {
      const r = rows.find((x) => x.id === id);
      return r && stageOf(r) === "build";
    });
    if (ids.length === 0) return;
    setBuilding({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await fetch(`/api/prospects/${ids[i]}/demo`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) patchRow(ids[i], { demoToken: data.token });
      } catch {
        /* keep going */
      }
      setBuilding({ done: i + 1, total: ids.length });
    }
    setBuilding(null);
    setSelected(new Set());
    router.refresh();
  }

  async function importCsv(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const text = await file.text();
      const rowsParsed = parseCsvLeads(text);
      if (rowsParsed.length === 0) {
        setImportMsg("No rows found. Include a header row with a website/url column.");
        return;
      }
      const res = await fetch("/api/prospects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsParsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportMsg(typeof data.error === "string" ? data.error : "Import failed.");
        return;
      }
      setImportMsg(`Imported ${data.created} new, updated ${data.updated}${data.skipped ? `, skipped ${data.skipped}` : ""}. Refreshing…`);
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  function isReady(r: ProspectRow): boolean {
    return (
      !!r.demoToken &&
      r.hasEmail &&
      !!r.ownerId &&
      r.reviewStatus === "APPROVED" &&
      !r.emailed &&
      !r.unsubscribed &&
      r.status === "PROSPECT" &&
      (currentUser?.isOwner ? true : r.ownerId === currentUser?.id)
    );
  }

  async function review(id: string, status: "APPROVED" | "REJECTED" | "PENDING") {
    patchRow(id, { reviewStatus: status });
    await fetch(`/api/prospects/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  async function sendOne(id: string): Promise<{ ok: boolean; reason?: string }> {
    const res = await fetch(`/api/prospects/${id}/outreach`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      patchRow(id, { emailed: true });
      return { ok: true };
    }
    return { ok: false, reason: typeof data.reason === "string" ? data.reason : "Send failed" };
  }

  async function sendOutreachBulk() {
    const ready = visible.filter(isReady);
    if (ready.length === 0) return;
    if (!confirm(`Send the outreach email to ${ready.length} ready lead${ready.length === 1 ? "" : "s"}?`)) return;
    setSending(true);
    setSendMsg(null);
    let sent = 0;
    let capped = false;
    for (const r of ready) {
      const res = await sendOne(r.id);
      if (res.ok) sent++;
      else if (res.reason && /daily send cap/i.test(res.reason)) {
        capped = true;
        break;
      }
    }
    setSending(false);
    setSendMsg(`Sent ${sent} email${sent === 1 ? "" : "s"}.${capped ? " Daily cap reached — the rest will send tomorrow." : ""}`);
  }

  async function distribute() {
    if (!confirm("Assign all unassigned leads evenly across your sales reps?")) return;
    setDistributing(true);
    const res = await fetch("/api/prospects/distribute", { method: "POST" });
    setDistributing(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) router.refresh();
    else alert(typeof data.error === "string" ? data.error : "Could not distribute leads.");
  }
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function assign(id: string, ownerId: string | null) {
    const ownerName = ownerId ? reps.find((r) => r.id === ownerId)?.name ?? null : null;
    patchRow(id, { ownerId, ownerName });
    await fetch(`/api/prospects/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId }),
    }).catch(() => {});
  }

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
      if (ownerFilter === "mine" && r.ownerId !== currentUser?.id) return false;
      if (ownerFilter === "unassigned" && r.ownerId) return false;
      if (bookedOnly && !r.demoBooked) return false;
      if (stageFilter && stageOf(r) !== stageFilter) return false;
      if (reviewOnly && !(r.demoToken && r.reviewStatus === "PENDING" && !r.emailed)) return false;
      if (q && !`${r.businessName ?? ""} ${r.url} ${r.industry ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "score") {
        // Sort by the Digital Trust Score. Unscanned sort last either way.
        if (a.trustScore === null && b.trustScore === null) return 0;
        if (a.trustScore === null) return 1;
        if (b.trustScore === null) return -1;
        return (a.trustScore - b.trustScore) * dir;
      }
      const av = (a[sortKey] ?? "").toString().toLowerCase();
      const bv = (b[sortKey] ?? "").toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [rows, query, showDismissed, sortKey, sortDir, ownerFilter, bookedOnly, reviewOnly, stageFilter, currentUser?.id]);

  const pendingCount = rows.filter((r) => r.status === "PROSPECT" && r.scanStatus !== "COMPLETED").length;

  const stageCounts = useMemo(() => {
    const scope = rows.filter((r) => (currentUser?.isOwner ? true : r.ownerId === currentUser?.id));
    const c: Partial<Record<Stage, number>> = {};
    for (const r of scope) {
      const s = stageOf(r);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows, currentUser]);

  const selectedBuildable = [...selected].filter((id) => {
    const r = rows.find((x) => x.id === id);
    return r && stageOf(r) === "build";
  }).length;

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
        <p className="text-sm text-slate-500">Your lead pipeline — work it left to right.</p>
      </div>

      {/* The 6-step pipeline. Click a step to see the leads waiting there. */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">1</span>
            {importing ? "Importing…" : "Upload leads"}
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing} onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </label>
          {PIPELINE.map((s) => {
            const active = stageFilter === s.key;
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="text-slate-300">→</span>
                <button
                  onClick={() => setStageFilter(active ? null : s.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${active ? "bg-white text-slate-900" : "bg-slate-200 text-slate-600"}`}>{s.n}</span>
                  {s.label}
                  <span className={`ml-0.5 rounded-full px-1.5 text-[11px] font-semibold ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{stageCounts[s.key] ?? 0}</span>
                </button>
              </div>
            );
          })}
        </div>
        {/* Contextual action for the current step */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          {stageFilter === "scan" && (
            <button onClick={scanPending} disabled={scanning || pendingCount === 0} className="btn text-sm">
              {scanning && scanProgress ? `Scanning ${scanProgress.done}/${scanProgress.total}…` : `Scan & score (${pendingCount})`}
            </button>
          )}
          {stageFilter === "build" && (
            <>
              <button onClick={buildWebsites} disabled={!!building || selectedBuildable === 0} className="btn text-sm">
                {building ? `Building ${building.done}/${building.total}…` : `Build websites for selected (${selectedBuildable})`}
              </button>
              <span className="text-xs text-slate-500">Tick the leads you want a website built for, then build.</span>
            </>
          )}
          {stageFilter === "review" && <span className="text-sm text-slate-500">Open each lead → preview the site → Approve &amp; queue or Reject.</span>}
          {stageFilter === "queued" && (
            <button onClick={sendOutreachBulk} disabled={sending || visible.filter(isReady).length === 0} className="btn text-sm">
              {sending ? "Sending…" : `✉️ Send outreach (${visible.filter(isReady).length})`}
            </button>
          )}
          {stageFilter === "sent" && <span className="text-sm text-slate-500">These leads have been emailed. Booked demos show 🔥.</span>}
          {!stageFilter && <span className="text-sm text-slate-500">Pick a step above to work that stage — or add leads to start.</span>}
        </div>
        {(building || scanProgress || sendMsg || importMsg) && (
          <p className="mt-2 text-xs text-slate-500">
            {building ? `Building websites ${building.done}/${building.total}…` : sendMsg || importMsg}
          </p>
        )}
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
        {currentUser && (
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {([
              ["mine", "My leads"],
              ["unassigned", "Unassigned"],
              ["all", "All"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOwnerFilter(key)}
                className={`rounded-md px-2.5 py-1 ${ownerFilter === key ? "bg-slate-800 text-white" : "text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
          🕵️ To review
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={bookedOnly} onChange={(e) => setBookedOnly(e.target.checked)} />
          🔥 Booked only
        </label>
        <label className="btn-secondary cursor-pointer text-sm">
          {importing ? "Importing…" : "Upload CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={importing}
            onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
          Show dismissed
        </label>
        <span className="text-xs text-slate-500">{visible.length} shown</span>
        <div className="ml-auto flex items-center gap-2">
          {currentUser?.isOwner && (
            <button onClick={distribute} disabled={distributing} className="btn-secondary text-sm">
              {distributing ? "Distributing…" : "Distribute unassigned →"}
            </button>
          )}
          {(() => {
            const readyCount = visible.filter(isReady).length;
            return (
              <button onClick={sendOutreachBulk} disabled={sending || readyCount === 0} className="btn text-sm">
                {sending ? "Sending…" : `✉️ Send outreach (${readyCount})`}
              </button>
            );
          })()}
        </div>
      </div>
      {sendMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sendMsg}</p>}
      {importMsg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{importMsg}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all buildable"
                  checked={selectedBuildable > 0 && visible.filter((r) => stageOf(r) === "build").every((r) => selected.has(r.id))}
                  onChange={(e) => {
                    const buildIds = visible.filter((r) => stageOf(r) === "build").map((r) => r.id);
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) buildIds.forEach((id) => next.add(id));
                      else buildIds.forEach((id) => next.delete(id));
                      return next;
                    });
                  }}
                />
              </th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("score")}>Trust Score{arrow("score")}</th>
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
              const risk = trustFor(r.trustScore);
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
                  reps={reps}
                  currentUser={currentUser}
                  onAssign={(ownerId) => assign(r.id, ownerId)}
                  onSendOutreach={() => sendOne(r.id)}
                  onReview={(status) => review(r.id, status)}
                  selected={selected.has(r.id)}
                  onToggleSelect={() => toggleSelected(r.id)}
                />
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
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
  reps,
  currentUser,
  onAssign,
  onSendOutreach,
  onReview,
  selected,
  onToggleSelect,
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
  reps: { id: string; name: string }[];
  currentUser: CurrentUser | null;
  onAssign: (ownerId: string | null) => void;
  onSendOutreach: () => Promise<{ ok: boolean; reason?: string }>;
  onReview: (status: "APPROVED" | "REJECTED" | "PENDING") => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const dimmed = r.status === "DISMISSED";
  const stage = stageOf(r);

  async function runScan() {
    setScanning(true);
    await onScan();
    setScanning(false);
  }

  return (
    <>
      <tr className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${dimmed ? "opacity-50" : ""}`}>
        <td className="px-3 py-3">
          {stage === "build" && (
            <input type="checkbox" aria-label="Select for website build" checked={selected} onChange={onToggleSelect} />
          )}
        </td>
        <td className="px-4 py-3">
          {r.scanStatus === "COMPLETED" ? (
            <span className={`font-semibold ${risk.cls}`}>
              {r.trustScore ?? "—"}/100
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
          {stage !== "off" && (
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{STAGE_LABEL[stage]}</div>
          )}
          {r.source === "inbound" && (
            <div className="mt-0.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Inbound lead{r.leadEmail ? " ✓" : ""}
            </div>
          )}
          {r.demoBooked && (
            <div className="mt-0.5 inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
              🔥 Demo booked{r.bookedWith ? ` · ${r.bookedWith}` : ""}
            </div>
          )}
          {r.unsubscribed ? (
            <div className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Unsubscribed
            </div>
          ) : r.emailed ? (
            <div className="mt-0.5 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              ✉️ Emailed
            </div>
          ) : null}
          {r.ownerName && (
            <div className="mt-0.5 text-[11px] text-slate-400">
              {r.ownerId === currentUser?.id ? "Yours" : r.ownerName}
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">
            {hostOf(r.url)}
          </a>
          {r.platform && <div className="text-[11px] text-slate-400">Built on {r.platform}</div>}
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
          <td colSpan={8} className="px-4 py-4">
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
              reps={reps}
              currentUser={currentUser}
              onAssign={onAssign}
              onSendOutreach={onSendOutreach}
              onReview={onReview}
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
  reps,
  currentUser,
  onAssign,
  onSendOutreach,
  onReview,
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
  reps: { id: string; name: string }[];
  currentUser: CurrentUser | null;
  onAssign: (ownerId: string | null) => void;
  onSendOutreach: () => Promise<{ ok: boolean; reason?: string }>;
  onReview: (status: "APPROVED" | "REJECTED" | "PENDING") => void;
}) {
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [outreachMsg, setOutreachMsg] = useState<string | null>(null);
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
    {currentUser && (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
        <span className="text-slate-500">Assigned to</span>
        {currentUser.isOwner ? (
          <select
            className="input h-8 py-0 text-sm"
            value={r.ownerId ?? ""}
            onChange={(e) => onAssign(e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>{rep.name}</option>
            ))}
          </select>
        ) : (
          <span className="font-medium text-slate-800">
            {r.ownerId === currentUser.id ? "You" : r.ownerName || "Unassigned"}
          </span>
        )}
        {!currentUser.isOwner && r.ownerId !== currentUser.id && (
          <button onClick={() => onAssign(currentUser.id)} className="btn-secondary ml-auto text-xs">
            Claim this lead
          </button>
        )}
      </div>
    )}
    <TrustScorePanel r={r} />
    <SiteIntelSection r={r} />
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
        {r.source === "inbound" && r.leadEmail && (
          <div className="rounded-md bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
            <span className="font-semibold">Inbound lead</span> — {r.leadName ? `${r.leadName}, ` : ""}
            <a href={`mailto:${r.leadEmail}`} className="underline">{r.leadEmail}</a>
          </div>
        )}
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

        {/* Outreach — review the preview, approve/reject, then it joins the send queue. */}
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outreach</div>
          {r.unsubscribed ? (
            <p className="text-xs text-slate-400">Unsubscribed — outreach is suppressed for this lead.</p>
          ) : r.emailed ? (
            <p className="text-xs text-blue-700">✉️ Outreach email sent.</p>
          ) : !r.demoToken ? (
            <p className="text-xs text-slate-400">Generate a demo above first — reps review the preview before it can be sent.</p>
          ) : (
            <>
              <a
                href={`/demo/${r.demoToken}/report`}
                target="_blank"
                rel="noreferrer"
                className="block text-xs text-brand-600 hover:underline"
              >
                Open the preview to review →
              </a>
              {r.reviewStatus === "APPROVED" ? (
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">✓ Approved — queued</span>
                  <button onClick={() => onReview("PENDING")} className="text-[11px] text-slate-400 hover:text-slate-600">Undo</button>
                </div>
              ) : r.reviewStatus === "REJECTED" ? (
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">Rejected</span>
                  <button onClick={() => onReview("PENDING")} className="text-[11px] text-brand-600 hover:underline">Re-review</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => onReview("APPROVED")} className="btn flex-1 text-xs">Approve &amp; queue</button>
                  <button onClick={() => onReview("REJECTED")} className="btn-secondary flex-1 text-xs">Reject</button>
                </div>
              )}
              {!r.hasEmail && <p className="text-[11px] text-amber-600">No contact email — add one before this can send.</p>}
              {!r.ownerId && <p className="text-[11px] text-amber-600">Assign to a rep before sending.</p>}
              {r.reviewStatus === "APPROVED" && r.hasEmail && r.ownerId && (
                <button
                  onClick={async () => {
                    setOutreachBusy(true);
                    setOutreachMsg(null);
                    const res = await onSendOutreach();
                    setOutreachBusy(false);
                    if (!res.ok) setOutreachMsg(res.reason || "Send failed");
                  }}
                  disabled={outreachBusy}
                  className="btn-secondary w-full text-xs"
                >
                  {outreachBusy ? "Sending…" : "✉️ Send now"}
                </button>
              )}
            </>
          )}
          {outreachMsg && <p className="text-xs text-red-600">{outreachMsg}</p>}
        </div>

        <button onClick={onConvert} className="btn-secondary w-full text-sm">Convert to account →</button>
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

// The headline Digital Trust Score and its four pillars. The compliance cap is
// called out explicitly — it's the story that makes prospects act.
function TrustScorePanel({ r }: { r: ProspectRow }) {
  if (r.scanStatus !== "COMPLETED" || r.trustScore === null) return null;
  const t = parseTrust(r.trustBreakdown);
  const band = trustFor(r.trustScore);

  const pillars: { label: string; weight: string; value: number }[] = t
    ? [
        { label: "Compliance", weight: "35%", value: t.pillars.compliance },
        { label: "Search (SEO)", weight: "25%", value: t.pillars.seo },
        { label: "AI answers (AEO)", weight: "20%", value: t.pillars.aeo },
        { label: "Experience", weight: "20%", value: t.pillars.experience },
      ]
    : [];

  const barColor = (v: number) =>
    v >= 85 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : v >= 40 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className={`text-3xl font-extrabold ${band.cls}`}>
            {r.trustScore}
            <span className="text-base font-semibold text-slate-400">/100</span>
          </div>
          <div className={`text-[11px] font-semibold ${band.cls}`}>{band.label}</div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Digital Trust Score</h4>
          <p className="text-xs text-slate-500">
            {t?.capped
              ? "Held to the compliance cap — an accessibility issue means it can't score above 80, no matter how good the rest is."
              : "One number across compliance, search, AI answers, and experience."}
          </p>
        </div>
      </div>

      {pillars.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {pillars.map((p) => (
            <div key={p.label} className="flex items-center gap-3 text-xs">
              <span className="w-28 shrink-0 text-slate-500">
                {p.label} <span className="text-slate-300">· {p.weight}</span>
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className={`block h-full rounded-full ${barColor(p.value)}`} style={{ width: `${p.value}%` }} />
              </span>
              <span className="w-8 text-right font-mono text-slate-700">{p.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// What the quick scan learned beyond accessibility: who built the site, how
// professional it looks (AI), and an on-page / AEO scorecard.
function SiteIntelSection({ r }: { r: ProspectRow }) {
  if (r.scanStatus !== "COMPLETED") return null;
  const hasIntel =
    r.platform || r.builtBy || r.professionalism !== null || r.aeoScore !== null || r.aeoChecks.length > 0;
  if (!hasIntel) return null;

  const aeoColor =
    r.aeoScore === null ? "text-slate-400" : r.aeoScore >= 80 ? "text-emerald-600" : r.aeoScore >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-sm font-semibold text-slate-900">Site intelligence</h4>

      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Built with / by</div>
          <div className="text-sm text-slate-700">{r.platform || "Custom / unknown"}</div>
          {r.builtBy && <div className="text-xs text-slate-500">{r.builtBy}</div>}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Professionalism</div>
          {r.professionalism !== null ? (
            <div className="text-sm text-amber-500" title={`${r.professionalism}/5`}>
              {"★".repeat(r.professionalism)}
              <span className="text-slate-300">{"★".repeat(5 - r.professionalism)}</span>
            </div>
          ) : (
            <div className="text-sm text-slate-400">—</div>
          )}
          {r.professionalismNote && <div className="text-xs text-slate-500">{r.professionalismNote}</div>}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">On-page / AEO</div>
          <div className={`text-sm font-semibold ${aeoColor}`}>
            {r.aeoScore !== null ? `${r.aeoScore}/100` : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {r.aeoChecks.filter((c) => c.pass).length}/{r.aeoChecks.length} checks pass
          </div>
        </div>
      </div>

      {r.aeoChecks.length > 0 && (
        <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {r.aeoChecks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className={c.pass ? "text-emerald-500" : "text-red-500"}>{c.pass ? "✓" : "✕"}</span>
              <span className="text-slate-700">
                {c.label}
                <span className="text-slate-400"> — {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
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
            ↻ Redo website
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
  platform?: string | null;
  builtBy?: string | null;
  professionalism?: number | null;
  professionalismNote?: string | null;
  aeoScore?: number | null;
  aeoChecks?: string | null;
  source?: string;
  leadEmail?: string | null;
  leadName?: string | null;
  trustScore?: number | null;
  trustBreakdown?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  demoBooked?: boolean;
  bookedWith?: string | null;
  emailed?: boolean;
  unsubscribed?: boolean;
  hasEmail?: boolean;
  reviewStatus?: string;
  contactName?: string | null;
  contactEmail?: string | null;
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
    platform: p.platform ?? null,
    builtBy: p.builtBy ?? null,
    professionalism: p.professionalism ?? null,
    professionalismNote: p.professionalismNote ?? null,
    aeoScore: p.aeoScore ?? null,
    aeoChecks: parseAeoChecksJson(p.aeoChecks),
    source: p.source ?? "manual",
    leadEmail: p.leadEmail ?? null,
    leadName: p.leadName ?? null,
    trustScore: p.trustScore ?? null,
    trustBreakdown: p.trustBreakdown ?? null,
    ownerId: p.ownerId ?? null,
    ownerName: p.ownerName ?? null,
    demoBooked: p.demoBooked ?? false,
    bookedWith: p.bookedWith ?? null,
    emailed: p.emailed ?? false,
    unsubscribed: p.unsubscribed ?? false,
    hasEmail: p.hasEmail ?? false,
    reviewStatus: p.reviewStatus ?? "PENDING",
    contactName: p.contactName ?? null,
    contactEmail: p.contactEmail ?? null,
  };
}

function parseAeoChecksJson(json: string | null | undefined): AeoCheck[] {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
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
