// One branded shell for every Hey Lily email, so they look consistent and
// professional wherever they land. Table-based wrapper + inline styles for
// broad email-client compatibility (Gmail, Apple Mail, Outlook). Transactional
// emails skip the unsubscribe; cold outreach passes a footer with the physical
// address + unsubscribe link (CAN-SPAM).

export interface EmailFooter {
  address?: string; // physical mailing address (required for cold outreach)
  unsubscribeUrl?: string;
}

const BRAND = "#2f57b8";
const INK = "#0f172a";
const MUTED = "#64748b";
const BG = "#eef2f6";
const CARD = "#ffffff";
const BORDER = "#e2e8f0";

export function emailButton(label: string, href: string, color = BRAND): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${label}</a>`;
}

export function emailLayout(opts: {
  preheader?: string;
  contentHtml: string;
  footer?: EmailFooter;
}): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preheader}</div>`
    : "";

  const footerBits: string[] = [
    `<p style="margin:0 0 4px;color:${MUTED};font-size:12px">Sent by Hey Lily · <a href="https://heylily.ai" style="color:${MUTED}">heylily.ai</a></p>`,
  ];
  if (opts.footer?.address) {
    footerBits.push(`<p style="margin:0 0 4px;color:#94a3b8;font-size:12px">${opts.footer.address}</p>`);
  }
  if (opts.footer?.unsubscribeUrl) {
    footerBits.push(
      `<p style="margin:0;color:#94a3b8;font-size:12px"><a href="${opts.footer.unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a></p>`
    );
  }

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding:0 4px 16px">
    <span style="font-size:18px;font-weight:800;letter-spacing:-.02em;color:${BRAND}">Hey Lily</span>
  </td></tr>
  <tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:28px 26px">
    ${opts.contentHtml}
  </td></tr>
  <tr><td style="padding:16px 4px 0;text-align:center">
    ${footerBits.join("")}
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export const emailTokens = { BRAND, INK, MUTED, BG, CARD, BORDER };
