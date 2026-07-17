"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SECTION_TYPES,
  newSectionOfType,
  type BusinessData,
  type Section,
  type SectionType,
  type Theme,
} from "@/lib/site/ir";

type Device = "phone" | "tablet" | "desktop";
const DEVICE_WIDTH: Record<Device, string> = { phone: "390px", tablet: "768px", desktop: "100%" };

interface ValidationReport {
  ok: boolean;
  sizeBytes: number;
  a11yScore: number;
  seriousCount: number;
  violationCount: number;
  violations: Array<{ id: string; impact: string | null; help: string; nodeCount: number }>;
  warnings: string[];
  blockers: string[];
}

export default function SiteEditor(props: {
  siteId: string;
  pageId: string;
  initialName: string;
  initialStatus: string;
  initialShowCookieBanner: boolean;
  initialTheme: Theme;
  initialBusinessData: BusinessData;
  initialSections: Section[];
  initialHasCustomDesign: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"content" | "business" | "design" | "assistant">("content");
  const [name] = useState(props.initialName);
  const [status, setStatus] = useState(props.initialStatus);
  const [showCookieBanner, setShowCookieBanner] = useState(props.initialShowCookieBanner);
  const [theme, setTheme] = useState<Theme>(props.initialTheme);
  const [business, setBusiness] = useState<BusinessData>(props.initialBusinessData);
  const [sections, setSections] = useState<Section[]>(props.initialSections);

  const [device, setDevice] = useState<Device>("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);

  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [customActive, setCustomActive] = useState(props.initialHasCustomDesign);
  const [designDirection, setDesignDirection] = useState("");
  const [designing, setDesigning] = useState(false);
  const [designMsg, setDesignMsg] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishReady, setPublishReady] = useState<{ instructions: string[]; exportUrl: string } | null>(null);
  const [liveUrl, setLiveUrl] = useState("");
  const [publishDone, setPublishDone] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const siteRes = await fetch(`/api/sites/${props.siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, status, showCookieBanner, theme, businessData: business }),
      });
      if (!siteRes.ok) {
        setError(describeError(await siteRes.json().catch(() => ({}))));
        return false;
      }
      const pageRes = await fetch(`/api/pages/${props.pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ir: { sections } }),
      });
      if (!pageRes.ok) {
        setError(describeError(await pageRes.json().catch(() => ({}))));
        return false;
      }
      setPreviewKey((k) => k + 1);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function validate() {
    setValidating(true);
    setReport(null);
    const ok = await save();
    if (!ok) {
      setValidating(false);
      return;
    }
    const res = await fetch(`/api/pages/${props.pageId}/validate`, { method: "POST" });
    setValidating(false);
    if (res.ok) {
      const data = await res.json();
      setReport(data.report);
    }
  }

  async function exportPage() {
    const ok = await save();
    if (ok) window.open(`/api/pages/${props.pageId}/export`, "_blank");
  }

  async function runAi() {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    const res = await fetch(`/api/sites/${props.siteId}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: props.pageId, instruction: aiInstruction }),
    });
    setAiLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAiError(typeof data.error === "string" ? data.error : "AI edit failed");
      return;
    }
    const data = await res.json();
    // The route already persisted the change; sync local state + preview.
    setSections(data.ir.sections);
    if (data.theme) setTheme(data.theme);
    setAiSummary(data.summary);
    setAiInstruction("");
    setPreviewKey((k) => k + 1);
  }

  async function generateDesign() {
    setDesigning(true);
    setDesignMsg(null);
    setReport(null);
    // Persist any structured/business/theme edits first so the designer works
    // from the latest content.
    await save();
    const res = await fetch(`/api/sites/${props.siteId}/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: props.pageId, instruction: designDirection || undefined }),
    });
    setDesigning(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDesignMsg(typeof data.error === "string" ? data.error : "Design generation failed");
      return;
    }
    setCustomActive(true);
    setDesignMsg(
      `${data.summary}${data.dryRun ? " (mock mode)" : ""} — a11y ${data.report?.a11yScore ?? "—"}/100${
        data.report?.ok ? ", passes checks" : ", needs a fix pass"
      }`
    );
    if (data.report) setReport(data.report);
    setPreviewKey((k) => k + 1);
  }

  async function revertDesign() {
    setDesigning(true);
    await fetch(`/api/pages/${props.pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customHtml: null }),
    });
    setDesigning(false);
    setCustomActive(false);
    setDesignMsg(null);
    setPreviewKey((k) => k + 1);
  }

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    setPublishDone(null);
    setPublishReady(null);
    const ok = await save();
    if (!ok) {
      setPublishing(false);
      return;
    }
    const res = await fetch(`/api/pages/${props.pageId}/publish`, { method: "POST" });
    setPublishing(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 422) {
      setReport(data.report);
      setPublishError("Not ready to publish — see the checks below.");
      return;
    }
    if (!res.ok) {
      setPublishError(typeof data.error === "string" ? data.error : "Publish failed");
      return;
    }
    setPublishReady({ instructions: data.instructions, exportUrl: data.exportUrl });
  }

  async function confirmLive() {
    if (!liveUrl.trim()) return;
    setPublishing(true);
    setPublishError(null);
    const res = await fetch(`/api/pages/${props.pageId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liveUrl }),
    });
    setPublishing(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPublishError(typeof data.error === "string" ? data.error : "Could not register the live URL");
      return;
    }
    setPublishReady(null);
    setPublishDone(data.message ?? "Published.");
    setStatus("PUBLISHED");
    router.refresh();
  }

  // ---- section helpers ----
  function updateSection(index: number, next: Section) {
    setSections((prev) => prev.map((s, i) => (i === index ? next : s)));
  }
  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }
  function moveSection(index: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function addSection(type: SectionType) {
    setSections((prev) => [...prev, newSectionOfType(type)]);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------- Editor column ---------- */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(["content", "business", "design", "assistant"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 capitalize ${tab === t ? "bg-brand-500 text-white" : "text-slate-600"}`}
              >
                {t === "assistant" ? "AI" : t}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={save} disabled={saving} className="btn text-sm">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {tab === "content" && (
          <div className="space-y-3">
            {sections.map((section, i) => (
              <div key={i} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {section.type}
                  </span>
                  <div className="flex gap-1 text-xs">
                    <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="btn-secondary px-2 py-1 disabled:opacity-40" aria-label="Move up">↑</button>
                    <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} className="btn-secondary px-2 py-1 disabled:opacity-40" aria-label="Move down">↓</button>
                    <button onClick={() => removeSection(i)} className="px-2 py-1 text-red-600 hover:underline">Remove</button>
                  </div>
                </div>
                <SectionFields siteId={props.siteId} section={section} onChange={(next) => updateSection(i, next)} />
              </div>
            ))}

            <div className="card">
              <label className="mb-1 block text-sm font-medium text-slate-700">Add a section</label>
              <div className="flex flex-wrap gap-2">
                {SECTION_TYPES.map((st) => (
                  <button key={st.type} onClick={() => addSection(st.type)} className="btn-secondary text-sm">
                    + {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "business" && (
          <BusinessForm business={business} onChange={setBusiness} />
        )}

        {tab === "design" && (
          <DesignForm
            theme={theme}
            onChange={setTheme}
            status={status}
            onStatusChange={setStatus}
            showCookieBanner={showCookieBanner}
            onCookieChange={setShowCookieBanner}
          />
        )}

        {tab === "assistant" && (
          <div className="space-y-3">
            <div className="card space-y-3 border-brand-200 bg-brand-50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">✨ World-class custom design</h3>
                <p className="text-xs text-slate-600">
                  Claude hand-codes a bespoke, high-converting site from this business&apos;s content —
                  gated by the accessibility scanner, so it&apos;s guaranteed compliant.
                </p>
              </div>
              <input
                className="input"
                placeholder="Optional style direction (e.g. bold and modern, warm and premium, minimal)…"
                value={designDirection}
                onChange={(e) => setDesignDirection(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={generateDesign} disabled={designing} className="btn text-sm">
                  {designing ? "Designing…" : customActive ? "Regenerate design" : "Generate world-class design"}
                </button>
                {customActive && (
                  <button onClick={revertDesign} disabled={designing} className="btn-secondary text-sm">
                    Revert to structured editor
                  </button>
                )}
              </div>
              {customActive && (
                <p className="text-xs font-medium text-brand-700">
                  Custom AI design is active — the preview and publish use it. The structured tabs edit the
                  fallback version.
                </p>
              )}
              {designMsg && <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">{designMsg}</p>}
            </div>

            <div className="card space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Describe a change</h3>
              <p className="text-xs text-slate-500">
                The assistant edits the page directly. It can only produce compliant, accessible
                sections — every change is validated before it&apos;s applied.
              </p>
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder="e.g. Make the hero warmer and add a testimonials section with two quotes"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
            />
            <button onClick={runAi} disabled={aiLoading} className="btn text-sm">
              {aiLoading ? "Working…" : "Apply with AI"}
            </button>
            {aiError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p>}
            {aiSummary && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{aiSummary}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Rewrite the hero to be punchier",
                "Add an FAQ section with 3 common questions",
                "Use a warmer color palette",
                "Add a testimonials section",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setAiInstruction(s)}
                  className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Preview column ---------- */}
      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(["phone", "tablet", "desktop"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`rounded-md px-3 py-1.5 capitalize ${device === d ? "bg-slate-800 text-white" : "text-slate-600"}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={validate} disabled={validating} className="btn-secondary text-sm">
              {validating ? "Checking…" : "Validate"}
            </button>
            <button onClick={exportPage} className="btn-secondary text-sm">Export HTML</button>
            <button onClick={publish} disabled={publishing} className="btn text-sm">
              {publishing ? "…" : "Publish"}
            </button>
          </div>
        </div>

        {publishError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{publishError}</p>}
        {publishDone && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ {publishDone}</p>
        )}
        {publishReady && (
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Ready to publish to GHL</h3>
            <p className="text-xs text-slate-500">
              GoHighLevel has no API to upload Custom HTML Pages, so this last step is manual:
            </p>
            <ol className="space-y-1 text-sm text-slate-700">
              {publishReady.instructions.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-medium text-brand-600">{i + 1}.</span> {step}
                </li>
              ))}
            </ol>
            <a href={publishReady.exportUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-block text-sm">
              Download HTML for GHL
            </a>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="https://client-domain.com/ (live URL after publishing)"
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
              />
              <button onClick={confirmLive} disabled={publishing} className="btn text-sm">
                Register
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Registering the live URL starts ongoing weekly accessibility monitoring for the page.
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100 p-3">
          <div className="mx-auto bg-white shadow-sm transition-all" style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}>
            <iframe
              key={previewKey}
              title="Site preview"
              src={`/api/pages/${props.pageId}/preview?t=${previewKey}`}
              className="h-[640px] w-full border-0"
            />
          </div>
        </div>

        {report && <ValidationPanel report={report} />}
      </div>
    </div>
  );
}

function describeError(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as { error: unknown }).error;
    if (typeof err === "string") return err;
    // zod flattened error — surface field messages (e.g. missing alt text)
    try {
      const flat = err as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      const parts = [
        ...(flat.formErrors ?? []),
        ...Object.entries(flat.fieldErrors ?? {}).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`)),
      ];
      if (parts.length) return parts.join("; ");
    } catch {
      /* fall through */
    }
    return JSON.stringify(err);
  }
  return "Something went wrong saving.";
}

function ValidationPanel({ report }: { report: ValidationReport }) {
  return (
    <div className={`card space-y-2 ${report.ok ? "border-emerald-200" : "border-amber-300"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {report.ok ? "✓ Passes publish checks" : "Not ready to publish"}
        </h3>
        <span className="text-xs text-slate-500">
          a11y {report.a11yScore} · {(report.sizeBytes / 1024).toFixed(0)} KB
        </span>
      </div>
      {report.blockers.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-700">
          {report.blockers.map((b, i) => (
            <li key={i}>• {b}</li>
          ))}
        </ul>
      )}
      {report.violations.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-600">
          {report.violations.map((v, i) => (
            <li key={i}>
              <span className="font-medium">{v.impact ?? "minor"}</span> — {v.help} ({v.nodeCount})
            </li>
          ))}
        </ul>
      )}
      {report.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-600">
          {report.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      {report.ok && report.violations.length === 0 && (
        <p className="text-xs text-emerald-700">No accessibility violations. Under the 5MB limit.</p>
      )}
    </div>
  );
}

// ---------------- Field editors ----------------

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <textarea className="input" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Image picker: upload to R2 (or local fallback) which fills the URL, plus a required alt-text field. */
function ImageField({
  siteId,
  url,
  alt,
  onChange,
}: {
  siteId: string;
  url: string;
  alt: string;
  onChange: (url: string, alt: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setErr(null);
    const body = new FormData();
    body.append("file", file);
    body.append("alt", alt);
    const res = await fetch(`/api/sites/${siteId}/assets`, { method: "POST", body });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(typeof data.error === "string" ? data.error : "Upload failed");
      return;
    }
    const { asset } = await res.json();
    onChange(asset.cdnUrl, alt);
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2">
      <div className="flex items-center gap-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">none</div>
        )}
        <label className="btn-secondary cursor-pointer text-sm">
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <Field label="Image URL (absolute)" value={url} onChange={(v) => onChange(v, alt)} />
      <Field label="Alt text (required)" value={alt} onChange={(v) => onChange(url, v)} />
    </div>
  );
}

function SectionFields({ siteId, section, onChange }: { siteId: string; section: Section; onChange: (s: Section) => void }) {
  switch (section.type) {
    case "hero":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading} onChange={(v) => onChange({ ...section, heading: v })} />
          <Field label="Subheading" value={section.subheading ?? ""} onChange={(v) => onChange({ ...section, subheading: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Button label" value={section.ctaLabel ?? ""} onChange={(v) => onChange({ ...section, ctaLabel: v })} />
            <Field label="Button link" value={section.ctaHref ?? ""} onChange={(v) => onChange({ ...section, ctaHref: v })} />
          </div>
          <span className="block text-sm font-medium text-slate-700">Hero image (optional)</span>
          <ImageField
            siteId={siteId}
            url={section.image?.url ?? ""}
            alt={section.image?.alt ?? ""}
            onChange={(url, alt) => onChange({ ...section, image: url ? { url, alt } : undefined })}
          />
        </div>
      );
    case "about":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading ?? ""} onChange={(v) => onChange({ ...section, heading: v })} />
          <Area label="Body" value={section.body} onChange={(v) => onChange({ ...section, body: v })} />
        </div>
      );
    case "services":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading ?? ""} onChange={(v) => onChange({ ...section, heading: v })} />
          <ListEditor
            items={section.items}
            onChange={(items) => onChange({ ...section, items })}
            blank={{ name: "New service", description: "" }}
            render={(item, upd) => (
              <>
                <Field label="Name" value={item.name} onChange={(v) => upd({ ...item, name: v })} />
                <Field label="Description" value={item.description ?? ""} onChange={(v) => upd({ ...item, description: v })} />
              </>
            )}
          />
        </div>
      );
    case "gallery":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading ?? ""} onChange={(v) => onChange({ ...section, heading: v })} />
          <ListEditor
            items={section.images}
            onChange={(images) => onChange({ ...section, images })}
            blank={{ url: "", alt: "" }}
            render={(item, upd) => (
              <ImageField siteId={siteId} url={item.url} alt={item.alt} onChange={(url, alt) => upd({ url, alt })} />
            )}
          />
        </div>
      );
    case "faq":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading ?? ""} onChange={(v) => onChange({ ...section, heading: v })} />
          <ListEditor
            items={section.items}
            onChange={(items) => onChange({ ...section, items })}
            blank={{ question: "A question?", answer: "The answer." }}
            render={(item, upd) => (
              <>
                <Field label="Question" value={item.question} onChange={(v) => upd({ ...item, question: v })} />
                <Area label="Answer" value={item.answer} onChange={(v) => upd({ ...item, answer: v })} />
              </>
            )}
          />
        </div>
      );
    case "testimonials":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading ?? ""} onChange={(v) => onChange({ ...section, heading: v })} />
          <ListEditor
            items={section.items}
            onChange={(items) => onChange({ ...section, items })}
            blank={{ quote: "Great service.", author: "" }}
            render={(item, upd) => (
              <>
                <Area label="Quote" value={item.quote} onChange={(v) => upd({ ...item, quote: v })} />
                <Field label="Author" value={item.author ?? ""} onChange={(v) => upd({ ...item, author: v })} />
              </>
            )}
          />
        </div>
      );
    case "cta":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading} onChange={(v) => onChange({ ...section, heading: v })} />
          <Field label="Body" value={section.body ?? ""} onChange={(v) => onChange({ ...section, body: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Button label" value={section.buttonLabel} onChange={(v) => onChange({ ...section, buttonLabel: v })} />
            <Field label="Button link" value={section.buttonHref} onChange={(v) => onChange({ ...section, buttonHref: v })} />
          </div>
        </div>
      );
    case "contact":
      return (
        <div className="space-y-2">
          <Field label="Heading" value={section.heading ?? ""} onChange={(v) => onChange({ ...section, heading: v })} />
          <Area label="Intro text" value={section.body ?? ""} onChange={(v) => onChange({ ...section, body: v })} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={section.showForm} onChange={(e) => onChange({ ...section, showForm: e.target.checked })} />
            Show contact form (GHL wiring comes in Phase B)
          </label>
        </div>
      );
  }
}

function ListEditor<T>({
  items,
  onChange,
  blank,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  render: (item: T, update: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-2">
          {render(item, (next) => onChange(items.map((it, idx) => (idx === i ? next : it))))}
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-xs text-red-600 hover:underline">
            Remove item
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, structuredClone(blank)])} className="btn-secondary text-sm">
        + Add item
      </button>
    </div>
  );
}

function BusinessForm({ business, onChange }: { business: BusinessData; onChange: (b: BusinessData) => void }) {
  const set = (patch: Partial<BusinessData>) => onChange({ ...business, ...patch });
  return (
    <div className="card space-y-3">
      <Field label="Business name" value={business.name} onChange={(v) => set({ name: v })} />
      <Field label="Tagline" value={business.tagline ?? ""} onChange={(v) => set({ tagline: v })} />
      <Area label="About" value={business.about ?? ""} onChange={(v) => set({ about: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Phone" value={business.phone ?? ""} onChange={(v) => set({ phone: v })} />
        <Field label="Email" value={business.email ?? ""} onChange={(v) => set({ email: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Street" value={business.address?.street ?? ""} onChange={(v) => set({ address: { ...business.address, street: v } })} />
        <Field label="City" value={business.address?.city ?? ""} onChange={(v) => set({ address: { ...business.address, city: v } })} />
        <Field label="Region/State" value={business.address?.region ?? ""} onChange={(v) => set({ address: { ...business.address, region: v } })} />
        <Field label="Postal code" value={business.address?.postal ?? ""} onChange={(v) => set({ address: { ...business.address, postal: v } })} />
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Hours</span>
        <ListEditor
          items={business.hours}
          onChange={(hours) => set({ hours })}
          blank={{ label: "Day", value: "9:00 AM – 5:00 PM" }}
          render={(item, upd) => (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Label" value={item.label} onChange={(v) => upd({ ...item, label: v })} />
              <Field label="Value" value={item.value} onChange={(v) => upd({ ...item, value: v })} />
            </div>
          )}
        />
      </div>
    </div>
  );
}

function DesignForm({
  theme,
  onChange,
  status,
  onStatusChange,
  showCookieBanner,
  onCookieChange,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
  status: string;
  onStatusChange: (s: string) => void;
  showCookieBanner: boolean;
  onCookieChange: (v: boolean) => void;
}) {
  const setPalette = (key: keyof Theme["palette"], value: string) =>
    onChange({ ...theme, palette: { ...theme.palette, [key]: value } });

  return (
    <div className="card space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Font pairing</span>
        <select className="input" value={theme.fonts} onChange={(e) => onChange({ ...theme, fonts: e.target.value as Theme["fonts"] })}>
          <option value="modern">Modern (sans / sans)</option>
          <option value="classic">Classic (serif headings / sans body)</option>
          <option value="editorial">Editorial (serif / serif)</option>
        </select>
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Colors</span>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(theme.palette) as (keyof Theme["palette"])[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="color" value={theme.palette[key]} onChange={(e) => setPalette(key, e.target.value)} className="h-8 w-10 rounded border border-slate-300" />
              <span className="capitalize text-slate-600">{key}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Corner radius: {theme.radius}px</span>
        <input type="range" min={0} max={28} value={theme.radius} onChange={(e) => onChange({ ...theme, radius: Number(e.target.value) })} className="w-full" />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={showCookieBanner} onChange={(e) => onCookieChange(e.target.checked)} />
        Show cookie consent banner
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Status</span>
        <select className="input" value={status} onChange={(e) => onStatusChange(e.target.value)}>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
        </select>
      </label>
    </div>
  );
}
