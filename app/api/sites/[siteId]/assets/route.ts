import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ALLOWED_IMAGE_TYPES, extensionForType, uploadAsset } from "@/lib/integrations/r2";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // keep individual assets well under the 5MB page cap

export async function GET(_request: NextRequest, { params }: { params: { siteId: string } }) {
  const assets = await prisma.siteAsset.findMany({
    where: { siteId: params.siteId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assets });
}

/** Upload an image (multipart form-data, field "file") to R2 (or local fallback). */
export async function POST(request: NextRequest, { params }: { params: { siteId: string } }) {
  const site = await prisma.site.findUnique({ where: { id: params.siteId } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const alt = typeof form?.get("alt") === "string" ? (form.get("alt") as string) : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported image type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image exceeds 5MB limit" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = extensionForType(file.type);
  const key = `${params.siteId}/${crypto.randomUUID()}.${ext}`;

  let result;
  try {
    result = await uploadAsset(key, buffer, file.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const asset = await prisma.siteAsset.create({
    data: { siteId: params.siteId, kind: "image", cdnUrl: result.url, alt, bytes: buffer.length },
  });

  return NextResponse.json({ asset, storage: result.storage }, { status: 201 });
}
