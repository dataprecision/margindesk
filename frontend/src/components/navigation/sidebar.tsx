"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Don't show sidebar on auth pages
  if (pathname?.startsWith("/auth/")) {
    return null;
  }

  // Don't show sidebar if not authenticated
  if (!session) {
    return null;
  }

  const isActive = (path: string) => {
    return pathname === path;
  };

  const navLinkClass = (path: string) => {
    const base = "flex items-center gap-3 px-4 py-3 text-sm font-medium transition rounded-lg";
    if (isActive(path)) {
      return `${base} bg-blue-600 text-white`;
    }
    return `${base} text-gray-700 hover:bg-gray-100`;
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/clients", label: "Clients", icon: "👥" },
    { href: "/projects", label: "Projects", icon: "📁" },
    { href: "/employees", label: "People", icon: "👤" },
    { href: "/pods", label: "Pods", icon: "🎯" },
    { href: "/project-costs", label: "Project Costs", icon: "💰" },
    { href: "/expenses", label: "Expenses", icon: "💳" },
    { href: "/bills", label: "Bills", icon: "📄" },
    { href: "/holidays", label: "Holidays", icon: "🎄" },
  ];

  const settingsItems = [
    { href: "/settings/products", label: "Products", icon: "📦" },
    { href: "/settings/import-data", label: "Import Data", icon: "📥" },
    { href: "/settings/import-salary", label: "Import Salary", icon: "💵" },
  ];

  const reportItems = [
    { href: "/salaries", label: "Salaries", icon: "💵" },
    { href: "/reports/profit-loss", label: "P&L Report", icon: "💼" },
    { href: "/reports/pod-financials", label: "Pod Financials", icon: "📈" },
    { href: "/reports/reselling-profitability", label: "Reselling Report", icon: "💹" },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-gray-200">
        <Link href="/dashboard" className="text-2xl font-bold text-blue-600">
          MarginDesk
        </Link>
        <p className="text-xs text-gray-500 mt-1">Project Margin Management</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Reports Section */}
        <div className="mt-6">
          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Reports
          </div>
          <div className="space-y-1 mt-2">
            {reportItems.map((item) => (
              <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* User Profile & Settings */}
      <div className="border-t border-gray-200 p-4">
        {(session.user?.role === "owner" || session.user?.role === "finance") && (
          <>
            <div className="mb-2">
              <Link
                href="/settings"
                className={navLinkClass("/settings")}
              >
                <span className="text-lg">⚙️</span>
                <span>Settings</span>
              </Link>
            </div>
            <div className="space-y-1 mb-2">
              {settingsItems.map((item) => (
                <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {session.user?.name || session.user?.email}
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {session.user?.role}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="p-2 text-gray-400 hover:text-red-600 transition"
            title="Sign Out"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
