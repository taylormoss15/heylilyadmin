import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  const name = demo?.businessName || "your business";
  return { title: `Website Health Scorecard — ${name}`, robots: { index: false } };
}

function riskBand(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "Unscored", color: "#64748b" };
  if (score >= 100) return { label: "Compliant", color: "#059669" };
  if (score >= 85) return { label: "At risk", color: "#d97706" };
  if (score >= 60) return { label: "High risk", color: "#ea580c" };
  return { label: "Severe risk", color: "#dc2626" };
}

function seoBand(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "Not measured", color: "#64748b" };
  if (score >= 80) return { label: "Strong", color: "#059669" };
  if (score >= 50) return { label: "Needs work", color: "#d97706" };
  return { label: "Poor", color: "#dc2626" };
}

interface SeoCheck {
  label: string;
  pass: boolean;
  detail: string;
}

export default async function ReportPage({ params }: { params: { token: string } }) {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  if (!demo || demo.status !== "READY") notFound();

  const issues: string[] = (() => {
    try {
      const a = JSON.parse(demo.issues || "[]");
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  })();

  const seoChecks: SeoCheck[] = (() => {
    try {
      const a = JSON.parse(demo.seoChecks || "[]");
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  })();

  const band = riskBand(demo.beforeScore);
  const seo = seoBand(demo.seoScore);

  // Bucket everything the scan found into the loved Critical / Warnings /
  // Passed model. Critical = serious accessibility (legal exposure); Warnings
  // = failed on-page/SEO checks + minor a11y; Passed = on-page checks that
  // already pass. Hints name a couple of items without handing over the fix.
  const failedSeo = seoChecks.filter((c) => !c.pass);
  const passedSeo = seoChecks.filter((c) => c.pass);
  const minorA11y = Math.max(0, demo.beforeViolations - demo.beforeSerious);
  const buckets = {
    critical: {
      count: demo.beforeSerious,
      hint: "Serious accessibility failures — ADA/WCAG legal exposure and visitors who can't use the site.",
    },
    warnings: {
      count: failedSeo.length + minorA11y,
      hint:
        failedSeo.length > 0
          ? failedSeo.slice(0, 3).map((c) => c.label).join(", ")
          : "Minor accessibility and on-page issues.",
    },
    passed: {
      count: passedSeo.length,
      hint:
        passedSeo.length > 0
          ? passedSeo.slice(0, 3).map((c) => c.label).join(", ")
          : "The basics that are already in place.",
    },
  };

  const host = (() => {
    try {
      return new URL(demo.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return demo.sourceUrl;
    }
  })();
  const date = new Date(demo.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Screen-only action bar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link href={`/demo/${demo.token}`} className="text-sm text-slate-600 hover:underline">
          ← Back to the interactive demo
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl bg-white p-8 shadow-sm sm:my-6 sm:rounded-2xl print:my-0 print:shadow-none">
        {/* Cover */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <div className="text-sm font-bold tracking-tight text-brand-600">Hey Lily</div>
            <h1 className="mt-1 text-2xl font-bold">Website Health Scorecard</h1>
          </div>
          <div className="text-right text-xs text-slate-500">{date}</div>
        </div>
        <p className="mt-4 text-lg font-semibold">{demo.businessName || host}</p>
        <p className="text-sm text-slate-500">{host}</p>

        {/* Section 1 — today: score tiles + Critical / Warnings / Passed */}
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Where your site stands today</h2>

          {/* Score tiles */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: band.color }}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance</div>
              <div className="mt-1 text-4xl font-extrabold" style={{ color: band.color }}>
                {demo.beforeScore ?? "—"}
                <span className="text-lg font-semibold text-slate-400">/100</span>
              </div>
              <div className="text-xs font-semibold" style={{ color: band.color }}>{band.label}</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: seo.color }}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search / SEO</div>
              <div className="mt-1 text-4xl font-extrabold" style={{ color: seo.color }}>
                {demo.seoScore ?? "—"}
                <span className="text-lg font-semibold text-slate-400">/100</span>
              </div>
              <div className="text-xs font-semibold" style={{ color: seo.color }}>{seo.label}</div>
            </div>
          </div>

          {/* Critical / Warnings / Passed buckets */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">✕</span>
                <span className="font-bold text-slate-900">{buckets.critical.count} Critical</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{buckets.critical.hint}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600">⚠</span>
                <span className="font-bold text-slate-900">{buckets.warnings.count} Warnings</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{buckets.warnings.hint}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
                <span className="font-bold text-slate-900">{buckets.passed.count} Passed</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{buckets.passed.hint}</p>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            Any compliance score below 100 carries real ADA/WCAG exposure — over 4,000 web-accessibility lawsuits
            were filed in the U.S. last year, most against small businesses.
          </p>

          {demo.beforeShot && (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={demo.beforeShot} alt="Your current website" className="block max-h-[420px] w-full object-cover object-top" />
            </div>
          )}
        </section>

        {/* Section 2 — cost */}
        {issues.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">What it&apos;s costing you</h2>
            <ul className="mt-3 space-y-2">
              {issues.map((it, i) => (
                <li key={i} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="text-red-500">✕</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Section 3 — the fix */}
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Your new site — we already built it
          </h2>
          <div className="mt-3 flex items-center gap-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-center">
              <div className="text-4xl font-extrabold text-emerald-600">
                {demo.afterScore ?? 100}
                <span className="text-lg font-semibold text-emerald-300">/100</span>
              </div>
              <div className="text-xs font-semibold text-emerald-600">Fully compliant</div>
            </div>
            <p className="text-sm text-slate-700">
              A bespoke, modern redesign built from your real content — faster, clearer, and engineered to turn
              visitors into calls and bookings. It ships with a live accessibility compliance badge and ongoing
              weekly monitoring.
            </p>
          </div>

          <div className="no-print mt-4 overflow-hidden rounded-xl border border-slate-200">
            <iframe title="Your redesign" srcDoc={demo.redesignHtml ?? ""} className="h-[520px] w-full border-0" />
          </div>

          <div className="mt-4 rounded-xl bg-slate-900 p-5 text-center text-white">
            <p className="text-sm text-slate-300">Click through the full, interactive redesign — on desktop or your phone:</p>
            <Link href={`/demo/${demo.token}`} className="mt-2 inline-block rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-white hover:bg-emerald-400">
              Open your live redesign →
            </Link>
          </div>
        </section>

        {/* Section 4 — offer */}
        <section className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Everything Hey Lily handles</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-3">
            {[
              "Custom website",
              "Accessibility compliance",
              "Uptime monitoring",
              "Reviews",
              "Payments",
              "Managed email",
            ].map((f) => (
              <div key={f} className="rounded-lg bg-slate-50 px-3 py-2">✓ {f}</div>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-slate-600">
            Ready to launch this as your real site? Let&apos;s talk.
          </p>
          <div className="mt-3 text-center">
            <a
              href={process.env.DEMO_CTA_URL || "https://heylily.ai"}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Book a call with Hey Lily
            </a>
          </div>
        </section>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Prepared by Hey Lily · heylily.ai · Compliance scored automatically with axe-core against WCAG 2.1 AA.
        </p>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { .no-print { display: none !important; } body { background: #fff !important; } @page { margin: 12mm; } }`,
        }}
      />
    </div>
  );
}
