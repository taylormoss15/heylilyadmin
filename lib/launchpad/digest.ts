import { prisma } from "@/lib/prisma";
import { computeImplementation, inputsFromClient, implementationInclude } from "@/lib/onboarding";
import { sendEmail } from "@/lib/integrations/email";
import { launchpadDigestEmail } from "@/lib/email/templates";

function daysSince(d: Date): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export interface PendingAccount {
  name: string;
  id: string;
  days: number;
  blockedAt: string;
  doneCount: number;
  total: number;
}

// Every paid account that isn't fully live yet, sorted oldest-paid first so the
// most overdue are at the top. Shared by the daily cron and the on-demand
// "email me now" button so both show exactly the same list.
export async function gatherPendingAccounts(): Promise<PendingAccount[]> {
  const clients = await prisma.client.findMany({
    where: { paidAt: { not: null } },
    include: implementationInclude,
    orderBy: { paidAt: "asc" },
  });

  return clients
    .map((c) => ({ name: c.name, id: c.id, paidAt: c.paidAt as Date, impl: computeImplementation(inputsFromClient(c)) }))
    .filter((r) => !r.impl.live)
    .map((r) => ({
      name: r.name,
      id: r.id,
      days: daysSince(r.paidAt),
      blockedAt: r.impl.blockedAt || "—",
      doneCount: r.impl.doneCount,
      total: r.impl.total,
    }));
}

export interface DigestSendResult {
  pending: number;
  sent: boolean;
  reason?: string;
}

// Build and send the launchpad digest to one recipient. Returns how many were
// pending and whether the email actually went out.
export async function sendLaunchpadDigest(to: string): Promise<DigestSendResult> {
  const pending = await gatherPendingAccounts();
  const base = process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";
  const built = launchpadDigestEmail({ baseUrl: base, pending });
  const result = await sendEmail({ to, subject: built.subject, html: built.html });
  return { pending: pending.length, sent: result.sent, reason: result.reason };
}
