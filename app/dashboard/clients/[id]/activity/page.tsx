import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientActivityPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: { ghlSyncLogs: { orderBy: { createdAt: "desc" }, take: 50 } },
  });

  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Activity</h1>
        <p className="text-sm text-slate-500">Recent syncs and writes back into GHL.</p>
      </div>

      <section className="card space-y-2">
        {client.ghlSyncLogs.length === 0 ? (
          <p className="text-sm text-slate-400">No sync activity yet.</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-600">
            {client.ghlSyncLogs.map((log) => (
              <li key={log.id} className={log.success ? "" : "text-red-600"}>
                {new Date(log.createdAt).toLocaleString()} — {log.action}
                {!log.success && log.errorMessage ? `: ${log.errorMessage}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
