import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["OWNER", "SALES"]).default("SALES"),
  calendlyUrl: z.string().url().optional().or(z.literal("")),
});

// Create a teammate (sales rep or another owner). Owner-only.
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!isOwner(me)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });

  const user = await prisma.adminUser.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      calendlyUrl: parsed.data.calendlyUrl || null,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    },
  });

  return NextResponse.json({ ok: true, id: user.id }, { status: 201 });
}
