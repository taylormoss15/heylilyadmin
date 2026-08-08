import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeImplementation, inputsFromClient, implementationInclude } from "@/lib/onboarding";
import { sendEmail } from "@/lib/integrations/email";
import { launchpadDigestEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

// Daily digest of paid-but-not-live accounts, emailed to the ops inbox so a
// paid customer never sits waiting. Hit by a scheduler once a day. Auth: the
// CRON_SECRET, via the x-cron-secret header or a ?secret= query param (so a
// URL-only scheduler works too).
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  return header === secret || query === secret;
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = process.env.OPS_DIGEST_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) {
    return NextResponse.json({ error: "Set OPS_DIGEST_EMAIL (or ADMIN_EMAIL) to receive the digest." }, { status: 400 });
  }

  const clients = await prisma.client.findMany({
    where: { paidAt: { not: null } },
    include: implementationInclude,
    orderBy: { paidAt: "asc" },
  });

  const pending = clients
    .map((c) => ({ name: c.name, id: c.id, paidAt: c.paidAt as Date, impl: computeImplementation(inputsFromClient(c)) }))
    .filter((r) => !r.impl.live);

  const base = process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";
  const built = launchpadDigestEmail({
    baseUrl: base,
    pending: pending.map((r) => ({
      name: r.name,
      id: r.id,
      days: daysSince(r.paidAt),
      blockedAt: r.impl.blockedAt || "—",
      doneCount: r.impl.doneCount,
      total: r.impl.total,
    })),
  });

  const result = await sendEmail({ to, subject: built.subject, html: built.html });

  return NextResponse.json({ ok: true, pending: pending.length, emailed: result.sent, reason: result.reason });
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}
