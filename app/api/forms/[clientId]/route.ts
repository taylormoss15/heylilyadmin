import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/integrations/email";
import { contactFormEmail } from "@/lib/email/templates";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Spam guards (layered, no user friction, no per-site config):
const MIN_FILL_MS = 2500; // submitted faster than this = a bot
const MAX_PER_IP_PER_HOUR = 8;

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

  // Time trap — a form filled out in under ~2.5s is a bot. Silently drop.
  const elapsed = typeof body._elapsed === "number" ? body._elapsed : Number(body._elapsed);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  }

  const client = await prisma.client.findUnique({ where: { id: params.clientId } });
  if (!client) {
    return NextResponse.json({ error: "Unknown site" }, { status: 404, headers: CORS_HEADERS });
  }

  // Per-IP rate limit across all client sites.
  const ip = getClientIp(request);
  if (ip && ip !== "unknown") {
    const recent = await prisma.formSubmission.count({
      where: { ip, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= MAX_PER_IP_PER_HOUR) {
      return NextResponse.json(
        { error: "Too many submissions — please try again later." },
        { status: 429, headers: CORS_HEADERS }
      );
    }
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
    if (k === "_hp" || k === "website_hp" || k === "_elapsed") continue;
    const s = str(v);
    if (s) fields[k.slice(0, 60)] = s;
  }

  const sourceUrl = request.headers.get("referer") || request.headers.get("origin") || null;

  const submission = await prisma.formSubmission.create({
    data: {
      clientId: client.id,
      name,
      email,
      phone,
      message,
      fields: JSON.stringify(fields),
      sourceUrl,
      ip: ip && ip !== "unknown" ? ip : null,
    },
  });

  // Email the client (best-effort — the submission is already saved).
  const to = client.notificationEmail?.trim();
  if (to) {
    const built = contactFormEmail({ clientName: client.name, sourceUrl, fields, replyEmail: email });
    const result = await sendEmail({ to, subject: built.subject, html: built.html, replyTo: email || undefined });
    if (result.sent) {
      await prisma.formSubmission.update({ where: { id: submission.id }, data: { emailed: true } });
    }
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
