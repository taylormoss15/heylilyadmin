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
  "/api/assets", // locally-stored site images (R2 fallback), referenced by client sites
  "/widget", // client-embeddable badge script, served from /public/widget
  "/demo", // public prospect sales demos (before/after + scorecard), shared by link
  "/_next",
  "/favicon.ico",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
