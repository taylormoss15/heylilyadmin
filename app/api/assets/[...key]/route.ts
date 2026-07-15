import { NextRequest, NextResponse } from "next/server";
import { readLocalAsset } from "@/lib/integrations/r2";

// Serves locally-stored asset files (only used in the R2 fallback mode).
// Public + long-cached, because generated client sites reference these
// URLs directly. Once real R2 is configured, images are served from R2's
// CDN instead and this route is unused. Excluded from auth in middleware.
export async function GET(_request: NextRequest, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  const asset = await readLocalAsset(key);
  if (!asset) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(asset.body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
