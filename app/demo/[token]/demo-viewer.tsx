"use client";

import { useState } from "react";

// Public before/after demo. "After" is the real, interactive AI redesign in an
// iframe (clickable, works on a phone); "Before" is a screenshot of their
// current site. The whole thing is the pitch: this is the finished solution.
export default function DemoViewer({
  businessName,
  sourceUrl,
  beforeShot,
  redesignHtml,
  beforeScore,
  afterScore,
  reportUrl,
  ctaUrl,
}: {
  businessName: string;
  sourceUrl: string;
  beforeShot: string | null;
  redesignHtml: string;
  beforeScore: number | null;
  afterScore: number | null;
  reportUrl: string;
  ctaUrl: string;
}) {
  const [view, setView] = useState<"after" | "before">("after");

  return (
    <div className="flex h-screen flex-col bg-slate-900">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{businessName}</div>
          <div className="text-[11px] text-slate-400">A new website concept, built for you by Hey Lily</div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 p-0.5 text-sm">
            <button
              onClick={() => setView("before")}
              className={`rounded-md px-3 py-1.5 ${view === "before" ? "bg-white text-slate-900" : "text-slate-300"}`}
            >
              Before
            </button>
            <button
              onClick={() => setView("after")}
              className={`rounded-md px-3 py-1.5 ${view === "after" ? "bg-white text-slate-900" : "text-slate-300"}`}
            >
              After
            </button>
          </div>
          <a href={reportUrl} className="hidden rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 sm:inline-block">
            See the report
          </a>
          <a href={ctaUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-400">
            Get this site
          </a>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-slate-100">
        {view === "after" ? (
          <iframe title={`${businessName} — redesign`} srcDoc={redesignHtml} className="h-full w-full border-0" />
        ) : (
          <div className="h-full w-full overflow-y-auto bg-slate-200">
            {beforeShot ? (
              <img src={beforeShot} alt={`Current ${businessName} website`} className="mx-auto block w-full max-w-[1280px]" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">
                  View current site
                </a>
              </div>
            )}
          </div>
        )}

        {/* Score chips overlay */}
        <div className="pointer-events-none absolute bottom-4 left-4 flex gap-2">
          {view === "before" && beforeScore !== null && (
            <span className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              Current compliance: {beforeScore}/100
            </span>
          )}
          {view === "after" && (
            <span className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              Redesigned: {afterScore ?? 100}/100 · fully compliant
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
