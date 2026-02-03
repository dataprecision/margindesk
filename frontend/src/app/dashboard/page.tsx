"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">
            Welcome to MarginDesk - Project Margin Management System
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Link href="/clients" className="rounded-lg bg-white p-6 shadow hover:shadow-md transition cursor-pointer">
            <h3 className="text-lg font-medium text-gray-900">Clients</h3>
            <p className="mt-2 text-3xl font-semibold text-blue-600">-</p>
            <p className="mt-1 text-sm text-gray-500">Total clients</p>
          </Link>

          <Link href="/projects" className="rounded-lg bg-white p-6 shadow hover:shadow-md transition cursor-pointer">
            <h3 className="text-lg font-medium text-gray-900">Projects</h3>
            <p className="mt-2 text-3xl font-semibold text-green-600">-</p>
            <p className="mt-1 text-sm text-gray-500">Active projects</p>
          </Link>

          <Link href="/employees" className="rounded-lg bg-white p-6 shadow hover:shadow-md transition cursor-pointer">
            <h3 className="text-lg font-medium text-gray-900">Team</h3>
            <p className="mt-2 text-3xl font-semibold text-purple-600">-</p>
            <p className="mt-1 text-sm text-gray-500">Active members</p>
          </Link>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Core Modules</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/clients"
              className="rounded-md border-2 border-blue-500 bg-white px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition text-center"
            >
              Manage Clients
            </Link>
            <Link
              href="/projects"
              className="rounded-md border-2 border-green-500 bg-white px-4 py-3 text-sm font-medium text-green-600 hover:bg-green-50 transition text-center"
            >
              Manage Projects
            </Link>
            <Link
              href="/employees"
              className="rounded-md border-2 border-purple-500 bg-white px-4 py-3 text-sm font-medium text-purple-600 hover:bg-purple-50 transition text-center"
            >
              Manage People
            </Link>
            <button
              disabled
              className="rounded-md border border-gray-300 bg-gray-100 px-4 py-3 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              Manage Allocations (Coming Soon)
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Financial Data (Zoho Books)</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/expenses"
              className="rounded-md border-2 border-orange-500 bg-white px-4 py-3 text-sm font-medium text-orange-600 hover:bg-orange-50 transition text-center"
            >
              📊 Expenses
            </Link>
            <Link
              href="/bills"
              className="rounded-md border-2 border-red-500 bg-white px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition text-center"
            >
              📄 Bills
            </Link>
            {(session.user?.role === "owner" || session.user?.role === "finance") && (
              <Link
                href="/settings"
                className="rounded-md border-2 border-gray-400 bg-white px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition text-center"
              >
                ⚙️ Integration Settings
              </Link>
            )}
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-6">HR Data (Zoho People)</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/holidays"
              className="rounded-md border-2 border-indigo-500 bg-white px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition text-center"
            >
              📅 Company Holidays
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-green-50 p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Authentication Working
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>
                  You are successfully authenticated with Azure AD. All API endpoints are protected with role-based access control.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
