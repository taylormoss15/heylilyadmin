import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Verify a Resend (Svix) webhook signature over the raw body. Secret looks like
// "whsec_<base64>". Header svix-signature is space-separated "v1,<sig>" entries.
function verify(raw: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // not configured yet — accept (set it to enforce)
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64");
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verify(raw, request.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId || !event.type) return NextResponse.json({ ok: true });

  const prospect = await prisma.prospect.findFirst({ where: { outreachMessageId: emailId } });
  if (!prospect) return NextResponse.json({ ok: true }); // not one of ours (or a test)

  const now = new Date();
  const data: Record<string, unknown> = {};
  switch (event.type) {
    case "email.delivered":
      data.deliveredAt = prospect.deliveredAt ?? now;
      break;
    case "email.opened":
      data.openedAt = prospect.openedAt ?? now;
      data.openCount = { increment: 1 };
      break;
    case "email.clicked":
      data.clickedAt = prospect.clickedAt ?? now;
      data.clickCount = { increment: 1 };
      // A click implies an open even if the open pixel was blocked.
      if (!prospect.openedAt) data.openedAt = now;
      break;
    case "email.bounced":
      data.bouncedAt = now;
      data.emailStatus = "INVALID"; // stop future sends to a bouncing address
      break;
    case "email.complained":
      data.unsubscribedAt = prospect.unsubscribedAt ?? now; // suppress all future sends
      break;
    default:
      return NextResponse.json({ ok: true });
  }

  await prisma.prospect.update({ where: { id: prospect.id }, data });
  return NextResponse.json({ ok: true });
}
