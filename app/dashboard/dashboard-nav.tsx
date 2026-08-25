"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-level dashboard sections. The active section stays lit as you drill into
// its detail pages (an account, a prospect), so you always know where you are.
const SECTIONS: { href: string; label: string; hint: string; ownerOnly?: boolean; match: (p: string) => boolean }[] = [
  {
    href: "/dashboard",
    label: "Accounts",
    hint: "Your customers",
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/clients") || p.startsWith("/dashboard/sites"),
  },
  {
    href: "/dashboard/prospecting",
    label: "Prospecting",
    hint: "Score & convert leads",
    match: (p) => p.startsWith("/dashboard/prospecting"),
  },
  {
    href: "/dashboard/launchpad",
    label: "Launchpad",
    hint: "Paid → get them live",
    match: (p) => p.startsWith("/dashboard/launchpad"),
  },
  {
    href: "/dashboard/demos",
    label: "Demos",
    hint: "Sent demos & opens",
    match: (p) => p.startsWith("/dashboard/demos"),
  },
  {
    href: "/dashboard/emails",
    label: "Emails",
    hint: "Preview & test templates",
    match: (p) => p.startsWith("/dashboard/emails"),
  },
  {
    href: "/dashboard/team",
    label: "Team",
    hint: "Reps & lead access",
    ownerOnly: true,
    match: (p) => p.startsWith("/dashboard/team"),
  },
];

export default function DashboardNav({
  launchpadPending = 0,
  launchpadOverdue = 0,
  isOwner = true,
}: {
  isOwner?: boolean;
  launchpadPending?: number;
  launchpadOverdue?: number;
}) {
  const pathname = usePathname();
  return (
    <nav className="w-44 shrink-0 space-y-1">
      {SECTIONS.filter((s) => isOwner || !s.ownerOnly).map((s) => {
        const active = s.match(pathname);
        const showBadge = s.href === "/dashboard/launchpad" && launchpadPending > 0;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`block rounded-lg px-3 py-2 text-sm transition ${
              active
                ? "bg-slate-900 font-medium text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              {s.label}
              {showBadge && (
                <span
                  title={`${launchpadPending} paid, not live${launchpadOverdue ? ` · ${launchpadOverdue} overdue` : ""}`}
                  className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${
                    launchpadOverdue > 0 ? "bg-red-600" : "bg-amber-500"
                  }`}
                >
                  {launchpadPending}
                </span>
              )}
            </span>
            <span className={`block text-[11px] font-normal ${active ? "text-slate-300" : "text-slate-400"}`}>
              {s.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
