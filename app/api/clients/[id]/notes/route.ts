import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { addContactNote } from "@/lib/integrations/ghl";
import { getSessionFromCookies } from "@/lib/auth";

const createNoteSchema = z.object({
  note: z.string().min(1),
  scanId: z.string().optional(),
});

/** Add a dated remediation note to a client's compliance record — part of the audit trail. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const session = await getSessionFromCookies();

  const remediationNote = await prisma.remediationNote.create({
    data: {
      clientId: client.id,
      scanId: parsed.data.scanId,
      note: parsed.data.note,
      createdBy: session?.userId ?? "system",
    },
  });

  if (client.ghlLocationId) {
    await addContactNote(client.id, client.ghlLocationId, `Accessibility remediation: ${parsed.data.note}`);
  }

  return NextResponse.json({ remediationNote }, { status: 201 });
}
