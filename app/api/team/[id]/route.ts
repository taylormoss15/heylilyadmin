import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["OWNER", "SALES"]).optional(),
  calendlyUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  sendingEmail: z.string().email().optional().or(z.literal("")),
});

// Update a teammate's profile (phone, sending address, Calendly, role). Owner-
// only. Lets you set a rep's cold-sending address after they were created.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isOwner(me)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't let the last owner demote themselves out of ownership.
  if (parsed.data.role === "SALES" && target.role === "OWNER") {
    const owners = await prisma.adminUser.count({ where: { role: "OWNER" } });
    if (owners <= 1) return NextResponse.json({ error: "You can't remove the last owner." }, { status: 400 });
  }

  const d = parsed.data;
  await prisma.adminUser.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.role !== undefined ? { role: d.role } : {}),
      ...(d.calendlyUrl !== undefined ? { calendlyUrl: d.calendlyUrl || null } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
      ...(d.sendingEmail !== undefined ? { sendingEmail: d.sendingEmail || null } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
