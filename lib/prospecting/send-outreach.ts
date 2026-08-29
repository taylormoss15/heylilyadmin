import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/integrations/email";
import { coldOutreachEmail } from "@/lib/email/templates";
import { outreachIssues } from "@/lib/prospecting/outreach-issues";
import type { AeoCheck } from "@/lib/prospecting/aeo";
import type { RawViolation } from "@/lib/prospecting/issues";

function parse<T>(json: string | null): T[] {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? (a as T[]) : [];
  } catch {
    return [];
  }
}

export interface OutreachResult {
  sent: boolean;
  reason?: string;
}

async function sentToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.prospect.count({ where: { emailedAt: { gte: start } } });
}

// Build the personalized outreach email for a prospect (subject + HTML), applying
// any per-lead overrides (custom note / subject). Shared by the send path and the
// preview endpoint so what you preview is exactly what sends. `override` lets the
// preview screen render unsaved edits without persisting them first.
export async function composeOutreachEmail(
  prospectId: string,
  override?: { note?: string | null; subject?: string | null }
): Promise<{ subject: string; html: string } | { error: string }> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) return { error: "Not found" };
  if (!prospect.demoToken) return { error: "Generate a demo first" };

  const owner = prospect.ownerId ? await prisma.adminUser.findUnique({ where: { id: prospect.ownerId } }) : null;
  const base = (process.env.ADMIN_BASE_URL || "https://admin.heylily.ai").replace(/\/$/, "");
  const demo = await prisma.demo.findUnique({ where: { token: prospect.demoToken } });

  const issues = outreachIssues(parse<RawViolation>(prospect.violations), parse<AeoCheck>(prospect.aeoChecks));

  const firmName = prospect.businessName || (() => {
    try {
      return new URL(prospect.url).hostname.replace(/^www\./, "");
    } catch {
      return prospect.url;
    }
  })();
  const firstName = prospect.leadName ? prospect.leadName.trim().split(/\s+/)[0] : null;

  const built = coldOutreachEmail({
    firstName,
    firmName,
    score: prospect.trustScore ?? 0,
    newScore: demo?.afterTrust ?? 92,
    beforeShotUrl: demo?.beforeShot ? `${base}/demo/${prospect.demoToken}/shot/before` : null,
    afterShotUrl: demo?.afterShot ? `${base}/demo/${prospect.demoToken}/shot/after` : null,
    accessibilityIssue: issues.accessibilityIssue,
    mobileIssue: issues.mobileIssue,
    seoIssue: issues.seoIssue,
    conversionIssue: issues.conversionIssue,
    reportUrl: `${base}/demo/${prospect.demoToken}/report`,
    senderName: owner?.name || process.env.OUTREACH_DEFAULT_SENDER_NAME || "The Hey Lily Team",
    senderPhone: owner?.phone || process.env.OUTREACH_DEFAULT_PHONE || "",
    address: process.env.COMPANY_ADDRESS || "Hey Lily",
    unsubscribeUrl: `${base}/u/${prospect.id}`,
    customNote: override && "note" in override ? override.note : prospect.outreachNote,
    subjectOverride: override && "subject" in override ? override.subject : prospect.outreachSubject,
  });

  return { subject: built.subject, html: built.html };
}

// Send the personalized cold email for one prospect. Enforces every guard:
// must have a demo to link, a recipient email, not be unsubscribed, not already
// emailed (unless forced), and stay under the daily warmup cap.
export async function sendOutreach(prospectId: string, opts: { force?: boolean } = {}): Promise<OutreachResult> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) return { sent: false, reason: "Not found" };

  if (!prospect.demoToken) return { sent: false, reason: "No demo/report to link — generate a demo first" };
  if (prospect.reviewStatus !== "APPROVED") return { sent: false, reason: "Not approved for outreach" };
  if (!prospect.ownerId) return { sent: false, reason: "Assign to a rep first" };
  if (prospect.unsubscribedAt) return { sent: false, reason: "Unsubscribed" };
  if (prospect.emailedAt && !opts.force) return { sent: false, reason: "Already emailed" };

  const to = (prospect.email || prospect.leadEmail || "").trim();
  if (!to) return { sent: false, reason: "No contact email on this lead" };

  // The lead list may flag an address as invalid/undeliverable. Sending to it
  // guarantees a bounce, which hurts the cold-sending domain's reputation — skip
  // unless explicitly forced.
  if (!opts.force && /invalid|undeliverable|bad|catch|risky|do_?not/i.test(prospect.emailStatus || "")) {
    return { sent: false, reason: `Email flagged "${prospect.emailStatus}" — skipped to protect deliverability` };
  }

  const cap = Number(process.env.OUTREACH_DAILY_CAP || 100);
  if ((await sentToday()) >= cap) return { sent: false, reason: `Daily send cap reached (${cap})` };

  const owner = prospect.ownerId ? await prisma.adminUser.findUnique({ where: { id: prospect.ownerId } }) : null;

  const built = await composeOutreachEmail(prospect.id);
  if ("error" in built) return { sent: false, reason: built.error };

  // From the rep's cold-sending address (e.g. gretchen@mail.heylily.ai) to
  // protect the main domain's reputation, but Reply-To their normal inbox
  // (gretchen@heylily.ai = their login email) so replies arrive there with no
  // mail-receiving or forwarding to set up on the subdomain.
  const fromEmail = owner?.sendingEmail || process.env.OUTREACH_FROM_EMAIL;
  const fromName = owner?.name || process.env.OUTREACH_DEFAULT_SENDER_NAME || "Hey Lily";
  const from = fromEmail ? `${fromName} <${fromEmail}>` : undefined;

  const result = await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    from,
    replyTo: owner?.email || owner?.sendingEmail || undefined,
  });

  if (!result.sent) return { sent: false, reason: result.reason || "Send failed" };

  await prisma.prospect.update({ where: { id: prospect.id }, data: { emailedAt: new Date() } });
  return { sent: true };
}
