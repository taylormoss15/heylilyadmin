import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/integrations/email";
import { emailLayout } from "@/lib/email/layout";

export const dynamic = "force-dynamic";

// Calendly → us. When a prospect books a demo through the round-robin link, we
// mark the lead HOT (demoBookedAt), record who it was booked with, and assign
// it to that rep. Matched by the utm_content=<prospectId> we embed in the
// booking link, falling back to the invitee's email. Public in middleware
// (/api/webhooks); verified by the Calendly signature when the signing key is set.

function verify(rawBody: string, header: string | null): boolean {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) return true; // no key configured → accept (set the key to enforce)
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim())));
  const expected = crypto.createHmac("sha256", key).update(`${parts.t}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || ""));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verify(raw, request.headers.get("calendly-webhook-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const event = String(body.event || "");
  const payload = (body.payload || {}) as Record<string, unknown>;
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  const tracking = (payload.tracking || {}) as Record<string, unknown>;
  const prospectId = typeof tracking.utm_content === "string" ? tracking.utm_content : null;

  // Which rep got the booking (round-robin host).
  const scheduled = (payload.scheduled_event || {}) as Record<string, unknown>;
  const memberships = Array.isArray(scheduled.event_memberships) ? scheduled.event_memberships : [];
  const host = (memberships[0] || {}) as Record<string, unknown>;
  const hostEmail = typeof host.user_email === "string" ? host.user_email.toLowerCase() : null;
  const hostName = typeof host.user_name === "string" ? host.user_name : null;

  // Find the prospect: by the embedded id first, else by invitee email.
  let prospect = prospectId ? await prisma.prospect.findUnique({ where: { id: prospectId } }) : null;
  if (!prospect && email) {
    prospect = await prisma.prospect.findFirst({ where: { OR: [{ leadEmail: email }, { email }] } });
  }
  if (!prospect) return NextResponse.json({ received: true, matched: false });

  if (event === "invitee.canceled") {
    await prisma.prospect.update({ where: { id: prospect.id }, data: { demoBookedAt: null } });
    return NextResponse.json({ received: true });
  }

  if (event === "invitee.created") {
    // Assign to the rep who got the booking, if we can identify them.
    let ownerId = prospect.ownerId;
    if (hostEmail) {
      const rep = await prisma.adminUser.findUnique({ where: { email: hostEmail } });
      if (rep) ownerId = rep.id;
    }

    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { demoBookedAt: new Date(), bookedWith: hostName || prospect.bookedWith, ownerId },
    });
    if (ownerId) await prisma.demo.updateMany({ where: { prospectId: prospect.id }, data: { ownerId } });

    // Alert ops — a booked demo is your hottest signal.
    const to = process.env.OPS_DIGEST_EMAIL || process.env.ADMIN_EMAIL;
    if (to) {
      const base = process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";
      const name = prospect.businessName || prospect.url;
      const html = emailLayout({
        preheader: `${name} booked a demo.`,
        contentHtml: `<h1 style="margin:0 0 6px;font-size:20px">🔥 Demo booked — ${name}</h1>
          <p style="margin:0 0 14px;color:#475569">${hostName ? `With ${hostName}. ` : ""}This is a hot lead — follow up fast.</p>
          <a href="${base}/dashboard/prospecting" style="display:inline-block;background:#2f57b8;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:10px">Open the board</a>`,
      });
      await sendEmail({ to, subject: `🔥 Demo booked — ${name}`, html });
    }
  }

  return NextResponse.json({ received: true });
}
