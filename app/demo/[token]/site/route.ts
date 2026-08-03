import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Serves the demo's redesign as a real HTML document at its own URL. The
// interactive demo loads this via <iframe src> (not srcDoc) so the page has a
// real base URL — which makes in-page menu anchors (#about, #services…) scroll
// correctly. srcDoc's about:srcdoc base breaks that fragment navigation.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  if (!demo || demo.status !== "READY" || !demo.redesignHtml) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(demo.redesignHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
}
