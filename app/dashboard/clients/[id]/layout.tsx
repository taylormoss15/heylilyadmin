import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ClientNav from "./client-nav";

export const dynamic = "force-dynamic";

// Account shell: a persistent left sidebar (which account + what area) beside
// the active section. Every page under /dashboard/clients/[id] renders here.
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, tier: true, status: true },
  });

  if (!client) notFound();

  return (
    <div className="flex gap-8">
      <ClientNav clientId={client.id} name={client.name} tier={client.tier} status={client.status} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
