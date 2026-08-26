import { NextRequest, NextResponse } from "next/server";
import { sendLaunchpadDigest } from "@/lib/launchpad/digest";

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

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = process.env.OPS_DIGEST_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) {
    return NextResponse.json({ error: "Set OPS_DIGEST_EMAIL (or ADMIN_EMAIL) to receive the digest." }, { status: 400 });
  }

  const { pending, sent, reason } = await sendLaunchpadDigest(to);
  return NextResponse.json({ ok: true, pending, emailed: sent, reason });
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}
