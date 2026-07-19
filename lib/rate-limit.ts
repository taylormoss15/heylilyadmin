import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Daily free-scan cap per IP for the public lead magnet.
export const DAILY_SCAN_LIMIT = 5;

// Best-effort client IP behind the proxy. Coolify/nginx forward the real
// client in x-forwarded-for; fall back to x-real-ip, then a shared bucket.
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function isScanAllowed(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const rec = await prisma.scanRateLimit.findUnique({ where: { ip_day: { ip, day: today() } } });
  const used = rec?.count ?? 0;
  return { allowed: used < DAILY_SCAN_LIMIT, remaining: Math.max(0, DAILY_SCAN_LIMIT - used) };
}

export async function consumeScan(ip: string): Promise<void> {
  const day = today();
  await prisma.scanRateLimit.upsert({
    where: { ip_day: { ip, day } },
    create: { ip, day, count: 1 },
    update: { count: { increment: 1 } },
  });
}
