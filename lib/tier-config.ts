import type { Tier } from "@/lib/types";

// Feature access per pricing tier, per the build spec. This is the source
// of truth the admin dashboard reads from when deciding what to show/allow
// for a client — the actual gating in GHL itself happens in the SaaS
// Configurator, this just keeps this backend's behavior (e.g. which
// add-ons a client's dashboard card highlights) in sync with that.
export const TIER_CONFIG: Record<
  Tier,
  {
    label: string;
    monthlyPriceUsd: number;
    features: string[];
  }
> = {
  STARTER: {
    label: "Starter",
    monthlyPriceUsd: 197,
    features: [
      "website",
      "accessibility_compliance",
      "cookie_consent",
      "seo_aeo",
      "managed_email",
    ],
  },
  PRO: {
    label: "Pro",
    monthlyPriceUsd: 397,
    features: [
      "website",
      "accessibility_compliance",
      "cookie_consent",
      "seo_aeo",
      "managed_email",
      "google_reviews",
      "texting",
    ],
  },
  PREMIUM: {
    label: "Premium",
    monthlyPriceUsd: 597,
    features: [
      "website",
      "accessibility_compliance",
      "cookie_consent",
      "seo_aeo",
      "managed_email",
      "google_reviews",
      "texting",
      "ai_phone_answering",
      "ai_texting",
    ],
  },
};

export function tierIncludes(tier: Tier, feature: string): boolean {
  return TIER_CONFIG[tier].features.includes(feature);
}
