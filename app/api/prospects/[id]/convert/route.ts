import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  name: z.string().min(1).optional(),
  tier: z.enum(["STARTER", "PRO", "PREMIUM"]).default("STARTER"),
});

// Convert a prospect into a Client. Carries its scan into the new client's
// audit trail as the "before" score, then marks the prospect CONVERTED so it
// drops off the Prospecting board.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const prospect = await prisma.prospect.findUnique({ where: { id: params.id } });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  if (prospect.status === "CONVERTED" && prospect.convertedClientId) {
    return NextResponse.json({ error: "Already converted", clientId: prospect.convertedClientId }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let domain: string | undefined;
  try {
    domain = new URL(prospect.url).hostname.replace(/^www\./, "");
  } catch {
    domain = undefined;
  }

  const client = await prisma.client.create({
    data: {
      name: parsed.data.name || prospect.businessName || domain || prospect.url,
      domain,
      siteUrl: prospect.url,
      tier: parsed.data.tier,
      // Seed the audit trail with the prospect's scan so the "before" score
      // shows up on day one — the same demo hook as importing a site.
      accessibilityScans:
        prospect.scanStatus === "COMPLETED"
          ? {
              create: {
                url: prospect.url,
                violationCount: prospect.violationCount,
                seriousCount: prospect.seriousCount,
                passCount: prospect.passCount,
                score: prospect.score,
                violations: prospect.violations ?? "[]",
                status: "COMPLETED",
              },
            }
          : undefined,
    },
  });

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { status: "CONVERTED", convertedClientId: client.id },
  });

  return NextResponse.json({ clientId: client.id }, { status: 201 });
}
