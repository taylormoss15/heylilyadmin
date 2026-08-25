import Stripe from "stripe";

// Checkout for the Hey Lily offer: a one-time setup fee + a monthly
// subscription, in a single Stripe Checkout session. Amounts are env-driven so
// no products need to be pre-created in Stripe; promotion codes (e.g. a
// first-50 discount) work automatically via allow_promotion_codes.

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: Stripe | null = null;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured (STRIPE_SECRET_KEY).");
  if (!cached) cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  return cached;
}

function setupAmount(): number {
  return Number(process.env.STRIPE_SETUP_AMOUNT || 100000); // $1,000.00 in cents
}
function monthlyAmount(): number {
  return Number(process.env.STRIPE_MONTHLY_AMOUNT || 19700); // $197.00 in cents
}

export async function createDemoCheckout(input: {
  token: string;
  prospectId: string | null;
  businessName: string;
  email?: string | null;
  baseUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const base = input.baseUrl.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: monthlyAmount(),
          recurring: { interval: "month" },
          product_data: { name: "Hey Lily — Website, compliance & AI visibility (monthly)" },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: setupAmount(),
          product_data: { name: "Hey Lily — Setup & site build (one-time)" },
        },
      },
    ],
    allow_promotion_codes: true,
    customer_email: input.email || undefined,
    success_url: `${base}/demo/${input.token}/thanks?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/demo/${input.token}/report`,
    metadata: { demoToken: input.token, prospectId: input.prospectId ?? "" },
    subscription_data: { metadata: { demoToken: input.token, prospectId: input.prospectId ?? "" } },
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}
