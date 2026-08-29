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

// A circular progress ring rendered as inline SVG (server-safe, no JS). Used for
// the headline Digital Trust Score and the pillar scores.
function ScoreRing({
  value,
  max = 100,
  color,
  track = "rgba(148,163,184,0.25)",
  size = 128,
  stroke = 11,
  suffix = true,
}: {
  value: number | null;
  max?: number;
  color: string;
  track?: string;
  size?: number;
  stroke?: number;
  suffix?: boolean;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, (value ?? 0) / max));
  const dash = circ * pct;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={color} fontSize={size * 0.32} fontWeight="800">
        {value ?? "—"}
      </text>
      {suffix && value !== null && (
        <text x="50%" y={size / 2 + size * 0.19} dominantBaseline="central" textAnchor="middle" fill={color} fontSize={size * 0.1} fontWeight="600" opacity="0.6">
          /{max}
        </text>
      )}
    </svg>
  );
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
      hint: failedSeo.length > 0 ? failedSeo.slice(0, 3).map((c) => c.label).join(", ") : "Minor accessibility and on-page issues.",
    },
    passed: {
      count: passedSeo.length,
      hint: passedSeo.length > 0 ? passedSeo.slice(0, 3).map((c) => c.label).join(", ") : "The basics that are already in place.",
    },
  };

  const host = (() => {
    try {
      return new URL(demo.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return demo.sourceUrl;
    }
  })();
  const date = new Date(demo.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const beforeT = demo.beforeTrust;
  const afterT = demo.afterTrust ?? 92;
  const gain = beforeT !== null ? Math.max(0, afterT - beforeT) : null;
  const topIssues = issues.slice(0, 3);
  const unlocked = demo.unlocked;
  const buyUrl = `/demo/${demo.token}/checkout`;
  const business = demo.businessName || host;

  // Prefer the assigned rep's own Calendly so the booking routes to whoever owns
  // this lead; fall back to the team round-robin link, then the generic CTA.
  const ownerId =
    demo.ownerId ||
    (demo.prospectId ? (await prisma.prospect.findUnique({ where: { id: demo.prospectId } }))?.ownerId ?? null : null);
  const owner = ownerId ? await prisma.adminUser.findUnique({ where: { id: ownerId } }) : null;
  const bookBase = owner?.calendlyUrl || process.env.CALENDLY_URL || process.env.DEMO_CTA_URL || "https://heylily.ai";
  const bookUrl = demo.prospectId
    ? `${bookBase}${bookBase.includes("?") ? "&" : "?"}utm_content=${encodeURIComponent(demo.prospectId)}`
    : bookBase;

  const features = [
    ["🎨", "Custom website", "Bespoke design built to convert"],
    ["♿", "Accessibility compliance", "WCAG 2.1 AA + live badge"],
    ["📈", "Search & AI visibility", "Found on Google and AI answers"],
    ["🟢", "Uptime monitoring", "We watch it 24/7"],
    ["⭐", "Reviews & reputation", "More 5-star reviews, automatically"],
    ["✉️", "Managed email & payments", "Done-for-you, end to end"],
  ] as const;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Screen-only action bar */}
      <div className="no-print sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href={`/demo/${demo.token}`} className="text-sm font-medium text-slate-500 transition hover:text-slate-900">
            ← Interactive demo
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 sm:inline">Prepared for {business}</span>
            <PrintButton />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:pb-10">
        {/* ===== HERO ===== */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-[#16224a] text-white shadow-xl ring-1 ring-white/10">
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-brand-100">Hey&nbsp;Lily</span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">Website Health Report</span>
              </div>
              <span className="text-xs text-slate-400">{date}</span>
            </div>

            <h1 className="mt-6 text-3xl font-extrabold leading-tight sm:text-4xl">{business}</h1>
            <a href={demo.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-slate-400 hover:text-slate-200">
              {host} ↗
            </a>

            {beforeT !== null && (
              <div className="mt-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Your Digital Trust Score</div>
                <div className="mt-4 flex flex-wrap items-center gap-6 sm:gap-9">
                  <div className="flex flex-col items-center">
                    <ScoreRing value={beforeT} color="#f87171" size={116} />
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Today</div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <svg width="46" height="16" viewBox="0 0 46 16" className="text-slate-500">
                      <path d="M0 8h40M34 2l7 6-7 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {gain !== null && gain > 0 && (
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">+{gain} pts</span>
                    )}
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="rounded-full bg-emerald-400/10 p-1.5 ring-1 ring-emerald-400/30">
                      <ScoreRing value={afterT} color="#34d399" size={148} stroke={12} />
                    </div>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">With your new site</div>
                  </div>

                  <p className="min-w-[220px] flex-1 text-sm leading-relaxed text-slate-300">
                    One number across <strong className="text-white">compliance</strong>, <strong className="text-white">search</strong>, and{" "}
                    <strong className="text-white">AI answer engines</strong>. We can take {business} from{" "}
                    <strong className="text-white">{beforeT}</strong> to <strong className="text-emerald-300">{afterT}</strong> — and off the
                    accessibility-lawsuit radar for good.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===== TODAY ===== */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900">Where your site stands today</h2>
          <p className="mt-1 text-sm text-slate-500">Two automated scores, and everything our scan found — grouped by urgency.</p>

          {/* Pillar rings */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              { label: "Compliance", sub: "ADA / WCAG 2.1 AA", score: demo.beforeScore, b: band },
              { label: "Search & SEO", sub: "How findable you are", score: demo.seoScore, b: seo },
            ].map((p) => (
              <div key={p.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <ScoreRing value={p.score} color={p.b.color} size={92} stroke={9} />
                <div>
                  <div className="text-sm font-semibold text-slate-500">{p.label}</div>
                  <div className="text-lg font-bold" style={{ color: p.b.color }}>{p.b.label}</div>
                  <div className="text-xs text-slate-400">{p.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Critical / Warnings / Passed */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { n: buckets.critical.count, label: "Critical", hint: buckets.critical.hint, ring: "#dc2626", bg: "bg-red-50", bar: "bg-red-500", text: "text-red-600", icon: "✕" },
              { n: buckets.warnings.count, label: "Warnings", hint: buckets.warnings.hint, ring: "#d97706", bg: "bg-amber-50", bar: "bg-amber-500", text: "text-amber-600", icon: "⚠" },
              { n: buckets.passed.count, label: "Passed", hint: buckets.passed.hint, ring: "#059669", bg: "bg-emerald-50", bar: "bg-emerald-500", text: "text-emerald-600", icon: "✓" },
            ].map((c) => (
              <div key={c.label} className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}>
                <div className={`h-1.5 ${c.bar}`} />
                <div className="p-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-4xl font-extrabold text-slate-900">{c.n}</span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${c.bg} ${c.text} text-sm font-bold`}>{c.icon}</span>
                  </div>
                  <div className={`mt-1 text-sm font-bold ${c.text}`}>{c.label}</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{c.hint}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Risk callout */}
          <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-lg">
            <div className="grid gap-px bg-white/15 sm:grid-cols-3">
              {[
                ["$25K–$50K", "typical settlement"],
                ["4,000+", "U.S. lawsuits last year"],
                ["Small biz", "the #1 target"],
              ].map(([big, small]) => (
                <div key={small} className="bg-gradient-to-br from-red-600 to-rose-700 px-5 py-4 text-center">
                  <div className="text-2xl font-extrabold">{big}</div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-red-100">{small}</div>
                </div>
              ))}
            </div>
            <div className="px-6 py-5 text-sm leading-relaxed text-red-50">
              <p className="font-bold text-white">The hard truth about a non-compliant site</p>
              <p className="mt-1">
                These ADA/accessibility lawsuits end in a settlement — or a long, painful fight you&apos;ll lose, because the site genuinely
                isn&apos;t compliant. It&apos;s unfair, and we hate that there are sharks who go after small businesses like this.
              </p>
              <p className="mt-2">
                That&apos;s exactly why Hey Lily exists — a genuinely high-quality, fully-compliant site at a price that actually makes sense.
              </p>
            </div>
          </div>

          {demo.beforeShot && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your site today</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={demo.beforeShot} alt="Your current website" className="block max-h-[420px] w-full object-cover object-top" />
              </div>
            </div>
          )}
        </section>

        {/* ===== COST / UNLOCK ===== */}
        {issues.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-slate-900">What it&apos;s costing you</h2>
            <ul className="mt-4 space-y-2.5">
              {(unlocked ? issues : topIssues).map((it, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-700 shadow-sm">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-[11px] font-bold text-red-600">✕</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>

            {!unlocked && (
              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="bg-gradient-to-br from-slate-900 to-[#16224a] px-6 py-7 text-center text-white">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl">🔒</div>
                  <h3 className="mt-3 text-xl font-extrabold">
                    Unlock your full report{issues.length > topIssues.length ? ` — ${issues.length - topIssues.length} more findings` : ""}
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
                    Every recommendation in plain English, plus your new fully-compliant website built, launched, and monitored so your score
                    keeps climbing.
                  </p>
                </div>
                <div className="flex flex-col items-center gap-4 px-6 py-6">
                  <div className="text-center">
                    <span className="text-4xl font-extrabold text-slate-900">$1,000</span>
                    <span className="text-base font-medium text-slate-400"> setup</span>
                    <div className="text-sm text-slate-500">then $197/month · 12-month term</div>
                  </div>
                  <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
                    <a href={buyUrl} className="rounded-xl bg-emerald-500 px-7 py-3.5 text-center font-bold text-white shadow-sm transition hover:bg-emerald-400">
                      Buy now &amp; unlock →
                    </a>
                    <a href={bookUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-center font-bold text-slate-700 transition hover:bg-slate-50">
                      Book a demo to review it
                    </a>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ===== THE FIX ===== */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900">Your new site — we already built it</h2>
          <p className="mt-1 text-sm text-slate-500">Not a mockup. A real, working redesign from your own content — ready to launch.</p>

          {/* Before / after */}
          {(demo.beforeShot || demo.afterShot) && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Before · {beforeT ?? "—"}</div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 opacity-90 shadow-sm">
                  {demo.beforeShot ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={demo.beforeShot} alt="Before" className="block h-56 w-full object-cover object-top grayscale" />
                  ) : (
                    <div className="flex h-56 items-center justify-center bg-slate-100 text-sm text-slate-400">Your current site</div>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">After · {afterT}</div>
                <div className="overflow-hidden rounded-2xl border-2 border-emerald-300 shadow-md ring-2 ring-emerald-100">
                  {demo.afterShot ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={demo.afterShot} alt="After" className="block h-56 w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-56 items-center justify-center bg-emerald-50 text-sm font-medium text-emerald-600">Your new redesign</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <ScoreRing value={demo.afterScore ?? 100} color="#059669" size={84} stroke={9} />
            <p className="text-sm leading-relaxed text-slate-700">
              A bespoke, modern redesign — faster, clearer, and engineered to turn visitors into calls and bookings. It ships with a{" "}
              <strong>live accessibility compliance badge</strong> and ongoing <strong>weekly monitoring</strong>.
            </p>
          </div>

          <div className="no-print mt-5 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-2 truncate text-xs text-slate-400">{host} · redesigned by Hey Lily</span>
            </div>
            <iframe title="Your redesign" src={`/demo/${demo.token}/site`} className="h-[520px] w-full border-0" />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-[#16224a] p-6 text-center text-white">
            <p className="text-sm text-slate-300">Click through the full, interactive redesign — on desktop or your phone.</p>
            <Link href={`/demo/${demo.token}`} className="mt-3 inline-block rounded-xl bg-emerald-500 px-6 py-3 font-bold text-white shadow-sm transition hover:bg-emerald-400">
              Open your live redesign →
            </Link>
          </div>
        </section>

        {/* ===== EVERYTHING WE HANDLE ===== */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900">Everything Hey Lily handles</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([icon, title, sub]) => (
              <div key={title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xl">{icon}</span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{title}</div>
                  <div className="text-xs text-slate-500">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="mt-10 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-10 text-center text-white shadow-xl sm:px-10">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Ready to launch this as your real site?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-brand-100">
            Get {business} fully compliant, faster, and built to win new clients — with Hey Lily handling all of it. Book a quick call and
            we&apos;ll walk you through your new site live.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={bookUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-8 py-3.5 font-bold text-brand-700 shadow-sm transition hover:bg-brand-50">
              📅 Book a call
            </a>
            <a href={buyUrl} className="rounded-xl bg-emerald-500 px-8 py-3.5 font-bold text-white shadow-sm transition hover:bg-emerald-400">
              Get started now →
            </a>
          </div>
          <p className="mt-4 text-xs text-brand-200">No pressure · See your live redesign · Cancel anytime</p>
        </section>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          Prepared by Hey Lily · heylily.ai · Compliance scored automatically with axe-core against WCAG 2.1 AA.
        </p>
      </div>

      {/* Sticky mobile CTA */}
      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <a href={bookUrl} target="_blank" rel="noreferrer" className="block rounded-xl bg-brand-600 py-3 text-center font-bold text-white">
          📅 Book a call with Hey Lily
        </a>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { .no-print { display: none !important; } body { background: #fff !important; } @page { margin: 12mm; } }`,
        }}
      />
    </div>
  );
}
