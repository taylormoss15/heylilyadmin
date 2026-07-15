import { scanHtmlContent } from "@/lib/integrations/accessibility-scanner";
import type { RenderResult } from "@/lib/site/renderer";

// The publish gate. A generated page must pass these checks before it can
// ship to GHL. Accessibility is verified (not assumed) by running the same
// axe-core scanner the compliance product uses; size is checked against
// GHL's 5MB Custom HTML Pages cap; render warnings (e.g. relative asset
// URLs) are surfaced too.

const GHL_MAX_BYTES = 5 * 1024 * 1024; // 5MB per Custom HTML Page
const A11Y_PASS_THRESHOLD = 90; // score below this blocks publish

export interface ValidationReport {
  ok: boolean;
  sizeBytes: number;
  sizeOk: boolean;
  a11yScore: number;
  a11yOk: boolean;
  violationCount: number;
  seriousCount: number;
  violations: Array<{ id: string; impact: string | null; help: string; nodeCount: number }>;
  warnings: string[];
  blockers: string[];
}

export async function validateRender(render: RenderResult): Promise<ValidationReport> {
  const sizeBytes = Buffer.byteLength(render.html, "utf8");
  const sizeOk = sizeBytes <= GHL_MAX_BYTES;

  const scan = await scanHtmlContent(render.html);
  const a11yScore = scan.score;
  const a11yOk = scan.seriousCount === 0 && a11yScore >= A11Y_PASS_THRESHOLD;

  const blockers: string[] = [];
  if (!sizeOk) {
    blockers.push(
      `Page is ${(sizeBytes / 1024 / 1024).toFixed(2)}MB, over GHL's 5MB per-page limit.`
    );
  }
  if (scan.seriousCount > 0) {
    blockers.push(`${scan.seriousCount} serious/critical accessibility issue(s) must be fixed.`);
  } else if (a11yScore < A11Y_PASS_THRESHOLD) {
    blockers.push(`Accessibility score ${a11yScore} is below the ${A11Y_PASS_THRESHOLD} publish threshold.`);
  }

  return {
    ok: sizeOk && a11yOk,
    sizeBytes,
    sizeOk,
    a11yScore,
    a11yOk,
    violationCount: scan.violationCount,
    seriousCount: scan.seriousCount,
    violations: scan.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodeCount: v.nodeCount,
    })),
    warnings: render.warnings,
    blockers,
  };
}
