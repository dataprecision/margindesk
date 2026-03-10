import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Pages that PM and readonly users can access
const PM_ALLOWED_PATHS = [
  "/dashboard",
  "/pods",
  "/project-costs",
  "/salaries",
  "/holidays",
  "/reports/pod-financials",
  "/reports/profit-loss",
  "/auth",
  "/api",
  "/_next",
  "/favicon",
];

function isAllowedForPM(pathname: string): boolean {
  return PM_ALLOWED_PATHS.some(
    (allowed) => pathname === allowed || pathname.startsWith(allowed + "/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Not authenticated — let NextAuth handle redirect
  if (!token) {
    return NextResponse.next();
  }

  const role = token.role as string | undefined;

  // owner/finance or missing role (legacy session): full access
  if (!role || role === "owner" || role === "finance") {
    return NextResponse.next();
  }

  // pm/readonly: check allowed paths
  if (!isAllowedForPM(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
