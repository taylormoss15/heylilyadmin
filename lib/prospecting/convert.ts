import { prisma } from "@/lib/prisma";
import { starterSite } from "@/lib/site/ir";

export type Tier = "STARTER" | "PRO" | "PREMIUM";

// Convert a prospect into a Client (carrying its scan as the "before" baseline).
// Optionally mark it paid and stand up a Site from an already-built redesign so
// a purchased account arrives with its website ready — "Website built" already
// ticked on the go-live checklist.
export async function convertProspect(input: {
  prospectId: string;
  tier?: Tier;
  name?: string;
  markPaid?: boolean;
  siteHtml?: string | null;
}): Promise<{ clientId: string; alreadyConverted: boolean }> {
  const prospect = await prisma.prospect.findUnique({ where: { id: input.prospectId } });
  if (!prospect) throw new Error("Prospect not found");

  if (prospect.status === "CONVERTED" && prospect.convertedClientId) {
    if (input.markPaid) {
      const existing = await prisma.client.findUnique({
        where: { id: prospect.convertedClientId },
        select: { paidAt: true },
      });
      if (existing && !existing.paidAt) {
        await prisma.client.update({ where: { id: prospect.convertedClientId }, data: { paidAt: new Date() } });
      }
    }
    return { clientId: prospect.convertedClientId, alreadyConverted: true };
  }

  let domain: string | undefined;
  try {
    domain = new URL(prospect.url).hostname.replace(/^www\./, "");
  } catch {
    domain = undefined;
  }
  const name = input.name || prospect.businessName || domain || prospect.url;

  const client = await prisma.client.create({
    data: {
      name,
      domain,
      siteUrl: prospect.url,
      tier: input.tier ?? "STARTER",
      paidAt: input.markPaid ? new Date() : null,
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
                kind: "baseline",
              },
            }
          : undefined,
    },
  });

  // Stand up the site from the already-built redesign (best-effort).
  if (input.siteHtml) {
    try {
      const starter = starterSite(name);
      const site = await prisma.site.create({
        data: {
          clientId: client.id,
          name: `${name} website`,
          theme: JSON.stringify(starter.theme),
          businessData: JSON.stringify(starter.businessData),
        },
      });
      await prisma.page.create({
        data: {
          siteId: site.id,
          path: "/",
          title: name,
          ir: JSON.stringify(starter.homeIr),
          customHtml: input.siteHtml,
          isHome: true,
        },
      });
    } catch {
      // Non-fatal — the account is still created; the site can be built in the editor.
    }
  }

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: { status: "CONVERTED", convertedClientId: client.id },
  });

  return { clientId: client.id, alreadyConverted: false };
}
