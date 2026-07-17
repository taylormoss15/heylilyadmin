import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StatusEditor from "../status-editor";
import BusinessForm from "./business-form";

export const dynamic = "force-dynamic";

export default async function ClientBusinessPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Business details</h1>
          <p className="text-sm text-slate-500">Account status, hosting, and troubleshooting notes.</p>
        </div>
        <StatusEditor clientId={client.id} status={client.status} tier={client.tier} />
      </div>

      <BusinessForm
        clientId={client.id}
        initial={{
          name: client.name,
          domain: client.domain ?? "",
          siteUrl: client.siteUrl ?? "",
          ghlLocationId: client.ghlLocationId ?? "",
          hostingProvider: client.hostingProvider ?? "",
          domainRegistrar: client.domainRegistrar ?? "",
          dnsProvider: client.dnsProvider ?? "",
          internalNotes: client.internalNotes ?? "",
          hasTrackers: client.hasTrackers,
        }}
      />
    </div>
  );
}
