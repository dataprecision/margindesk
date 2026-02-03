"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Don't show navbar on auth pages
  if (pathname?.startsWith("/auth/")) {
    return null;
  }

  // Don't show navbar if not authenticated
  if (!session) {
    return null;
  }

  const isActive = (path: string) => {
    return pathname === path;
  };

  const navLinkClass = (path: string) => {
    const base = "px-3 py-2 rounded-md text-sm font-medium transition";
    if (isActive(path)) {
      return `${base} bg-gray-900 text-white`;
    }
    return `${base} text-gray-300 hover:bg-gray-700 hover:text-white`;
  };

  return (
    <nav className="bg-gray-800 shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/dashboard" className="text-xl font-bold text-white">
                MarginDesk
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-4">
              <Link href="/dashboard" className={navLinkClass("/dashboard")}>
                Dashboard
              </Link>
              <Link href="/clients" className={navLinkClass("/clients")}>
                Clients
              </Link>
              <Link href="/projects" className={navLinkClass("/projects")}>
                Projects
              </Link>
              <Link href="/employees" className={navLinkClass("/employees")}>
                People
              </Link>
              <Link href="/salaries" className={navLinkClass("/salaries")}>
                Salaries
              </Link>
              <Link href="/expenses" className={navLinkClass("/expenses")}>
                Expenses
              </Link>
              <Link href="/bills" className={navLinkClass("/bills")}>
                Bills
              </Link>
              <Link href="/holidays" className={navLinkClass("/holidays")}>
                Holidays
              </Link>
              <Link href="/import" className={navLinkClass("/import")}>
                Import
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(session.user?.role === "owner" || session.user?.role === "finance") && (
              <Link
                href="/settings"
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition flex items-center gap-2"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
            )}
            <div className="text-sm text-gray-300">
              <div className="font-medium">{session.user?.name || session.user?.email}</div>
              <div className="text-xs text-gray-400">
                {session.user?.role}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="rounded-md bg-gray-700 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600 hover:text-white transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
