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

// ---- 4. New sale → the ops/owner inbox ----
export function newSaleEmail(input: { clientName: string; baseUrl: string; clientId: string }): BuiltEmail {
  const base = input.baseUrl.replace(/\/$/, "");
  const content = `
    <h1 style="margin:0 0 6px;font-size:22px">🎉 New sale — ${esc(input.clientName)}</h1>
    <p style="margin:0 0 16px;color:${T.MUTED};font-size:15px">A new account just went paid. Get them live fast — the clock's running.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;margin:0 0 18px">
      <div style="font-size:15px;color:${T.INK}"><strong>$1,000</strong> setup &nbsp;+&nbsp; <strong>$197/mo</strong> · 12-month term</div>
    </div>
    <p style="margin:0 0 6px">${emailButton("Open the account & start the go-live checklist", `${base}/dashboard/clients/${input.clientId}`, "#059669")}</p>
    <p style="margin:12px 0 0;font-size:14px"><a href="${base}/dashboard/launchpad" style="color:${T.BRAND}">See the Launchpad →</a></p>`;

  return {
    subject: `🎉 New sale — ${input.clientName}`,
    html: emailLayout({ preheader: `${input.clientName} just signed up.`, contentHtml: content }),
  };
}

// ---- 3. Cold outreach → a prospect (Chunk C) ----
export function coldOutreachEmail(input: {
  firstName?: string | null;
  firmName: string;
  score: number;
  newScore: number;
  beforeShotUrl?: string | null;
  afterShotUrl?: string | null;
  accessibilityIssue: string;
  mobileIssue: string;
  seoIssue: string;
  conversionIssue: string;
  reportUrl: string; // "See the website we built for {firm}"
  senderName: string;
  senderPhone: string;
  address: string;
  unsubscribeUrl: string;
}): BuiltEmail {
  const firm = esc(input.firmName);
  const greeting = input.firstName ? `Hi ${esc(input.firstName)},` : "Hi there,";

  // The before → after proof: the score jump, plus screenshots when we have
  // real hosted URLs (data-URL images are stripped by Gmail, so only render
  // <img> when a real URL is supplied; otherwise show a labeled placeholder).
  const shotCell = (label: string, url: string | null | undefined, color: string) =>
    `<td width="50%" style="padding:6px;vertical-align:top">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${color};margin:0 0 4px">${label}</div>
      ${
        url
          ? `<img src="${url}" alt="${label} website" width="248" style="display:block;width:100%;max-width:248px;border:1px solid ${T.BORDER};border-radius:8px" />`
          : `<div style="height:150px;border:1px dashed ${T.BORDER};border-radius:8px;background:#f8fafc"></div>`
      }
    </td>`;

  const opportunity = (title: string, issue: string, why: string) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:15px;line-height:1.5">
      <strong style="color:${T.INK}">${title}:</strong> ${esc(issue)}. <span style="color:${T.MUTED}">${why}</span>
    </td></tr>`;

  const content = `
    <p style="margin:0 0 14px;font-size:16px">${greeting}</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">We analyzed <strong>${firm}</strong>'s website across accessibility, mobile experience, search visibility, speed and client conversion.</p>

    <div style="background:#f8fafc;border:1px solid ${T.BORDER};border-radius:12px;padding:18px;text-align:center;margin:0 0 16px">
      <div style="font-size:15px;color:${T.MUTED}">Your current website scored</div>
      <div style="font-size:44px;font-weight:800;color:#dc2626;line-height:1.05;margin:2px 0">${input.score}<span style="font-size:20px;color:#94a3b8">/100</span></div>
      <div style="font-size:15px;color:${T.MUTED};margin-top:8px">We didn't stop there — we built a new website for your firm that scored</div>
      <div style="font-size:44px;font-weight:800;color:#059669;line-height:1.05;margin:2px 0">${input.newScore}<span style="font-size:20px;color:#6ee7b7">/100</span></div>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
      <tr>${shotCell("Today", input.beforeShotUrl, "#b91c1c")}${shotCell("Your new site", input.afterShotUrl, "#059669")}</tr>
    </table>

    <p style="margin:0 0 8px;font-size:15px;font-weight:600">The biggest opportunities we found:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      ${opportunity("Accessibility", input.accessibilityIssue, "Accessibility problems can prevent potential clients from using your site and may increase exposure to demand letters or litigation.")}
      ${opportunity("Mobile conversion", input.mobileIssue, "Most prospective clients will first encounter your firm on a phone, and unnecessary friction costs consultations.")}
      ${opportunity("Search visibility", input.seoIssue, "Technical and local-search weaknesses make it harder for Google to understand, rank and recommend your firm.")}
      ${opportunity("Trust and conversion", input.conversionIssue, "Prospective clients need to understand why they should trust you — and what to do next — within seconds.")}
    </table>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Your complete report shows the individual tests, what failed and what we changed.</p>

    <p style="margin:0 0 6px">${emailButton(`See the website we built for ${input.firmName} →`, input.reportUrl, "#059669")}</p>

    <p style="margin:16px 0 18px;font-size:15px;line-height:1.6">The new site is already designed around your firm, services, reviews and existing brand. If you like it, you can purchase it directly from the preview or schedule a short walkthrough of your complete score.</p>

    <p style="margin:0;font-size:15px;line-height:1.5">— ${esc(input.senderName)}<br>Hey Lily<br><a href="tel:${esc(input.senderPhone)}" style="color:${T.BRAND};text-decoration:none">${esc(input.senderPhone)}</a></p>

    <p style="margin:20px 0 0;font-size:13px;color:${T.MUTED};line-height:1.6"><strong>P.S.</strong> This isn't a generic mockup. We built it specifically for ${firm} using your current branding, practice areas and public business information.</p>`;

  return {
    subject: `${input.firmName}'s website scored ${input.score}/100 — we built you a ${input.newScore}`,
    html: emailLayout({
      preheader: `We rebuilt ${input.firmName}'s site — it scored ${input.newScore}/100.`,
      contentHtml: content,
      footer: { address: input.address, unsubscribeUrl: input.unsubscribeUrl },
    }),
  };
}
