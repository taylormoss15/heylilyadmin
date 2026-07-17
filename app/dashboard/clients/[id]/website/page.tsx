import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SiteList from "../site-list";

export const dynamic = "force-dynamic";

export default async function ClientWebsitePage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      sites: { orderBy: { createdAt: "desc" }, include: { _count: { select: { pages: true } } } },
    },
  });

  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Website</h1>
        <p className="text-sm text-slate-500">
          Build or import a site, then use the AI designer. Compliance is injected on every publish.
        </p>
      </div>

      <section className="card">
        <SiteList
          clientId={client.id}
          sites={client.sites.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            pageCount: s._count.pages,
          }))}
        />
      </section>
    </div>
  );
}
