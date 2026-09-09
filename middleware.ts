import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, sessionCookieName } from "@/lib/auth";

// Gate everything except the public compliance log API, the uptime webhook
// receiver, the login page/API, and static assets. Those three are meant
// to be hit by unauthenticated third parties (client sites, uptime
// monitors) or unauthenticated visitors (the login page itself).
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/webhooks",
  "/api/compliance",
  "/api/forms", // contact-form relay POSTed by client sites (cross-origin)
  "/u", // public one-click unsubscribe pages
  "/api/unsubscribe", // unsubscribe endpoint (CAN-SPAM)
  "/api/cron", // scheduled jobs — protected by CRON_SECRET in the route itself
  "/api/assets", // locally-stored site images (R2 fallback), referenced by client sites
  "/widget", // client-embeddable badge script, served from /public/widget
  "/demo", // public prospect sales demos (before/after + scorecard), shared by link
  "/scan", // public free-scan lead magnet
  "/api/public", // public scan + lead-capture endpoints behind the lead magnet
  "/api/track", // first-party site analytics beacon (cross-origin from client sites)
  "/insights", // ephemeral, link-authenticated client insight pages
  "/home.html", // marketing homepage static asset
  "/_next",
  "/favicon.ico",
];

// Hosts that should serve the public marketing homepage at their root (the app
// also serves admin.heylily.ai from the same deploy). Configurable via env.
const MARKETING_HOSTS = (process.env.MARKETING_HOSTS || "heylily.ai,www.heylily.ai")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // On the marketing domain, root serves the homepage (public static file).
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  if (pathname === "/" && MARKETING_HOSTS.includes(host)) {
    return NextResponse.rewrite(new URL("/home.html", request.url));
  }

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(sessionCookieName)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
