"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Left sidebar for a single account. Makes it obvious which account you're in
// and which area you're working on, with a clear way back to the full list.
const ITEMS: { href: string; label: string; hint: string }[] = [
  { href: "", label: "Overview", hint: "Everything at a glance" },
  { href: "/website", label: "Website", hint: "Design & AI editor" },
  { href: "/compliance", label: "Accessibility", hint: "Audit trail & badge" },
  { href: "/uptime", label: "Uptime", hint: "Incidents & monitor" },
  { href: "/email", label: "Managed email", hint: "Mailboxes" },
  { href: "/business", label: "Business details", hint: "Hosting, domain, notes" },
  { href: "/activity", label: "Activity", hint: "GHL sync log" },
];

// Things we deliberately manage inside GHL, shown as labels so it's obvious
// where they live (not empty pages that imply missing features).
const EXTERNAL: { label: string; hint: string }[] = [
  { label: "Reviews", hint: "Managed in GHL" },
  { label: "Payments", hint: "Managed in GHL" },
];

export default function ClientNav({
  clientId,
  name,
  tier,
  status,
}: {
  clientId: string;
  name: string;
  tier: string;
  status: string;
}) {
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;

  return (
    <nav className="w-56 shrink-0 space-y-4">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        ← All accounts
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="truncate text-sm font-semibold text-slate-900" title={name}>
          {name}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-slate-600">
            {tier.toLowerCase()}
          </span>
          <span className={`badge badge-${status.toLowerCase()} text-[11px]`}>
            {status.replace("_", " ").toLowerCase()}
          </span>
        </div>
      </div>

      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? pathname === base : pathname === href;
          return (
            <li key={item.href}>
              <Link
                href={href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.label}
                <span className="block text-[11px] font-normal text-slate-400">{item.hint}</span>
              </Link>
            </li>
          );
        })}
        {EXTERNAL.map((item) => (
          <li key={item.label}>
            <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400">
              <span>{item.label}</span>
              <span className="text-[11px]">{item.hint}</span>
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}
