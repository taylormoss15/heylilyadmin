import { chromium, type Page } from "playwright";
import path from "path";
import { prisma } from "@/lib/prisma";
import { updateContactCustomFields, triggerWorkflow } from "@/lib/integrations/ghl";
import type { Client } from "@prisma/client";

/** Internal-only alert: a monitored client site's audit found issues to remediate. */
async function notifyComplianceIssue(
  client: Client,
  violationCount: number,
  seriousCount: number,
  url: string
) {
  const webhookUrl = process.env.GHL_COMPLIANCE_ALERT_WORKFLOW_WEBHOOK_URL ?? "";
  await triggerWorkflow(client.id, webhookUrl, {
    event: "accessibility_issue",
    clientId: client.id,
    clientName: client.name,
    url,
    violationCount,
    seriousCount,
    detectedAt: new Date().toISOString(),
  });
}

// Real WCAG scanning (not an overlay claim) via axe-core, run headless
// against the client's live site. Results are stored per-scan so the
// audit trail is a genuine dated history, not a static badge.

export interface ScanSummary {
  violationCount: number;
  seriousCount: number;
  passCount: number;
  incompleteCount: number;
  score: number;
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    help: string;
    helpUrl: string;
    nodeCount: number;
  }>;
}

function computeScore(violationCount: number, seriousCount: number, passCount: number): number {
  // Simple weighted score: start at 100, dock more for higher-impact
  // violations, floor at 0. Good enough for a trend indicator — the raw
  // violation list is the actual audit record.
  const total = violationCount + passCount;
  if (total === 0) return 100;
  const penalty = seriousCount * 6 + (violationCount - seriousCount) * 2;
  return Math.max(0, Math.round(100 - penalty));
}

interface RawAxeResults {
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    help: string;
    helpUrl: string;
    nodes: unknown[];
  }>;
  passes: unknown[];
  incomplete: unknown[];
}

// axe-core's browser bundle is injected directly via page.addScriptTag
// rather than through the @axe-core/playwright wrapper — that package's
// AxeBuilder throws "ReferenceError: exports is not defined" against the
// playwright/axe-core versions this was built with (a known UMD-wrapper
// incompatibility, reproduced against both a plain static page and this
// app's own pages, i.e. not specific to any particular target site).
// Injecting the script and calling window.axe.run() ourselves sidesteps it.
const AXE_SCRIPT_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function runAxe(page: Page): Promise<RawAxeResults> {
  await page.addScriptTag({ path: AXE_SCRIPT_PATH });
  return page.evaluate(() => {
    // @ts-expect-error — axe is attached to window by the injected script tag
    return window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
  }) as Promise<RawAxeResults>;
}

/** Run axe against an already-loaded Playwright page and summarize it. Lets
 * callers (e.g. the site importer) score and scrape a page in one session. */
export async function scanOpenPage(page: Page): Promise<ScanSummary> {
  return summarize(await runAxe(page));
}

function summarize(results: RawAxeResults): ScanSummary {
  const seriousCount = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  ).length;

  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodeCount: v.nodes.length,
  }));

  return {
    violationCount: results.violations.length,
    seriousCount,
    passCount: results.passes.length,
    incompleteCount: results.incomplete.length,
    score: computeScore(results.violations.length, seriousCount, results.passes.length),
    violations,
  };
}

function launchBrowser() {
  // Uses the environment's pre-installed Chromium if PLAYWRIGHT_EXECUTABLE_PATH
  // is set (e.g. the sandboxed dev/session environment this was built in),
  // otherwise falls back to Playwright's own managed browser install.
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  return chromium.launch({ headless: true, executablePath });
}

export async function runAccessibilityScan(url: string): Promise<ScanSummary> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    return summarize(await runAxe(page));
  } finally {
    await browser.close();
  }
}

/**
 * Scan a raw HTML string (rather than a live URL) — used by the website
 * builder to validate a generated page before publish. Loads the HTML
 * directly with setContent; waits only for DOM parse, so the deferred
 * compliance-badge script (which points at an external admin URL) doesn't
 * hold this up or require network access.
 */
export async function scanHtmlContent(html: string): Promise<ScanSummary> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    return summarize(await runAxe(page));
  } finally {
    await browser.close();
  }
}

/** Scan a client's site, persist the result, and sync a summary back into GHL. */
export async function scanClientAndPersist(client: Client) {
  const url = client.siteUrl ?? (client.domain ? `https://${client.domain}` : null);
  if (!url) {
    return prisma.accessibilityScan.create({
      data: {
        clientId: client.id,
        url: "",
        status: "FAILED",
        errorMessage: "Client has no domain or siteUrl configured",
        violations: "[]",
      },
    });
  }

  try {
    const summary = await runAccessibilityScan(url);

    const scan = await prisma.accessibilityScan.create({
      data: {
        clientId: client.id,
        url,
        violationCount: summary.violationCount,
        seriousCount: summary.seriousCount,
        passCount: summary.passCount,
        incompleteCount: summary.incompleteCount,
        score: summary.score,
        violations: JSON.stringify(summary.violations),
        status: "COMPLETED",
      },
    });

    if (client.ghlLocationId) {
      await updateContactCustomFields(client.id, client.ghlLocationId, {
        accessibility_score: summary.score,
        accessibility_violation_count: summary.violationCount,
        accessibility_last_scanned: scan.scannedAt.toISOString(),
      });
    }

    // Only notify the internal team if a live client site's audit finds
    // issues — so we fix it before it ever becomes a problem. Silent when
    // clean (the badge/audit trail just keep showing passing scans).
    if (summary.violationCount > 0) {
      await notifyComplianceIssue(client, summary.violationCount, summary.seriousCount, url);
    }

    return scan;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown scan error";
    return prisma.accessibilityScan.create({
      data: {
        clientId: client.id,
        url,
        status: "FAILED",
        errorMessage,
        violations: "[]",
      },
    });
  }
}

/** Returns clients whose most recent completed scan is older than their scan cadence (or who have never been scanned). */
export async function getClientsDueForScan() {
  const clients = await prisma.client.findMany({
    where: { status: { not: "CHURNED" } },
    include: {
      accessibilityScans: {
        orderBy: { scannedAt: "desc" },
        take: 1,
      },
    },
  });

  const now = Date.now();
  return clients.filter((client) => {
    const lastScan = client.accessibilityScans[0];
    if (!lastScan) return true;
    const cadenceMs = client.scanCadenceDays * 24 * 60 * 60 * 1000;
    return now - lastScan.scannedAt.getTime() >= cadenceMs;
  });
}
