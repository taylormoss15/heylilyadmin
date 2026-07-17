import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().min(1).nullable().optional(),
  siteUrl: z.string().url().nullable().optional(),
  ghlLocationId: z.string().min(1).nullable().optional(),
  tier: z.enum(["STARTER", "PRO", "PREMIUM"]).optional(),
  status: z.enum(["ACTIVE", "AT_RISK", "CHURNED"]).optional(),
  hasTrackers: z.boolean().optional(),
  scanCadenceDays: z.number().int().positive().optional(),
  hostingProvider: z.string().max(120).nullable().optional(),
  domainRegistrar: z.string().max(120).nullable().optional(),
  dnsProvider: z.string().max(120).nullable().optional(),
  internalNotes: z.string().max(5000).nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 30 },
      remediationNotes: { orderBy: { createdAt: "desc" }, take: 20 },
      uptimeIncidents: { orderBy: { startedAt: "desc" }, take: 20 },
      uptimeMonitor: true,
      emailSeats: true,
      ghlSyncLogs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ client });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.client.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const client = await prisma.client.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ client });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.client.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  await prisma.client.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
