import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/integrations/email";
import { monthlyReportEmail } from "@/lib/email/templates";
import { signInsightToken } from "@/lib/insights/token";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-cron-secret") === secret || new URL(request.url).searchParams.get("secret") === secret;
}

// Monthly value report to each live client: last calendar month's website
// visits, call taps, and form fills, plus a private (expiring) link to the full
// insights page. Justifies the recurring fee — no client login required.
async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const base = (process.env.ADMIN_BASE_URL || "https://admin.heylily.ai").replace(/\/$/, "");
  const address = process.env.COMPANY_ADDRESS || undefined;

  // Previous calendar month (UTC): prefix "YYYY-MM" and a human label.
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prefix = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthLabel = prev.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  const clients = await prisma.client.findMany({ where: { paidAt: { not: null }, notificationEmail: { not: null } } });

  let sent = 0;
  let skipped = 0;
  for (const client of clients) {
    const metrics = await prisma.siteMetric.findMany({ where: { clientId: client.id, date: { startsWith: prefix } } });
    const visits = metrics.reduce((n, m) => n + m.pageviews, 0);
    const telTaps = metrics.reduce((n, m) => n + m.telTaps, 0);
    const formFills = metrics.reduce((n, m) => n + m.formFills, 0);

    // Nothing happened (or tracking not live yet) — don't send an empty report.
    if (visits + telTaps + formFills === 0) {
      skipped++;
      continue;
    }

    const built = monthlyReportEmail({
      businessName: client.name,
      monthLabel,
      visits,
      telTaps,
      formFills,
      insightsUrl: `${base}/insights/${signInsightToken(client.id)}`,
      address,
    });
    const result = await sendEmail({ to: client.notificationEmail as string, subject: built.subject, html: built.html });
    if (result.sent) sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, month: prefix, clients: clients.length, sent, skipped });
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}
