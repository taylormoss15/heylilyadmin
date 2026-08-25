import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/integrations/stripe";
import { convertProspect } from "@/lib/prospecting/convert";
import { sendEmail } from "@/lib/integrations/email";
import { newSaleEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

// Stripe → us. On a completed checkout: unlock the report, convert the prospect
// into a paid client (standing up its site from the demo), and alert ops.
// Verified by the Stripe signature; public in middleware (/api/webhooks).
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const demoToken = session.metadata?.demoToken;

    if (demoToken) {
      const demo = await prisma.demo.findUnique({ where: { token: demoToken } });
      if (demo) {
        await prisma.demo.update({ where: { id: demo.id }, data: { unlocked: true } });

        if (demo.prospectId) {
          try {
            const { clientId } = await convertProspect({
              prospectId: demo.prospectId,
              markPaid: true,
              siteHtml: demo.redesignHtml,
            });

            const to = process.env.OPS_DIGEST_EMAIL || process.env.ADMIN_EMAIL;
            if (to) {
              const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
              const base = process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";
              const built = newSaleEmail({ clientName: client?.name || demo.businessName || "New account", baseUrl: base, clientId });
              await sendEmail({ to, subject: built.subject, html: built.html });
            }
          } catch {
            // Payment already succeeded — never fail the webhook on downstream work.
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
