import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { editCustomSite } from "@/lib/site/ai-designer";
import { finalizeCustomHtml } from "@/lib/site/finalize";
import { screenshotHtml } from "@/lib/site/screenshot";
import type { BusinessData, PageIR } from "@/lib/site/ir";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Apply a plain-English tweak to a prospect's generated demo site (colour,
// phone number, email, wording, etc.). Uses the stored BusinessData so there's
// no re-scrape; re-finalizes, re-screenshots, and saves in place.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const instruction = (await request.json().catch(() => ({})))?.instruction;
  if (typeof instruction !== "string" || !instruction.trim()) {
    return NextResponse.json({ error: "Describe the change you want." }, { status: 400 });
  }

  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!prospect?.demoToken) return NextResponse.json({ error: "No demo to edit yet." }, { status: 404 });

  const demo = await prisma.demo.findUnique({ where: { token: prospect.demoToken } });
  if (!demo?.redesignHtml) return NextResponse.json({ error: "This demo has no site to edit." }, { status: 404 });

  const business: BusinessData = (() => {
    try {
      if (demo.businessData) return JSON.parse(demo.businessData) as BusinessData;
    } catch {
      /* fall through */
    }
    return { name: demo.businessName || "", faqs: [] } as unknown as BusinessData;
  })();

  const clientId = `demo:${demo.token}`;
  const finalizeOpts = { clientId, business, adminBaseUrl: process.env.ADMIN_BASE_URL, showCookieBanner: false, showBadge: false };

  let finalized: string;
  let summary: string;
  let afterScore: number | null;
  try {
    const design = await editCustomSite(
      { business, ir: {} as unknown as PageIR, clientId, showCookieBanner: false, showBadge: false, adminBaseUrl: process.env.ADMIN_BASE_URL },
      demo.redesignHtml,
      instruction.trim()
    );
    finalized = finalizeCustomHtml(design.html, finalizeOpts);
    summary = design.summary;
    afterScore = design.report.a11yScore;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const afterShot = await screenshotHtml(finalized);

  await prisma.demo.update({
    where: { token: demo.token },
    data: { redesignHtml: finalized, afterShot: afterShot ?? demo.afterShot, afterScore: afterScore ?? demo.afterScore },
  });

  return NextResponse.json({ ok: true, summary });
}
