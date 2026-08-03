import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/integrations/email";

export const dynamic = "force-dynamic";

// Cross-origin: this is POSTed to by the contact form on client sites (any
// domain), relayed by the injected contact-forms widget.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function str(v: unknown, max = 5000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(request: NextRequest, { params }: { params: { clientId: string } }) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400, headers: CORS_HEADERS });
  }

  // Honeypot — bots fill hidden fields. Pretend success and drop it.
  if (str(body._hp) || str(body.website_hp)) {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  }

  const client = await prisma.client.findUnique({ where: { id: params.clientId } });
  if (!client) {
    return NextResponse.json({ error: "Unknown site" }, { status: 404, headers: CORS_HEADERS });
  }

  const name = str(body.name, 200);
  const email = str(body.email, 200);
  const phone = str(body.phone, 60);
  const message = str(body.message ?? body.comments ?? body.msg, 5000);

  // Require at least something to reach them by / say.
  if (!name && !email && !phone && !message) {
    return NextResponse.json({ error: "Empty submission" }, { status: 400, headers: CORS_HEADERS });
  }

  // Keep the full field set (minus honeypots) for the record.
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "_hp" || k === "website_hp") continue;
    const s = str(v);
    if (s) fields[k.slice(0, 60)] = s;
  }

  const sourceUrl = request.headers.get("referer") || request.headers.get("origin") || null;

  const submission = await prisma.formSubmission.create({
    data: { clientId: client.id, name, email, phone, message, fields: JSON.stringify(fields), sourceUrl },
  });

  // Email the client (best-effort — the submission is already saved).
  const to = client.notificationEmail?.trim();
  if (to) {
    const rows = Object.entries(fields)
      .map(([k, v]) => `<tr><td style="padding:4px 10px 4px 0;color:#555;vertical-align:top"><strong>${esc(k)}</strong></td><td style="padding:4px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
      .join("");
    const html = `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<h2 style="margin:0 0 4px">New enquiry from your website</h2>
<p style="margin:0 0 16px;color:#666">${esc(client.name)}${sourceUrl ? ` · ${esc(sourceUrl)}` : ""}</p>
<table style="border-collapse:collapse">${rows}</table>
<p style="margin:16px 0 0;color:#999;font-size:12px">Reply directly to this email to respond${email ? ` to ${esc(email)}` : ""}. Sent by Hey Lily.</p>
</div>`;
    const result = await sendEmail({
      to,
      subject: `New website enquiry${name ? ` from ${name}` : ""} — ${client.name}`,
      html,
      replyTo: email || undefined,
    });
    if (result.sent) {
      await prisma.formSubmission.update({ where: { id: submission.id }, data: { emailed: true } });
    }
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
