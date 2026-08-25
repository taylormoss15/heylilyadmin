import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: string; // OWNER | SALES
  calendlyUrl: string | null;
}

// The logged-in admin/rep, resolved from the session cookie. Server-only
// (touches the DB) — keep out of middleware/edge.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;
  const u = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, calendlyUrl: u.calendlyUrl };
}

export function isOwner(user: CurrentUser | null): boolean {
  return user?.role === "OWNER";
}
