import Link from "next/link";
import { getCurrentUser, isOwner } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type Tier = "required" | "optional";
interface Check {
  label: string;
  ok: boolean;
  tier: Tier;
  detail: string;
}

// Each capability and the env it depends on. `required` items block cold-email
// sending; `optional` items unlock extra features but don't block the core flow.
function buildChecks(): { group: string; checks: Check[] }[] {
  const has = (k: string) => Boolean(process.env[k] && String(process.env[k]).trim());
  return [
    {
      group: "Core — needed to send cold email",
      checks: [
        { label: "AI site builder", ok: has("ANTHROPIC_API_KEY"), tier: "required", detail: "ANTHROPIC_API_KEY — builds the demo websites" },
        { label: "Email sending (Resend)", ok: has("RESEND_API_KEY"), tier: "required", detail: "RESEND_API_KEY — nothing sends without it" },
        { label: "Cold-send From address", ok: has("OUTREACH_FROM_EMAIL"), tier: "required", detail: "OUTREACH_FROM_EMAIL — fallback From on mail.heylily.ai" },
        { label: "Company address (CAN-SPAM)", ok: has("COMPANY_ADDRESS"), tier: "required", detail: "COMPANY_ADDRESS — legally required in the footer" },
        { label: "Public base URL", ok: has("ADMIN_BASE_URL"), tier: "required", detail: "ADMIN_BASE_URL — report & unsubscribe links" },
        { label: "Transactional From", ok: has("RESEND_FROM"), tier: "optional", detail: "RESEND_FROM — digest/contact-form sender (has a default)" },
      ],
    },
    {
      group: "Payments",
      checks: [
        { label: "Stripe secret key", ok: has("STRIPE_SECRET_KEY"), tier: "optional", detail: "STRIPE_SECRET_KEY — creates checkout sessions" },
        { label: "Stripe webhook secret", ok: has("STRIPE_WEBHOOK_SECRET"), tier: "optional", detail: "STRIPE_WEBHOOK_SECRET — verifies payment succeeded" },
      ],
    },
    {
      group: "Daily digest",
      checks: [
        { label: "Cron secret", ok: has("CRON_SECRET"), tier: "optional", detail: "CRON_SECRET — must match the GitHub Actions secret" },
        { label: "Digest recipient", ok: has("OPS_DIGEST_EMAIL") || has("ADMIN_EMAIL"), tier: "optional", detail: "OPS_DIGEST_EMAIL — who gets the daily email" },
      ],
    },
    {
      group: "Later — go-live & extras",
      checks: [
        {
          label: "Before/after screenshots (R2)",
          ok: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"].every(has),
          tier: "optional",
          detail: "R2_* — puts real screenshots in the email (else a placeholder)",
        },
        {
          label: "Site hosting (Cloudflare)",
          ok: has("CLOUDFLARE_API_TOKEN") && has("CLOUDFLARE_ACCOUNT_ID"),
          tier: "optional",
          detail: "CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID — publish paid client sites",
        },
        { label: "Booking capture (Calendly)", ok: has("CALENDLY_WEBHOOK_SIGNING_KEY"), tier: "optional", detail: "CALENDLY_WEBHOOK_SIGNING_KEY — auto-flag booked demos 🔥" },
      ],
    },
  ];
}

function Dot({ ok, tier }: { ok: boolean; tier: Tier }) {
  const color = ok ? "bg-emerald-500" : tier === "required" ? "bg-red-500" : "bg-slate-300";
  return <span className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${color}`} />;
}

export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return <div className="card text-sm text-slate-500">Only owners can access settings.</div>;
  }

  const groups = buildChecks();
  const requiredMissing = groups.flatMap((g) => g.checks).filter((c) => c.tier === "required" && !c.ok);

  // The behind-the-scenes dashboards. Coolify is self-hosted, so its URL comes
  // from COOLIFY_URL when set (otherwise the card links to Coolify's site).
  const coolifyUrl = process.env.COOLIFY_URL || "https://coolify.io";
  const services = [
    { name: "Coolify", what: "Runs the app + database", why: "deploy, change env variables, read logs", href: coolifyUrl },
    { name: "Cloudflare", what: "Screenshots (R2) + client site hosting", why: "R2 buckets, API tokens, DNS", href: "https://dash.cloudflare.com" },
    { name: "Resend", what: "Sends all email", why: "verify domains, check delivery & bounces", href: "https://resend.com/domains" },
    { name: "Stripe", what: "Payments", why: "see charges, subscriptions, webhooks", href: "https://dashboard.stripe.com" },
    { name: "Anthropic", what: "AI site generation", why: "API key + usage/billing", href: "https://console.anthropic.com" },
    { name: "GitHub", what: "Your code + daily-digest cron", why: "code, the Actions cron secret", href: "https://github.com/taylormoss15/heylilyadmin" },
  ];

  const items = [
    { href: "/dashboard/team", label: "Team", desc: "Add sales reps, set roles, and give them logins." },
    { href: "/dashboard/emails", label: "System emails", desc: "Preview and test every email the platform sends." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Team access, the emails your platform sends, and setup status.</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">System status</h2>
          {requiredMissing.length === 0 ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">✓ Ready to send</span>
          ) : (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {requiredMissing.length} required item{requiredMissing.length === 1 ? "" : "s"} missing
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Green = set · <span className="text-red-600">red</span> = required &amp; missing · gray = optional, not set. Values come from your environment variables — set them in Coolify and redeploy.
        </p>

        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</div>
              <ul className="mt-1.5 space-y-1.5">
                {g.checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1.5"><Dot ok={c.ok} tier={c.tier} /></span>
                    <span className="flex-1">
                      <span className="font-medium text-slate-800">{c.label}</span>
                      {!c.ok && c.tier === "required" && <span className="ml-2 text-[11px] font-semibold text-red-600">MISSING</span>}
                      <span className="block text-[11px] text-slate-400">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-900">Where everything lives</h2>
        <p className="mt-1 text-xs text-slate-500">
          You do 99% of your work right here in the admin app. Only open the dashboards below when you need to change a key, verify a domain, or check delivery — <span className="font-medium">System status</span> above tells you which one.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-200 p-3 transition hover:border-brand-300"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{s.name}</span>
                <span className="text-[11px] text-brand-600">open ↗</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{s.what}</p>
              <p className="mt-1 text-[11px] text-slate-400">Go here to: {s.why}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="card transition hover:border-brand-300">
            <div className="font-medium text-slate-900">{i.label}</div>
            <p className="mt-1 text-sm text-slate-500">{i.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
