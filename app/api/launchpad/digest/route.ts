import { NextResponse } from "next/server";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import { sendLaunchpadDigest } from "@/lib/launchpad/digest";

export const dynamic = "force-dynamic";

// On-demand version of the daily digest: emails the paid-but-not-live list to
// whoever clicks the button (owners only). Lets you test the Resend pipeline
// and pull the list any time without waiting for the cron.
export async function POST() {
  const me = await getCurrentUser();
  if (!isOwner(me)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { pending, sent, reason } = await sendLaunchpadDigest(me!.email);
  if (!sent) {
    return NextResponse.json({ ok: false, pending, reason: reason || "Email not sent" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, pending, to: me!.email });
}
