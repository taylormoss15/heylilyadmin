import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBusinessData, parsePageIR, parseTheme } from "@/lib/site/ir";
import { runAiEdit } from "@/lib/site/ai-editor";
import { renderPageRecord } from "@/lib/site/render-record";
import { getSessionFromCookies } from "@/lib/auth";

const bodySchema = z.object({
  pageId: z.string().min(1),
  instruction: z.string().min(1),
});

// AI editing runs the model, applies the validated result to the page (and
// theme), and snapshots a version — same persistence path as a manual edit,
// so undo and the audit trail cover AI changes too.
export async function POST(request: NextRequest, { params }: { params: { siteId: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: params.siteId } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const page = await prisma.page.findFirst({
    where: { id: parsed.data.pageId, siteId: site.id },
  });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  let result;
  try {
    result = await runAiEdit({
      instruction: parsed.data.instruction,
      currentIr: parsePageIR(page.ir),
      theme: parseTheme(site.theme),
      business: parseBusinessData(site.businessData),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI edit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Persist the AI's changes.
  const updatedPage = await prisma.page.update({
    where: { id: page.id },
    data: { ir: JSON.stringify(result.ir) },
  });
  if (result.theme) {
    await prisma.site.update({
      where: { id: site.id },
      data: { theme: JSON.stringify(result.theme) },
    });
  }

  const session = await getSessionFromCookies();
  const freshSite = result.theme ? { ...site, theme: JSON.stringify(result.theme) } : site;
  const render = renderPageRecord(updatedPage, freshSite);
  await prisma.pageVersion.create({
    data: {
      pageId: page.id,
      ir: updatedPage.ir,
      html: render.html,
      createdBy: `${session?.userId ?? "system"} (ai)`,
    },
  });

  return NextResponse.json({
    ir: result.ir,
    theme: result.theme ?? null,
    summary: result.summary,
    dryRun: result.dryRun,
  });
}
