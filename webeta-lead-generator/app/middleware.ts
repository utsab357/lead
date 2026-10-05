import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_SECRET = process.env.APP_AUTH_SECRET || "webeta_lead_gen_secret_token_2025";
const VALID_LOGIN_ID = process.env.APP_LOGIN_ID || "9064970761";
const EXPECTED_TOKEN = Buffer.from(`${VALID_LOGIN_ID}:${AUTH_SECRET}`).toString("base64");

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Whitelist static files, previews, and public routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/html-previews") ||
    pathname.startsWith("/previews") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|map|html)$/i)
  ) {
    return NextResponse.next();
  }

  // 2. Check auth session cookie
  const sessionCookie = request.cookies.get("webeta_session")?.value;

  if (sessionCookie && sessionCookie === EXPECTED_TOKEN) {
    return NextResponse.next();
  }

  // 3. Unauthorized — redirect to login page
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
