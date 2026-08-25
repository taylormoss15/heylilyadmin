import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";

const bodySchema = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]) });

// The rep gate: approve a scanned lead (its preview) for the send queue, or
// reject it. Reps can only review their own leads.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const prospect = await prisma.prospect.findUnique({ where: { id: params.id }, select: { ownerId: true } });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isOwner(me) && prospect.ownerId !== me.id) {
    return NextResponse.json({ error: "You can only review your own leads." }, { status: 403 });
  }

  await prisma.prospect.update({ where: { id: params.id }, data: { reviewStatus: parsed.data.status } });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
