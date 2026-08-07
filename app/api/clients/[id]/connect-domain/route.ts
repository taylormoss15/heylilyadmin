import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureZone, isCloudflareConfigured } from "@/lib/integrations/cloudflare";

export const dynamic = "force-dynamic";

// Connect the client's domain to Cloudflare (keeping their registrar). Creates
// the zone if needed and returns the two nameservers to set + the activation
// status. Idempotent — call it again to re-check whether it's gone active.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isCloudflareConfigured()) {
    return NextResponse.json(
      { error: "Cloudflare isn't configured yet — add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID." },
      { status: 400 }
    );
  }

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const domain = client.domain || client.siteUrl;
  if (!domain) {
    return NextResponse.json({ error: "Set the client's domain in Business details first." }, { status: 400 });
  }

  let zone;
  try {
    zone = await ensureZone(domain);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect the domain";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      cfZoneId: zone.zoneId,
      cfNameservers: JSON.stringify(zone.nameServers),
      cfZoneStatus: zone.status,
    },
  });

  return NextResponse.json({
    ok: true,
    domain,
    nameServers: zone.nameServers,
    status: zone.status,
    alreadyExisted: zone.alreadyExisted,
  });
}
