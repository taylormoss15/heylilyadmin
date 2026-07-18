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

  const ctaUrl = process.env.DEMO_CTA_URL || "https://heylily.ai";

  return (
    <DemoViewer
      businessName={demo.businessName || "Your business"}
      sourceUrl={demo.sourceUrl}
      beforeShot={demo.beforeShot}
      redesignHtml={demo.redesignHtml}
      beforeScore={demo.beforeScore}
      afterScore={demo.afterScore}
      reportUrl={`/demo/${demo.token}/report`}
      ctaUrl={ctaUrl}
    />
  );
}
