import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { convertProspect } from "@/lib/prospecting/convert";

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  tier: z.enum(["STARTER", "PRO", "PREMIUM"]).default("STARTER"),
});

// Convert a prospect into a Client. Carries its scan into the new client's
// audit trail as the "before" score, then marks the prospect CONVERTED so it
// drops off the Prospecting board.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  if (prospect.status === "CONVERTED" && prospect.convertedClientId) {
    return NextResponse.json({ error: "Already converted", clientId: prospect.convertedClientId }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { clientId } = await convertProspect({
    prospectId: prospect.id,
    tier: parsed.data.tier,
    name: parsed.data.name,
  });

  return NextResponse.json({ clientId }, { status: 201 });
}
