import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Generate (or rotate) the logged-in rep's personal capture token for the
// browser bookmarklet scanner. Rotating invalidates the old bookmarklet.
export async function POST() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = randomBytes(24).toString("base64url");
  await prisma.adminUser.update({ where: { id: session.userId }, data: { captureToken: token } });
  return NextResponse.json({ ok: true, token });
}
