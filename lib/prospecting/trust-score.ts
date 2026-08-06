import type { AeoCheck } from "@/lib/prospecting/aeo";

// The Digital Trust Score — the one 0-100 number the whole product hangs off.
// It fuses four pillars from a single scan into a weighted composite, then
// applies a hard COMPLIANCE CAP: any accessibility violation means the site
// cannot score above 80 overall, because a single issue is real legal
// exposure. That keeps the number honest and makes prospects take it
// seriously — and it's exactly the gap our build closes (a clean 100 on
// compliance lifts the cap).

// Tunable weights (must sum to 1). Compliance is weighted heaviest.
export const TRUST_WEIGHTS = {
  compliance: 0.35,
  seo: 0.25,
  aeo: 0.2,
  experience: 0.2,
} as const;

// Any violation caps the overall score here; serious/critical caps lower.
const CAP_ANY_ISSUE = 80;
const CAP_SERIOUS_ISSUE = 72;

export interface TrustScore {
  score: number; // 0-100 overall Digital Trust Score
  band: { label: string; tone: "excellent" | "good" | "fair" | "poor" | "critical" };
  capped: boolean; // true when the compliance cap held the score down
  pillars: {
    compliance: number;
    seo: number;
    aeo: number;
    experience: number;
  };
}

// Which on-page checks belong to which pillar (by their label in aeo.ts).
const SEO_CHECKS = ["Title tag", "Meta description", "Single clear H1", "Indexable by search", "Meaningful content"];
const AEO_CHECKS = ["Structured data (schema)", "Social share tags (Open Graph)"];
const EXPERIENCE_CHECKS = ["Mobile-friendly viewport", "Secure (HTTPS)", "Image alt text", "Analytics installed"];

function pctPassing(checks: AeoCheck[], labels: string[]): number {
  const relevant = checks.filter((c) => labels.includes(c.label));
  if (relevant.length === 0) return 50; // unknown → neutral, don't reward or punish
  const passed = relevant.filter((c) => c.pass).length;
  return Math.round((passed / relevant.length) * 100);
}

export function trustBand(score: number): TrustScore["band"] {
  if (score >= 90) return { label: "Excellent", tone: "excellent" };
  if (score >= 75) return { label: "Good", tone: "good" };
  if (score >= 60) return { label: "Needs work", tone: "fair" };
  if (score >= 40) return { label: "At risk", tone: "poor" };
  return { label: "Critical", tone: "critical" };
}

export function computeTrustScore(input: {
  accessibilityScore: number; // 0-100 axe composite (100 = spotless)
  violationCount: number;
  seriousCount: number;
  aeoChecks: AeoCheck[];
}): TrustScore {
  const pillars = {
    compliance: clamp(Math.round(input.accessibilityScore)),
    seo: pctPassing(input.aeoChecks, SEO_CHECKS),
    aeo: pctPassing(input.aeoChecks, AEO_CHECKS),
    experience: pctPassing(input.aeoChecks, EXPERIENCE_CHECKS),
  };

  const weighted =
    pillars.compliance * TRUST_WEIGHTS.compliance +
    pillars.seo * TRUST_WEIGHTS.seo +
    pillars.aeo * TRUST_WEIGHTS.aeo +
    pillars.experience * TRUST_WEIGHTS.experience;

  let score = Math.round(weighted);

  // The compliance cap — the teeth. Any issue = they can't look "safe".
  let capped = false;
  if (input.seriousCount > 0 && score > CAP_SERIOUS_ISSUE) {
    score = CAP_SERIOUS_ISSUE;
    capped = true;
  } else if (input.violationCount > 0 && score > CAP_ANY_ISSUE) {
    score = CAP_ANY_ISSUE;
    capped = true;
  }

  return { score: clamp(score), band: trustBand(clamp(score)), capped, pillars };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
