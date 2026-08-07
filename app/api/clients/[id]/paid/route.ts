import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ paid: z.boolean() });

// Mark an account paid / not paid. Sets paidAt (which puts it on the Launchpad
// as high-priority until it's fully live). Checkout auto-sets this later.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const existing = await prisma.client.findUnique({ where: { id: params.id }, select: { paidAt: true } });
  if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const client = await prisma.client.update({
    where: { id: params.id },
    // Keep the original paid date if already paid; only set on first mark.
    data: { paidAt: parsed.data.paid ? existing.paidAt ?? new Date() : null },
  });

  return NextResponse.json({ ok: true, paidAt: client.paidAt });
}
