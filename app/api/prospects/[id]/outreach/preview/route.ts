import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import { composeOutreachEmail } from "@/lib/prospecting/send-outreach";

export const dynamic = "force-dynamic";

async function canAccess(id: string) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (!isOwner(me)) {
    const p = await prisma.prospect.findUnique({ where: { id }, select: { ownerId: true } });
    if (!p || p.ownerId !== me.id) return { ok: false as const, status: 403, error: "Not your lead" };
  }
  return { ok: true as const };
}

// Render the outreach email exactly as it will send, for the preview screen.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const access = await canAccess(params.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const prospect = await prisma.prospect.findUnique({
    where: { id: params.id },
    select: { outreachSubject: true, outreachNote: true },
  });
  const built = await composeOutreachEmail(params.id);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  return NextResponse.json({
    subject: built.subject,
    html: built.html,
    savedSubject: prospect?.outreachSubject ?? "",
    savedNote: prospect?.outreachNote ?? "",
  });
}

// Save per-lead overrides (custom subject / note) and return the re-rendered email.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const access = await canAccess(params.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  await prisma.prospect.update({
    where: { id: params.id },
    data: { outreachSubject: subject || null, outreachNote: note || null },
  });

  const built = await composeOutreachEmail(params.id);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  return NextResponse.json({ ok: true, subject: built.subject, html: built.html });
}
