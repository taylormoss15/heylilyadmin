import type { AeoCheck } from "@/lib/prospecting/aeo";
import { outcomeIssues, type RawViolation } from "@/lib/prospecting/issues";

// The four benefit-framed lines the cold email needs, one per category, each
// the biggest addressable issue we actually detected on that specific site.
// Falls back to a sensible category-level line when nothing specific was found,
// so every email has all four. Gets sharper as the conversion scanner adds
// more signals.
export interface OutreachIssues {
  accessibilityIssue: string;
  mobileIssue: string;
  seoIssue: string;
  conversionIssue: string;
}

// Benefit phrasing for a failing on-page check (no leading category, no
// trailing period — the email template adds those).
const SEO_PHRASES: Record<string, string> = {
  "Meta description": "there's no meta description, so Google writes its own snippet for your search listing",
  "Title tag": "your homepage title isn't optimized, so search results show the wrong thing",
  "Single clear H1": "the page structure isn't clear, so search engines can't tell what the page is about",
  "Indexable by search": "the site is telling search engines not to index it",
  "Meaningful content": "there's too little text for Google to understand what you do and where you practice",
};
const CONVERSION_PHRASES: Record<string, string> = {
  "Structured data (schema)":
    "your firm's details aren't machine-readable, so Google and AI assistants can't confidently show your hours, phone and practice areas",
  "Secure (HTTPS)": "the browser flags your site as “Not secure,” which quietly scares off prospective clients",
  "Social share tags (Open Graph)": "links to your site show up blank when shared, so referrals lose their pull",
};

function failed(checks: AeoCheck[], labels: string[]): string[] {
  return checks.filter((c) => !c.pass && labels.includes(c.label)).map((c) => c.label);
}

export function outreachIssues(violations: RawViolation[], aeoChecks: AeoCheck[]): OutreachIssues {
  // Accessibility — the single most impactful outcome from the axe scan.
  const a11y = outcomeIssues(violations, 1);
  const accessibilityIssue =
    a11y[0] ||
    "some elements can't be used with assistive technology or on older devices, quietly turning away clients";

  // Mobile conversion — viewport is the one hard signal we have today.
  const viewportBad = aeoChecks.some((c) => c.label === "Mobile-friendly viewport" && !c.pass);
  const mobileIssue = viewportBad
    ? "the site isn't sized for phones, so mobile visitors have to pinch and scroll before they can act"
    : "the path from landing on a phone to actually calling you has friction that costs consultations";

  // Search visibility — the biggest failing SEO check.
  const seoFail = failed(aeoChecks, Object.keys(SEO_PHRASES));
  const seoIssue =
    (seoFail[0] && SEO_PHRASES[seoFail[0]]) ||
    "technical and local-search fundamentals are missing, so you're hard to find for your practice areas";

  // Trust & conversion — schema / HTTPS / share tags, else a credibility line.
  const convFail = failed(aeoChecks, Object.keys(CONVERSION_PHRASES));
  const conversionIssue =
    (convFail[0] && CONVERSION_PHRASES[convFail[0]]) ||
    "there's no clear reason-to-trust or obvious next step above the fold, so visitors leave before contacting you";

  return { accessibilityIssue, mobileIssue, seoIssue, conversionIssue };
}
