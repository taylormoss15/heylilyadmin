import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanClientAndPersist } from "@/lib/integrations/accessibility-scanner";

/** Trigger an on-demand accessibility scan for one client (outside the weekly cadence). */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const scan = await scanClientAndPersist(client);
  return NextResponse.json({ scan });
}
