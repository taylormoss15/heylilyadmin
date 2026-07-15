import { AwsClient } from "aws4fetch";
import { promises as fs } from "fs";
import path from "path";

// Cloudflare R2 (S3-compatible) asset storage for site images. GHL Custom
// HTML Pages require ABSOLUTE URLs for every asset, so uploaded images must
// live on a public CDN, not in the app. When R2 isn't configured yet, this
// falls back to storing files on local disk and serving them via
// /api/assets/* — still absolute URLs (built from ADMIN_BASE_URL), so the
// renderer, preview, and validation all work end-to-end before real R2
// credentials are dropped into Coolify. Only lib/integrations/r2.ts and
// the R2_* env vars change when going live.

const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL
  );
}

export interface UploadResult {
  url: string;
  storage: "r2" | "local";
}

export async function uploadAsset(
  key: string,
  body: Buffer,
  contentType: string
): Promise<UploadResult> {
  if (isR2Configured()) {
    const accountId = process.env.R2_ACCOUNT_ID!;
    const bucket = process.env.R2_BUCKET!;
    const publicBase = process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, "");

    const client = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      service: "s3",
      region: "auto",
    });

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
    const res = await client.fetch(endpoint, {
      method: "PUT",
      body: body as unknown as BodyInit,
      headers: { "Content-Type": contentType },
    });

    if (!res.ok) {
      throw new Error(`R2 upload failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return { url: `${publicBase}/${key}`, storage: "r2" };
  }

  // Local fallback — write to disk, serve via the public /api/assets route.
  const filePath = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  const adminBase = (process.env.ADMIN_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return { url: `${adminBase}/api/assets/${key}`, storage: "local" };
}

/** Read a locally-stored asset (fallback mode only). Returns null if missing or path escapes the dir. */
export async function readLocalAsset(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const filePath = path.normalize(path.join(LOCAL_DIR, key));
  if (!filePath.startsWith(LOCAL_DIR)) return null; // guard against path traversal
  try {
    const body = await fs.readFile(filePath);
    return { body, contentType: contentTypeFor(filePath) };
  } catch {
    return null;
  }
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
  };
  return map[ext] ?? "application/octet-stream";
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
];

export function extensionForType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };
  return map[contentType] ?? "bin";
}
