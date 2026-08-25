import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";

const bodySchema = z.object({ ownerId: z.string().nullable() });

// Assign a lead (and its demo) to a rep. Owners can assign to anyone; a rep can
// only claim an unassigned lead for themselves, or release their own.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const prospect = await prisma.prospect.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const target = parsed.data.ownerId;
  if (!isOwner(me)) {
    // Reps: may only claim an unassigned lead to themselves, or release their own.
    const claimingSelf = target === me.id && (!prospect.ownerId || prospect.ownerId === me.id);
    const releasingOwn = target === null && prospect.ownerId === me.id;
    if (!claimingSelf && !releasingOwn) {
      return NextResponse.json({ error: "You can only claim unassigned leads." }, { status: 403 });
    }
  }

  await prisma.prospect.update({ where: { id: params.id }, data: { ownerId: target } });
  await prisma.demo.updateMany({ where: { prospectId: params.id }, data: { ownerId: target } });

  return NextResponse.json({ ok: true, ownerId: target });
}
