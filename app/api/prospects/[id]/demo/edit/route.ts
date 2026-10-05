import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import { editCustomSite } from "@/lib/site/ai-designer";
import { finalizeCustomHtml } from "@/lib/site/finalize";
import { screenshotHtml } from "@/lib/site/screenshot";
import type { BusinessData, PageIR } from "@/lib/site/ir";
import { designChatSchema } from "@/lib/site/design-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Apply a plain-English tweak to a prospect's generated demo site (colour,
// phone number, email, wording, etc.). Uses the stored BusinessData so there's
// no re-scrape; re-finalizes, re-screenshots, and saves in place.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = designChatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a message and attach up to two PNG, JPEG or WebP screenshots (3 MB each). Keep the conversation to 12 recent messages." }, { status: 400 });
  }
  const { instruction, history, screenshots, chat } = parsed.data;

  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (prospect && !isOwner(me) && prospect.ownerId !== me.id) {
    return NextResponse.json({ error: "You can only edit your own leads." }, { status: 403 });
  }
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
      instruction,
      chat ? { history, screenshots } : undefined
    );
    if (design.dryRun) {
      return NextResponse.json({ error: "AI editing is not configured for this environment." }, { status: 503 });
    }
    if (design.discussionOnly) return NextResponse.json({ ok: true, summary: design.summary, changed: false });
    finalized = finalizeCustomHtml(design.html, finalizeOpts);
    summary = design.summary;
    afterScore = design.report.a11yScore;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const afterShot = await screenshotHtml(finalized);

  await prisma.$transaction([prisma.demo.update({
    where: { token: demo.token },
    data: { redesignHtml: finalized, afterShot: afterShot ?? demo.afterShot, afterScore: afterScore ?? demo.afterScore },
  }),
  // A changed site must be reviewed again before outreach.
  prisma.prospect.update({ where: { id: prospect.id }, data: { reviewStatus: "PENDING" } })]);
  return NextResponse.json({ ok: true, summary, changed: true });
}
