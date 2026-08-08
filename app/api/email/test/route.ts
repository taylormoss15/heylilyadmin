import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/integrations/email";
import { emailSamples } from "@/lib/email/samples";

const bodySchema = z.object({ template: z.string().min(1), to: z.string().email().optional() });

// Send a sample of one email template to yourself, to see exactly how it lands.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const sample = emailSamples().find((s) => s.key === parsed.data.template);
  if (!sample) return NextResponse.json({ error: "Unknown template" }, { status: 404 });

  const to = parsed.data.to || process.env.OPS_DIGEST_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) return NextResponse.json({ error: "No recipient — set OPS_DIGEST_EMAIL or ADMIN_EMAIL." }, { status: 400 });

  const built = sample.build();
  const result = await sendEmail({ to, subject: `[TEST] ${built.subject}`, html: built.html });

  if (!result.sent) {
    return NextResponse.json({ error: result.reason || "Send failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to });
}
