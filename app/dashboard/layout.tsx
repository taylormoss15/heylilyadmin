import Link from "next/link";
import LogoutButton from "./logout-button";
import DashboardNav from "./dashboard-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-base font-semibold text-slate-900">
            Hey Lily Admin
          </Link>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-8">
        <DashboardNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
