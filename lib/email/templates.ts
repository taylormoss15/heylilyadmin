import { emailLayout, emailButton, emailTokens as T } from "@/lib/email/layout";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface BuiltEmail {
  subject: string;
  html: string;
}

// ---- 1. Contact-form entry → the business owner ----
export function contactFormEmail(input: {
  clientName: string;
  sourceUrl?: string | null;
  fields: Record<string, string>;
  replyEmail?: string | null;
}): BuiltEmail {
  const rows = Object.entries(input.fields)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:${T.MUTED};font-size:14px;vertical-align:top;white-space:nowrap"><strong style="color:${T.INK}">${esc(k)}</strong></td><td style="padding:6px 0;font-size:15px">${esc(v).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");

  const content = `
    <h1 style="margin:0 0 4px;font-size:20px">New enquiry from your website</h1>
    <p style="margin:0 0 18px;color:${T.MUTED};font-size:14px">${esc(input.clientName)}${input.sourceUrl ? ` · ${esc(input.sourceUrl)}` : ""}</p>
    <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:13px">Just reply to this email to respond${input.replyEmail ? ` to ${esc(input.replyEmail)}` : ""}.</p>`;

  return {
    subject: `New website enquiry — ${input.clientName}`,
    html: emailLayout({ preheader: "A new lead just came in through your website.", contentHtml: content }),
  };
}

// ---- 2. Launchpad digest → the ops inbox ----
export interface DigestRow {
  name: string;
  id: string;
  days: number;
  blockedAt: string;
  doneCount: number;
  total: number;
}
export function launchpadDigestEmail(input: { pending: DigestRow[]; baseUrl: string }): BuiltEmail {
  const base = input.baseUrl.replace(/\/$/, "");

  if (input.pending.length === 0) {
    return {
      subject: "Launchpad — ✅ all paid accounts are live",
      html: emailLayout({
        preheader: "Nothing waiting today.",
        contentHtml: `<h1 style="margin:0 0 6px;font-size:20px">✅ Every paid account is fully live</h1>
          <p style="margin:0 0 16px;color:${T.MUTED}">Nothing waiting today.</p>
          ${emailButton("Open the Launchpad", `${base}/dashboard/launchpad`)}`,
      }),
    };
  }

  const rows = input.pending
    .map((r) => {
      const color = r.days >= 7 ? "#b91c1c" : r.days >= 3 ? "#b45309" : T.MUTED;
      return `<tr>
        <td style="padding:9px 10px;border-bottom:1px solid #eef2f6"><a href="${base}/dashboard/clients/${r.id}" style="color:${T.BRAND};font-weight:600;text-decoration:none">${esc(r.name)}</a></td>
        <td style="padding:9px 10px;border-bottom:1px solid #eef2f6;color:${color};font-weight:600;white-space:nowrap">${r.days === 0 ? "today" : `${r.days}d`}${r.days >= 7 ? " · overdue" : ""}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #eef2f6;color:${T.INK}">${esc(r.blockedAt)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #eef2f6;color:#94a3b8;white-space:nowrap">${r.doneCount}/${r.total}</td>
      </tr>`;
    })
    .join("");

  const content = `
    <h1 style="margin:0 0 4px;font-size:20px">${input.pending.length} paid ${input.pending.length === 1 ? "account" : "accounts"} waiting to go live</h1>
    <p style="margin:0 0 16px;color:${T.MUTED};font-size:14px">Sorted by how long they've been paid — clear the overdue ones first.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr style="text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
        <th style="padding:0 10px 6px">Account</th><th style="padding:0 10px 6px">Paid</th><th style="padding:0 10px 6px">Blocked at</th><th style="padding:0 10px 6px">Steps</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:20px 0 0">${emailButton("Open the Launchpad", `${base}/dashboard/launchpad`)}</p>`;

  return {
    subject: `Launchpad — ${input.pending.length} paid account${input.pending.length === 1 ? "" : "s"} not live yet`,
    html: emailLayout({ preheader: `${input.pending.length} paid accounts still need to go live.`, contentHtml: content }),
  };
}

// ---- 3. Cold outreach → a prospect (Chunk C) ----
export function coldOutreachEmail(input: {
  businessName: string;
  trustScore: number;
  afterScore: number;
  topIssues: string[];
  reportUrl: string;
  bookUrl: string;
  address: string;
  unsubscribeUrl: string;
}): BuiltEmail {
  const issues = input.topIssues
    .slice(0, 3)
    .map((it) => `<tr><td style="padding:4px 0;color:#b91c1c;font-size:15px;vertical-align:top;width:20px">✕</td><td style="padding:4px 0;font-size:15px">${esc(it)}</td></tr>`)
    .join("");

  const content = `
    <p style="margin:0 0 14px;font-size:16px">Hi — we ran a quick, free check on <strong>${esc(input.businessName)}</strong>'s website.</p>
    <div style="background:#f8fafc;border:1px solid ${T.BORDER};border-radius:12px;padding:16px;text-align:center;margin:0 0 16px">
      <div style="color:${T.MUTED};font-size:12px;text-transform:uppercase;letter-spacing:.05em;font-weight:700">Digital Trust Score</div>
      <div style="font-size:15px;color:${T.MUTED};margin-top:6px">
        <span style="font-size:34px;font-weight:800;color:#dc2626">${input.trustScore}</span>
        <span style="color:#94a3b8">&nbsp;→&nbsp;</span>
        <span style="font-size:34px;font-weight:800;color:#059669">${input.afterScore}</span>
      </div>
      <div style="color:${T.MUTED};font-size:13px;margin-top:4px">today &nbsp;→&nbsp; with a new site from us</div>
    </div>
    <p style="margin:0 0 8px;font-size:15px">A few things quietly costing you clients right now:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${issues}</table>
    <p style="margin:0 0 18px;font-size:15px">Below a perfect score you're also exposed to ADA accessibility lawsuits — typically a <strong>$25,000–$50,000</strong> settlement. We build you a beautiful, fully-compliant site that fixes all of it and gets found on Google and AI search.</p>
    <p style="margin:0 0 6px">${emailButton("See your full report & new site", input.reportUrl, "#059669")}</p>
    <p style="margin:10px 0 0;font-size:14px"><a href="${input.bookUrl}" style="color:${T.BRAND}">…or book a 10-minute call to walk through it</a></p>`;

  return {
    subject: `${input.businessName}: your website scored ${input.trustScore}/100`,
    html: emailLayout({
      preheader: `We can take ${input.businessName} from ${input.trustScore} to ${input.afterScore}.`,
      contentHtml: content,
      footer: { address: input.address, unsubscribeUrl: input.unsubscribeUrl },
    }),
  };
}
