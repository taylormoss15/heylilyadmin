import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeImplementation, inputsFromClient, implementationInclude } from "@/lib/onboarding";
import { sendEmail } from "@/lib/integrations/email";

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

  const base = (process.env.ADMIN_BASE_URL || "https://admin.heylily.ai").replace(/\/$/, "");

  const rows = pending
    .map((r) => {
      const age = daysSince(r.paidAt);
      const overdue = age >= 7;
      const color = overdue ? "#b91c1c" : age >= 3 ? "#b45309" : "#475569";
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eef"><a href="${base}/dashboard/clients/${r.id}" style="color:#2f57b8;font-weight:600;text-decoration:none">${escapeHtml(r.name)}</a></td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef;color:${color};font-weight:600">${age === 0 ? "today" : `${age}d`}${overdue ? " · overdue" : ""}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef;color:#334155">${escapeHtml(r.impl.blockedAt || "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eef;color:#94a3b8">${r.impl.doneCount}/${r.impl.total}</td>
      </tr>`;
    })
    .join("");

  const subject = pending.length
    ? `Launchpad — ${pending.length} paid account${pending.length === 1 ? "" : "s"} not live yet`
    : "Launchpad — ✅ all paid accounts are live";

  const html = pending.length
    ? `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<h2 style="margin:0 0 4px">${pending.length} paid ${pending.length === 1 ? "account" : "accounts"} waiting to go live</h2>
<p style="margin:0 0 16px;color:#666">Sorted by how long they've been paid. Get the overdue ones live first.</p>
<table style="border-collapse:collapse;width:100%;max-width:560px">
<thead><tr style="text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">
<th style="padding:6px 10px">Account</th><th style="padding:6px 10px">Paid</th><th style="padding:6px 10px">Blocked at</th><th style="padding:6px 10px">Steps</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="margin:18px 0 0"><a href="${base}/dashboard/launchpad" style="color:#2f57b8">Open the Launchpad →</a></p>
</div>`
    : `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<h2 style="margin:0 0 4px">✅ Every paid account is fully live</h2>
<p style="color:#666">Nothing waiting today. <a href="${base}/dashboard/launchpad" style="color:#2f57b8">Launchpad →</a></p></div>`;

  const result = await sendEmail({ to, subject, html });

  return NextResponse.json({ ok: true, pending: pending.length, emailed: result.sent, reason: result.reason });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}
