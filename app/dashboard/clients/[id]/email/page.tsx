import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SeatForm from "../seat-form";
import SeatRow from "../seat-row";

export const dynamic = "force-dynamic";

export default async function ClientEmailPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: { emailSeats: true },
  });

  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Managed email</h1>
        <p className="text-sm text-slate-500">Mailboxes we run for this client.</p>
      </div>

      <section className="card space-y-4">
        <SeatForm clientId={client.id} />
        {client.emailSeats.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Email</th>
                <th className="pb-2">Provider</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {client.emailSeats.map((seat) => (
                <SeatRow
                  key={seat.id}
                  clientId={client.id}
                  seatId={seat.id}
                  seatEmail={seat.seatEmail}
                  provider={seat.provider}
                  status={seat.status}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">No mailboxes yet.</p>
        )}
      </section>
    </div>
  );
}
