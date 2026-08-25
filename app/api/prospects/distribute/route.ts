import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";

// Evenly distribute all unassigned leads across the sales reps (round-robin) —
// for the "viewed but didn't book" crowd that needs follow-up/nurturing.
// Owner-only.
export async function POST() {
  const me = await getCurrentUser();
  if (!isOwner(me)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const reps = await prisma.adminUser.findMany({ where: { role: "SALES" }, orderBy: { createdAt: "asc" } });
  if (reps.length === 0) return NextResponse.json({ error: "Add sales reps first (Settings → Team)." }, { status: 400 });

  const unassigned = await prisma.prospect.findMany({
    where: { ownerId: null, status: "PROSPECT" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  let i = 0;
  for (const p of unassigned) {
    const ownerId = reps[i % reps.length].id;
    await prisma.prospect.update({ where: { id: p.id }, data: { ownerId } });
    await prisma.demo.updateMany({ where: { prospectId: p.id }, data: { ownerId } });
    i++;
  }

  return NextResponse.json({ ok: true, assigned: unassigned.length, reps: reps.length });
}
