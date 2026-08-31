import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import { composeOutreachEmail } from "@/lib/prospecting/send-outreach";
import { sendEmail } from "@/lib/integrations/email";

export const dynamic = "force-dynamic";

// Send the exact outreach email for this lead to the logged-in user's own inbox
// — a smoke test. Ignores the recipient, the daily cap, the review gate, and the
// "already emailed" guard, and never marks the lead as emailed. From/Reply-To
// still use the lead's assigned rep so you can verify the real routing.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isOwner(me) && prospect.ownerId !== me.id) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }

  const built = await composeOutreachEmail(params.id);
  if ("error" in built) return NextResponse.json({ ok: false, reason: built.error }, { status: 200 });

  const owner = prospect.ownerId ? await prisma.adminUser.findUnique({ where: { id: prospect.ownerId } }) : null;
  const fromEmail = owner?.sendingEmail || process.env.OUTREACH_FROM_EMAIL;
  const fromName = owner?.name || process.env.OUTREACH_DEFAULT_SENDER_NAME || "Hey Lily";
  const from = fromEmail ? `${fromName} <${fromEmail}>` : undefined;

  const result = await sendEmail({
    to: me.email,
    subject: `[TEST] ${built.subject}`,
    html: built.html,
    from,
    replyTo: owner?.email || owner?.sendingEmail || undefined,
  });

  if (!result.sent) return NextResponse.json({ ok: false, reason: result.reason || "Send failed" }, { status: 200 });
  return NextResponse.json({ ok: true, to: me.email });
}
