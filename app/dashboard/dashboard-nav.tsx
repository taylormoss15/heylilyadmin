"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-level dashboard sections. The active section stays lit as you drill into
// its detail pages (an account, a prospect), so you always know where you are.
const SECTIONS: { href: string; label: string; hint: string; match: (p: string) => boolean }[] = [
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
    href: "/dashboard/demos",
    label: "Demos",
    hint: "Sent demos & opens",
    match: (p) => p.startsWith("/dashboard/demos"),
  },
];

export default function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="w-44 shrink-0 space-y-1">
      {SECTIONS.map((s) => {
        const active = s.match(pathname);
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
            {s.label}
            <span className={`block text-[11px] font-normal ${active ? "text-slate-300" : "text-slate-400"}`}>
              {s.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
