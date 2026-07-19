import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { outcomeIssues } from "@/lib/prospecting/issues";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ref: z.string().min(1),
  email: z.string().email(),
  name: z.string().max(120).optional(),
});

// Captures the inbound lead's email against their scanned prospect, then
// unlocks the full findings (the outcome-framed problems) for the reveal.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const prospect = await prisma.prospect.findUnique({ where: { id: parsed.data.ref } });
  if (!prospect) return NextResponse.json({ error: "Scan not found — please run the scan again." }, { status: 404 });

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      leadEmail: parsed.data.email,
      leadName: parsed.data.name?.trim() || null,
      leadCapturedAt: prospect.leadCapturedAt ?? new Date(),
    },
  });

  // Reveal the full outcome-framed problems (never the code-level fix).
  let issues: string[] = [];
  try {
    const violations = JSON.parse(prospect.violations || "[]");
    if (Array.isArray(violations)) issues = outcomeIssues(violations);
  } catch {
    /* ignore */
  }

  let failedSeoLabels: string[] = [];
  try {
    const checks = JSON.parse(prospect.aeoChecks || "[]");
    if (Array.isArray(checks)) failedSeoLabels = checks.filter((c) => c && !c.pass).map((c) => c.label);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, issues, failedSeoLabels });
}
