import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { provisionSeat, deprovisionSeat } from "@/lib/integrations/email-provisioning";

const createSeatSchema = z.object({
  provider: z.enum(["GOOGLE_WORKSPACE", "MICROSOFT_365"]),
  seatEmail: z.string().email(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const result = await provisionSeat(client.id, parsed.data.provider, parsed.data.seatEmail);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({ seat: result.seat, dryRun: result.dryRun }, { status: 201 });
}

const deleteSeatSchema = z.object({ seatId: z.string().min(1) });

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = deleteSeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const seat = await prisma.emailSeat.findUnique({ where: { id: parsed.data.seatId } });
  if (!seat || seat.clientId !== params.id) {
    return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  }

  const result = await deprovisionSeat(parsed.data.seatId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({ seat: result.seat, dryRun: result.dryRun });
}
