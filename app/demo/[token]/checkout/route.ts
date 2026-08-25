import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDemoCheckout, isStripeConfigured } from "@/lib/integrations/stripe";

export const dynamic = "force-dynamic";

// Public: the "Buy now" button on the scorecard links here. Creates a Stripe
// Checkout session for this demo's prospect and redirects to it.
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const base = process.env.ADMIN_BASE_URL || new URL(request.url).origin;

  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  if (!demo || demo.status !== "READY") {
    return NextResponse.redirect(`${base}/demo/${params.token}/report`, 303);
  }
  if (!isStripeConfigured()) {
    return NextResponse.redirect(`${base}/demo/${params.token}/report?checkout=unavailable`, 303);
  }

  let email: string | null = null;
  if (demo.prospectId) {
    const p = await prisma.prospect.findUnique({
      where: { id: demo.prospectId },
      select: { leadEmail: true, email: true },
    });
    email = p?.leadEmail || p?.email || null;
  }

  try {
    const url = await createDemoCheckout({
      token: demo.token,
      prospectId: demo.prospectId,
      businessName: demo.businessName || "your firm",
      email,
      baseUrl: base,
    });
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.redirect(`${base}/demo/${params.token}/report?checkout=error`, 303);
  }
}
