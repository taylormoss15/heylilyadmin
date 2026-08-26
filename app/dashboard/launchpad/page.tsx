import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeImplementation, inputsFromClient, implementationInclude } from "@/lib/onboarding";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import DigestButton from "./digest-button";

export const dynamic = "force-dynamic";

function daysSince(d: Date): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export default async function LaunchpadPage() {
  const me = await getCurrentUser();
  const clients = await prisma.client.findMany({
    where: { paidAt: { not: null } },
    include: implementationInclude,
    orderBy: { paidAt: "asc" },
  });

  const rows = clients.map((c) => ({
    id: c.id,
    name: c.name,
    paidAt: c.paidAt as Date,
    impl: computeImplementation(inputsFromClient(c)),
  }));

  const pending = rows.filter((r) => !r.impl.live);
  const live = rows.filter((r) => r.impl.live);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Launchpad</h1>
          <p className="text-sm text-slate-500">
            {pending.length} paid {pending.length === 1 ? "account" : "accounts"} not yet live — get these live ASAP ·{" "}
            {live.length} fully live
          </p>
        </div>
        {isOwner(me) && <DigestButton email={me!.email} />}
      </div>

      {pending.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          🎉 Every paid account is fully live. Nothing waiting.
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => {
            const age = daysSince(r.paidAt);
            const ageTone = age >= 7 ? "text-red-600" : age >= 3 ? "text-amber-600" : "text-slate-500";
            return (
              <div key={r.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/dashboard/clients/${r.id}`} className="font-medium text-brand-600 hover:underline">
                      {r.name}
                    </Link>
                    <div className={`text-xs font-medium ${ageTone}`}>
                      Paid {age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}
                      {age >= 7 && " · overdue"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                    Blocked at: {r.impl.blockedAt}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.impl.steps.map((s) => {
                    const isBlocker = s.label === r.impl.blockedAt;
                    return (
                      <span
                        key={s.key}
                        title={s.done ? "Done" : s.hint}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          s.done
                            ? "bg-emerald-100 text-emerald-700"
                            : isBlocker
                            ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {s.done ? "✓ " : isBlocker ? "→ " : ""}
                        {s.label}
                      </span>
                    );
                  })}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {r.impl.doneCount}/{r.impl.total} done ·{" "}
                  {r.impl.steps.find((s) => s.label === r.impl.blockedAt)?.hint}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {live.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-medium text-slate-900">Fully live ({live.length})</h2>
          <div className="flex flex-wrap gap-2">
            {live.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/clients/${r.id}`}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
              >
                ✓ {r.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
