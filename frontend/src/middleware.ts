import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Pages that PM and readonly users can access
const PM_ALLOWED_PATHS = [
  "/dashboard",
  "/help",
  "/pods",
  "/project-costs",
  "/project-hours",
  "/holidays",
  "/reports/pod-financials",
  "/reports/pod-owner-financials",
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

  // legal: contracts, companies and help only (no drafts or purchase-order consumption);
  // billing (invoicing team): the Billing section only
  if (role === "legal" || role === "billing") {
    const register = pathname === "/contracts" || pathname.startsWith("/contracts/") || pathname === "/companies" || pathname.startsWith("/companies/") || pathname === "/help" || pathname.startsWith("/help/");
    const legalBlocked = role === "legal" && (pathname.startsWith("/contracts/estimates") || pathname.startsWith("/contracts/purchase-orders"));
    if (register && !legalBlocked) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/contracts";
    return NextResponse.redirect(url);
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
