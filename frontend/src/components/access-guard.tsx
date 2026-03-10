"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
];

/**
 * Check if a pathname is allowed for PM role.
 * Matches exact paths and sub-paths (e.g. /pods/[id]).
 */
function isAllowedForPM(pathname: string): boolean {
  return PM_ALLOWED_PATHS.some(
    (allowed) => pathname === allowed || pathname.startsWith(allowed + "/")
  );
}

/**
 * Wrap page content with this component to enforce role-based access.
 * Redirects PM/readonly users to /dashboard if they access restricted pages.
 * Does NOT render children until access is confirmed.
 */
export default function AccessGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      setAllowed(true); // let NextAuth handle redirect
      return;
    }

    const role = session?.user?.role;

    // owner/finance: full access
    if (role === "owner" || role === "finance") {
      setAllowed(true);
      return;
    }

    // pm/readonly: check allowed paths
    if (!isAllowedForPM(pathname || "")) {
      setAllowed(false);
      router.replace("/dashboard");
      return;
    }

    setAllowed(true);
  }, [session, status, router, pathname]);

  // While checking, show nothing (prevents flash of restricted content)
  if (allowed === null || allowed === false) {
    return null;
  }

  return <>{children}</>;
}
