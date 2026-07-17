import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  businessName: z.string().max(120).nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  estimatedRevenue: z.string().max(60).nullable().optional(),
  employees: z.string().max(60).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["PROSPECT", "DISMISSED"]).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const prospect = await prisma.prospect.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ prospect });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  await prisma.prospect.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
