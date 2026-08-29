import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import DemoViewer from "./demo-viewer";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  const name = demo?.businessName || "your business";
  return { title: `A new website for ${name} — Hey Lily`, robots: { index: false } };
}

export default async function DemoPage({ params }: { params: { token: string } }) {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  if (!demo || demo.status !== "READY" || !demo.redesignHtml) notFound();

  // Track engagement — how many times the prospect opened their redesign.
  prisma.demo
    .update({ where: { token: params.token }, data: { views: { increment: 1 }, lastViewedAt: new Date() } })
    .catch(() => {});

  // Route the CTA to the assigned rep's Calendly (falling back to the team link
  // then the generic CTA), tagged with the prospect id so a booking maps back.
  const ownerId =
    demo.ownerId ||
    (demo.prospectId ? (await prisma.prospect.findUnique({ where: { id: demo.prospectId } }))?.ownerId ?? null : null);
  const owner = ownerId ? await prisma.adminUser.findUnique({ where: { id: ownerId } }) : null;
  const bookBase = owner?.calendlyUrl || process.env.CALENDLY_URL || process.env.DEMO_CTA_URL || "https://heylily.ai";
  const ctaUrl = demo.prospectId
    ? `${bookBase}${bookBase.includes("?") ? "&" : "?"}utm_content=${encodeURIComponent(demo.prospectId)}`
    : bookBase;

  return (
    <DemoViewer
      businessName={demo.businessName || "Your business"}
      sourceUrl={demo.sourceUrl}
      beforeShot={demo.beforeShot}
      siteSrc={`/demo/${demo.token}/site`}
      beforeTrust={demo.beforeTrust}
      afterTrust={demo.afterTrust}
      reportUrl={`/demo/${demo.token}/report`}
      ctaUrl={ctaUrl}
    />
  );
}
