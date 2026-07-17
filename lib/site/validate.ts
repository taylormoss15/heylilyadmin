import { scanHtmlContent } from "@/lib/integrations/accessibility-scanner";
import type { RenderResult } from "@/lib/site/renderer";

// The publish gate. A generated page must pass these checks before it can
// ship to GHL. Accessibility is verified (not assumed) by running the same
// axe-core scanner the compliance product uses; size is checked against
// GHL's 5MB Custom HTML Pages cap; render warnings (e.g. relative asset
// URLs) are surfaced too.

const GHL_MAX_BYTES = 5 * 1024 * 1024; // 5MB per Custom HTML Page

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
  // Publish requires a genuinely spotless scan — ZERO violations, not just
  // "no serious ones". That's what lets the client-facing badge honestly say
  // "compliant" and the audit trail show 0 violations every time: we only
  // ever ship pages that truly have none.
  const a11yOk = scan.violationCount === 0;

  const blockers: string[] = [];
  if (!sizeOk) {
    blockers.push(
      `Page is ${(sizeBytes / 1024 / 1024).toFixed(2)}MB, over GHL's 5MB per-page limit.`
    );
  }
  if (scan.violationCount > 0) {
    blockers.push(
      `${scan.violationCount} accessibility issue(s) must be fixed before publishing (${scan.seriousCount} serious). Published sites must scan 100% clean.`
    );
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
