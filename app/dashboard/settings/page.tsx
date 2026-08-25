import Link from "next/link";
import { getCurrentUser, isOwner } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return <div className="card text-sm text-slate-500">Only owners can access settings.</div>;
  }

  const items = [
    { href: "/dashboard/team", label: "Team", desc: "Add sales reps, set roles, and give them logins." },
    { href: "/dashboard/emails", label: "System emails", desc: "Preview and test every email the platform sends." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Team access and the emails your platform sends.</p>
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
