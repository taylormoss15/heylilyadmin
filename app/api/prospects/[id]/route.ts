import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProspectUrl } from "@/lib/prospecting/scan";

const patchSchema = z.object({
  url: z.string().max(300).optional(),
  businessName: z.string().max(120).nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  estimatedRevenue: z.string().max(60).nullable().optional(),
  employees: z.string().max(60).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  leadName: z.string().max(120).nullable().optional(),
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

  const { url: rawUrl, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  // Correcting a wrong domain: re-normalize and guard the unique constraint.
  // Changing the URL invalidates the old scan, so reset scan state to PENDING
  // so the lead can be re-scanned against the corrected site.
  if (rawUrl !== undefined) {
    const url = normalizeProspectUrl(rawUrl);
    if (!url) return NextResponse.json({ error: "That doesn't look like a valid website address." }, { status: 400 });
    if (url !== existing.url) {
      const clash = await prisma.prospect.findUnique({ where: { url } });
      if (clash && clash.id !== existing.id) {
        return NextResponse.json({ error: "Another lead already uses that website." }, { status: 409 });
      }
      data.url = url;
      data.scanStatus = "PENDING";
      data.scanError = null;
    }
  }

  const prospect = await prisma.prospect.update({ where: { id: params.id }, data });
  return NextResponse.json({ prospect });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  await prisma.prospect.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
