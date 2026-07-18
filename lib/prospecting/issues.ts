// Turns raw axe-core violations into outcome-framed problem statements for the
// sales demo. Deliberately NOT actionable engineering advice — we describe the
// business/legal impact ("customers can't tap to call you"), never how to fix
// it. The fix is the redesign we already built; we are the solution, not a
// spec sheet for their developer.

interface RawViolation {
  id: string;
  impact: string | null;
  help: string;
  nodeCount: number;
}

// Map common axe rule ids to a customer-facing consequence.
const OUTCOME: Record<string, string> = {
  "color-contrast":
    "Text is hard to read for many visitors — especially on phones, in sunlight, and for older customers — so they leave before converting.",
  "image-alt":
    "Images are invisible to Google and to blind visitors, hurting both your search ranking and your reach.",
  "link-name": "Links don't announce where they go, so screen-reader and keyboard users get stuck.",
  "button-name": "Buttons aren't labeled, so some visitors literally can't complete the action you want.",
  label: "Your contact form is confusing to fill out, costing you leads at the finish line.",
  "form-field-multiple-labels": "Your forms are ambiguous, which drops completion rates.",
  "html-has-lang": "The page doesn't declare its language, which trips up screen readers and translation.",
  "document-title": "The page is missing a proper title, which weakens how it shows up in search and shares.",
  "landmark-one-main": "The page structure isn't machine-readable, hurting SEO and assistive tech.",
  "heading-order": "Headings are out of order, making the page hard to scan for people and for Google.",
  "duplicate-id": "Broken markup can cause interactive elements to misbehave for some users.",
  "aria-required-attr": "Interactive widgets are missing accessibility info, so they fail for assistive tech.",
  "aria-valid-attr-value": "Accessibility markup is malformed, so screen readers can misread the page.",
  region: "Parts of the page aren't reachable by keyboard or screen reader.",
  "meta-viewport": "Zoom is disabled, which frustrates anyone who needs larger text — and violates guidelines.",
  list: "Content that should be a list isn't structured as one, hurting readability for assistive tech.",
  tabindex: "Keyboard navigation order is broken, trapping keyboard-only visitors.",
};

const GENERIC =
  "This weakens the experience for real customers and adds to the site's accessibility (ADA/WCAG) exposure.";

export function outcomeIssues(violations: RawViolation[], max = 5): string[] {
  // Serious/critical first, then by how many elements are affected.
  const ordered = [...violations].sort((a, b) => {
    const sev = (v: RawViolation) => (v.impact === "critical" ? 0 : v.impact === "serious" ? 1 : 2);
    return sev(a) - sev(b) || b.nodeCount - a.nodeCount;
  });

  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of ordered) {
    const line = OUTCOME[v.id] || `${capitalize(v.help)}. ${GENERIC}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
