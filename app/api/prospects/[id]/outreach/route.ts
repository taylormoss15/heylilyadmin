import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import { sendOutreach } from "@/lib/prospecting/send-outreach";

// Send the outreach email to one prospect. Reps can only email their own leads.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOwner(me)) {
    const p = await prisma.prospect.findUnique({ where: { id: params.id }, select: { ownerId: true } });
    if (!p || p.ownerId !== me.id) {
      return NextResponse.json({ error: "You can only email your own leads." }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const result = await sendOutreach(params.id, { force: Boolean(body?.force) });

  if (!result.sent) return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  return NextResponse.json({ ok: true });
}
