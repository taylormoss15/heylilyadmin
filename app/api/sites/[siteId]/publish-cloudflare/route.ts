import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderPageRecord } from "@/lib/site/render-record";
import { validateRender } from "@/lib/site/validate";
import { isCloudflareConfigured, publishToCloudflare } from "@/lib/integrations/cloudflare";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One-click: build the site's finalized HTML and push it live on Cloudflare
// (Workers + free SSL). Re-validates first — we never put a non-compliant page
// live. If the client's domain is a zone on the Cloudflare account, the custom
// domain is attached automatically; otherwise the instant workers.dev URL is
// returned along with what to do next.
export async function POST(_request: NextRequest, { params }: { params: { siteId: string } }) {
  if (!isCloudflareConfigured()) {
    return NextResponse.json(
      { error: "Cloudflare isn't configured yet — add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID." },
      { status: 400 }
    );
  }

  const site = await prisma.site.findUnique({ where: { id: params.siteId }, include: { client: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const page =
    (await prisma.page.findFirst({ where: { siteId: site.id, isHome: true } })) ||
    (await prisma.page.findFirst({ where: { siteId: site.id } }));
  if (!page) return NextResponse.json({ error: "This site has no page to publish." }, { status: 400 });

  // Never put a non-compliant page live.
  const render = renderPageRecord(page, site);
  const report = await validateRender(render);
  if (!report.ok) {
    return NextResponse.json(
      { ok: false, report, message: "Fix the accessibility/size checks before going live." },
      { status: 422 }
    );
  }

  let result;
  try {
    result = await publishToCloudflare({
      siteId: site.id,
      html: render.html,
      domain: site.client.domain || site.client.siteUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cloudflare deploy failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await prisma.site.update({
    where: { id: site.id },
    data: {
      status: "PUBLISHED",
      cfScript: result.scriptName,
      cfPreviewUrl: result.previewUrl,
      cfDomain: result.customDomain,
      cfDeployedAt: new Date(),
    },
  });

  const liveUrl = result.customDomain ? `https://${result.customDomain}` : result.previewUrl;
  return NextResponse.json({ ok: true, liveUrl, ...result });
}
