import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public: one-click unsubscribe (POST from the confirm page). Idempotent —
// suppresses all future outreach to this lead. Never errors on unknown ids so
// scanners/prefetch can't probe.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  await prisma.prospect
    .updateMany({ where: { id: params.id, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
