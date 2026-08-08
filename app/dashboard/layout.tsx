import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeImplementation, inputsFromClient, implementationInclude } from "@/lib/onboarding";
import LogoutButton from "./logout-button";
import DashboardNav from "./dashboard-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Count paid accounts that aren't live yet (and how many are overdue) so the
  // Launchpad nav item can show an at-a-glance badge.
  const paid = await prisma.client.findMany({ where: { paidAt: { not: null } }, include: implementationInclude });
  let launchpadPending = 0;
  let launchpadOverdue = 0;
  for (const c of paid) {
    if (computeImplementation(inputsFromClient(c)).live) continue;
    launchpadPending += 1;
    if (c.paidAt && Date.now() - new Date(c.paidAt).getTime() >= 7 * 86_400_000) launchpadOverdue += 1;
  }

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
        <DashboardNav launchpadPending={launchpadPending} launchpadOverdue={launchpadOverdue} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
