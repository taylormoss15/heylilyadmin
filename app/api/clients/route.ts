import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const createClientSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1).optional(),
  siteUrl: z.string().url().optional(),
  ghlLocationId: z.string().min(1).optional(),
  tier: z.enum(["STARTER", "PRO", "PREMIUM"]).default("STARTER"),
  hasTrackers: z.boolean().default(false),
  scanCadenceDays: z.number().int().positive().default(7),
});

export async function GET() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      accessibilityScans: { orderBy: { scannedAt: "desc" }, take: 1 },
      uptimeIncidents: { where: { resolvedAt: null }, orderBy: { startedAt: "desc" }, take: 1 },
      _count: { select: { emailSeats: true } },
    },
  });

  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await prisma.client.create({ data: parsed.data });
  return NextResponse.json({ client }, { status: 201 });
}
