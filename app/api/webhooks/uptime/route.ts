import { NextRequest, NextResponse } from "next/server";
import { normalizeUptimeWebhook, handleUptimeEvent } from "@/lib/integrations/uptime";

// Public endpoint — UptimeRobot / Better Stack call this directly, so it
// can't sit behind the admin session gate. It's excluded in middleware.ts.
// Provider is passed as a query param, e.g. /api/webhooks/uptime?provider=uptimerobot,
// matching the "External Alert" webhook URL configured in each tool's UI.
export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "Missing provider query param" }, { status: 400 });
  }

  const secret = request.nextUrl.searchParams.get("secret");
  if (process.env.UPTIME_WEBHOOK_SECRET && secret !== process.env.UPTIME_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const event = normalizeUptimeWebhook(provider, payload);

  if (!event) {
    return NextResponse.json({ error: "Unrecognized payload for provider" }, { status: 400 });
  }

  const result = await handleUptimeEvent(provider, event, payload);
  if (!result.ok) {
    // Still 200 — the external monitor doesn't need to retry just because
    // we haven't registered this monitor to a client yet.
    return NextResponse.json({ ok: false, reason: result.reason });
  }

  return NextResponse.json(result);
}
