import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Serve the before/after screenshots as real image URLs. Emails can't use the
// data-URL screenshots we store (Gmail strips them), so the outreach email
// points its <img> tags here. Public (under /demo).
export async function GET(_request: Request, { params }: { params: { token: string; which: string } }) {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  const dataUrl = params.which === "after" ? demo?.afterShot : demo?.beforeShot;
  if (!dataUrl) return new Response("Not found", { status: 404 });

  const m = dataUrl.match(/^data:(.+?);base64,(.*)$/s);
  if (!m) return new Response("Bad image", { status: 500 });

  const buffer = Buffer.from(m[2], "base64");
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=86400" },
  });
}
