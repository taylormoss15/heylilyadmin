import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBusinessData, parsePageIR, parseTheme } from "@/lib/site/ir";
import SiteEditor from "./site-editor";

export const dynamic = "force-dynamic";

export default async function SiteEditorPage({ params }: { params: { siteId: string } }) {
  const site = await prisma.site.findUnique({
    where: { id: params.siteId },
    include: { pages: { orderBy: { isHome: "desc" } }, client: true },
  });

  if (!site) notFound();

  const homePage = site.pages.find((p) => p.isHome) ?? site.pages[0];
  if (!homePage) notFound();

  // Parse the JSON columns server-side (validated) and hand plain objects
  // to the client editor.
  const theme = parseTheme(site.theme);
  const businessData = parseBusinessData(site.businessData);
  const ir = parsePageIR(homePage.ir);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/dashboard/clients/${site.clientId}`} className="text-sm text-brand-600 hover:underline">
            ← {site.client.name}
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">{site.name}</h1>
        </div>
      </div>

      <SiteEditor
        siteId={site.id}
        pageId={homePage.id}
        initialName={site.name}
        initialStatus={site.status}
        initialShowCookieBanner={site.showCookieBanner}
        initialTheme={theme}
        initialBusinessData={businessData}
        initialSections={ir.sections}
      />
    </div>
  );
}
