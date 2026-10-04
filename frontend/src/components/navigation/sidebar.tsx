"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The sidebar groups pages by the job they serve. Groups collapse; the one
// holding the current page is always open, and the browser remembers the
// others. Setup pages sit behind one line at the bottom. Below the lg
// breakpoint the sidebar shrinks to an icon rail.

type Role = "owner" | "finance" | "pm" | "legal" | "readonly";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  /** Badge shown after the label, from /api/contracts/nav-counts. */
  badge?: "pointers" | "overdue" | "po_alerts";
}

interface NavGroup {
  key: string;
  label: string;
  icon: keyof typeof ICONS;
  items: NavItem[];
}

const ALL: Role[] = ["owner", "finance", "pm", "legal", "readonly"];
const BACK_OFFICE: Role[] = ["owner", "finance", "readonly"];
const DELIVERY: Role[] = ["owner", "finance", "pm", "readonly"];
const BILLING: Role[] = ["owner", "finance", "legal"];
const ADMIN: Role[] = ["owner", "finance"];

const GROUPS: NavGroup[] = [
  {
    key: "billing",
    label: "Billing",
    icon: "billing",
    items: [
      { href: "/companies", label: "Companies", roles: BILLING },
      { href: "/contracts", label: "Contracts", roles: BILLING, badge: "pointers" },
      { href: "/contracts/estimates", label: "Draft estimates", roles: BILLING },
      { href: "/contracts/purchase-orders", label: "Purchase orders", roles: BILLING, badge: "po_alerts" },
      { href: "/contracts/tasks", label: "Follow-ups", roles: BILLING, badge: "overdue" },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    icon: "delivery",
    items: [
      { href: "/pods", label: "Pods", roles: DELIVERY },
      { href: "/projects", label: "Projects", roles: BACK_OFFICE },
      { href: "/project-hours", label: "Project Hours", roles: DELIVERY },
      { href: "/timesheets", label: "Timesheets", roles: BACK_OFFICE },
      { href: "/project-costs", label: "Project Costs", roles: DELIVERY },
      { href: "/holidays", label: "Holidays", roles: DELIVERY },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "money",
    items: [
      { href: "/bills", label: "Bills", roles: BACK_OFFICE },
      { href: "/expenses", label: "Expenses", roles: BACK_OFFICE },
      { href: "/reselling-invoices", label: "Reselling", roles: BACK_OFFICE },
      { href: "/salaries", label: "Salaries", roles: BACK_OFFICE },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    icon: "reports",
    items: [
      { href: "/reports/profit-loss", label: "P&L", roles: BACK_OFFICE },
      { href: "/reports/pod-financials", label: "Pod Financials", roles: DELIVERY },
      { href: "/reports/pod-owner-financials", label: "Pod Owner Report", roles: DELIVERY },
    ],
  },
];

const SETUP: NavItem[] = [
  { href: "/clients", label: "Clients", roles: ADMIN },
  { href: "/employees", label: "People", roles: ADMIN },
  { href: "/products", label: "Products", roles: ADMIN },
  { href: "/settings/pod-owners", label: "Pod Owners", roles: ADMIN },
  { href: "/settings/import-data", label: "Import Data", roles: ADMIN },
  { href: "/settings/import-salary", label: "Import Salary", roles: ADMIN },
  { href: "/sync", label: "Sync", roles: ADMIN },
  { href: "/settings/api-keys", label: "API Keys", roles: ADMIN },
  { href: "/settings", label: "Settings", roles: ADMIN },
];

// Small monochrome icons (24px viewBox), one per group.
const ICONS = {
  dashboard: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  billing: "M9 12h6m-6 4h6M7 4h7l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1zm7 0v5h5",
  delivery: "M12 3l9 4.5-9 4.5-9-4.5L12 3zm-9 9l9 4.5 9-4.5M3 16.5L12 21l9-4.5",
  money: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 3h18M16 14h2",
  reports: "M4 20V10m6 10V4m6 16v-7m6 7H2",
  setup: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1l2-1.5-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L14.8 3h-4l-.4 2.6a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.4 7.4 0 000 2l-2 1.5 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 001.7-1l2.4 1 2-3.4-2-1.5a7.4 7.4 0 00.1-1z",
  chevron: "M9 6l6 6-6 6",
} as const;

function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const STORAGE_KEY = "margindesk.nav.open";

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loadedPrefs, setLoadedPrefs] = useState(false);
  const [counts, setCounts] = useState<{ pointers: number; overdue: number; po_alerts: number } | null>(null);

  const role = (session?.user?.role ?? "readonly") as Role;
  const allowed = (item: NavItem) => item.roles.includes(role);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length > 0);
  const setup = SETUP.filter(allowed);
  const seesBilling = GROUPS[0].items.some(allowed);

  const isCurrent = (href: string) => (href === "/contracts" ? pathname === href || /^\/contracts\/(?!tasks|purchase-orders|estimates)/.test(pathname) : pathname === href || (href !== "/settings" && pathname.startsWith(href + "/")));
  const activeGroup = groups.find((g) => g.items.some((i) => isCurrent(i.href)))?.key ?? (setup.some((i) => isCurrent(i.href)) ? "setup" : null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") setOpen(saved);
    } catch {}
    setLoadedPrefs(true);
  }, []);

  useEffect(() => {
    if (!session || !seesBilling) return;
    fetch("/api/contracts/nav-counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCounts({ pointers: d.contracts_with_open_pointers ?? 0, overdue: d.overdue_tasks ?? 0, po_alerts: d.po_alerts ?? 0 }))
      .catch(() => {});
  }, [session, seesBilling, pathname]);

  if (pathname.startsWith("/auth/") || !session) return null;

  const isOpen = (key: string) => key === activeGroup || !!open[key];
  const toggle = (key: string) => {
    const next = { ...open, [key]: !isOpen(key) };
    setOpen(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const badgeFor = (item: NavItem) => {
    if (!counts || !item.badge) return null;
    const n = item.badge === "pointers" ? counts.pointers : item.badge === "po_alerts" ? counts.po_alerts : counts.overdue;
    if (!n) return null;
    const tone = item.badge === "overdue" || item.badge === "po_alerts" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800";
    return <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}>{n}</span>;
  };

  const linkClass = (href: string) =>
    `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${isCurrent(href) ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100"}`;

  const groupHeader = (key: string, label: string, icon: keyof typeof ICONS, badge?: number) => (
    <button
      type="button"
      onClick={() => toggle(key)}
      aria-expanded={isOpen(key)}
      title={label}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${key === activeGroup ? "text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
    >
      <Icon name={icon} />
      <span className="hidden lg:inline">{label}</span>
      {badge ? <span className="ml-auto hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 tabular-nums lg:inline">{badge}</span> : null}
      <Icon name="chevron" className={`ml-auto hidden h-4 w-4 text-gray-400 transition-transform lg:inline ${isOpen(key) ? "rotate-90" : ""} ${badge ? "!ml-2" : ""}`} />
    </button>
  );

  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col border-r border-gray-200 bg-white lg:w-60">
      <div className="border-b border-gray-200 px-4 py-4">
        <Link href="/dashboard" className="text-xl font-bold text-blue-600">
          <span className="lg:hidden">M</span>
          <span className="hidden lg:inline">MarginDesk</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        <Link href="/dashboard" title="Dashboard" className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isCurrent("/dashboard") ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"}`}>
          <Icon name="dashboard" />
          <span className="hidden lg:inline">Dashboard</span>
        </Link>

        <div className="mt-3 space-y-1">
          {groups.map((g) => {
            const groupBadge = g.key === "billing" && counts && !isOpen(g.key) ? counts.pointers + counts.overdue + counts.po_alerts : 0;
            return (
              <div key={g.key}>
                {groupHeader(g.key, g.label, g.icon, groupBadge || undefined)}
                {loadedPrefs && isOpen(g.key) && (
                  <div className="mt-0.5 hidden space-y-0.5 pb-1 pl-8 lg:block">
                    {g.items.map((item) => (
                      <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                        <span>{item.label}</span>
                        {badgeFor(item)}
                      </Link>
                    ))}
                  </div>
                )}
                {/* Icon rail: the group's pages as a flat list of initials */}
                <div className="mt-0.5 space-y-0.5 lg:hidden">
                  {g.items.map((item) => (
                    <Link key={item.href} href={item.href} title={item.label} className={`block rounded-md px-3 py-1 text-center text-xs ${isCurrent(item.href) ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>
                      {item.label.slice(0, 2)}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-gray-200 px-2 py-3">
        {setup.length > 0 && (
          <div className="mb-2">
            {groupHeader("setup", "Setup", "setup")}
            {loadedPrefs && isOpen("setup") && (
              <div className="mt-0.5 hidden space-y-0.5 pl-8 lg:block">
                {setup.map((item) => (
                  <Link key={item.href} href={item.href} className={linkClass(item.href)}>{item.label}</Link>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
          <div className="hidden min-w-0 flex-1 lg:block">
            <div className="truncate text-sm font-medium text-gray-900">{session.user?.name || session.user?.email}</div>
            <div className="text-xs capitalize text-gray-500">{session.user?.role}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="mx-auto p-1 text-gray-400 transition hover:text-red-600 lg:mx-0"
            title="Sign out"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
