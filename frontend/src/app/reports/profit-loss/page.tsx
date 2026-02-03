"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PLReport {
  month: string;
  summary: {
    revenue: number;
    total_costs: number;
    profit_loss: number;
    profit_margin_percentage: number;
  };
  overheads: {
    total: number;
    breakdown: {
      support_staff_salaries: number;
      expenses: number;
      bills: number;
    };
    details: {
      support_staff_count: number;
      expense_count: number;
      bill_count: number;
    };
  };
  operational_costs: {
    total: number;
    staff_count: number;
  };
  revenue_details: {
    total: number;
    project_count: number;
    projects: Array<{
      project_id: string;
      project_name: string;
      client_name: string;
      cost: number;
    }>;
  };
}

export default function ProfitLossPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [report, setReport] = useState<PLReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Set default month to current month
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(currentMonth);
  }, []);

  // Redirect if not authenticated or not authorized
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
    if (session && session.user?.role !== "owner" && session.user?.role !== "finance") {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  // Fetch report when month changes
  useEffect(() => {
    if (selectedMonth) {
      fetchReport();
    }
  }, [selectedMonth]);

  const fetchReport = async () => {
    if (!selectedMonth) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/profit-loss?month=${selectedMonth}`);
      if (!response.ok) {
        throw new Error("Failed to fetch report");
      }
      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  if (status === "loading") {
    return <div className="p-8">Loading...</div>;
  }

  if (!session || (session.user?.role !== "owner" && session.user?.role !== "finance")) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Profit & Loss Report</h1>
          <p className="mt-2 text-sm text-gray-600">
            Comprehensive monthly financial analysis including revenue, overheads, and profitability
          </p>
        </div>

        {/* Month Selector */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Month
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading report...</p>
          </div>
        )}

        {!loading && report && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Revenue Card */}
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {formatCurrency(report.summary.revenue)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {report.revenue_details.project_count} projects
                    </p>
                  </div>
                  <div className="rounded-full bg-green-100 p-3">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Overheads Card */}
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Overheads</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {formatCurrency(report.overheads.total)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Support + Expenses + Bills
                    </p>
                  </div>
                  <div className="rounded-full bg-orange-100 p-3">
                    <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Operational Costs Card */}
              <div className="rounded-lg bg-white p-6 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Operational Staff</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {formatCurrency(report.operational_costs.total)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {report.operational_costs.staff_count} employees
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Profit/Loss Card */}
              <div className={`rounded-lg p-6 shadow ${report.summary.profit_loss >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {report.summary.profit_loss >= 0 ? 'Net Profit' : 'Net Loss'}
                    </p>
                    <p className={`mt-2 text-3xl font-bold ${report.summary.profit_loss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(Math.abs(report.summary.profit_loss))}
                    </p>
                    <p className={`mt-1 text-xs font-medium ${report.summary.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Margin: {formatPercentage(report.summary.profit_margin_percentage)}
                    </p>
                  </div>
                  <div className={`rounded-full p-3 ${report.summary.profit_loss >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    {report.summary.profit_loss >= 0 ? (
                      <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    ) : (
                      <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Overheads Breakdown */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Overheads Breakdown</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="border-l-4 border-purple-500 bg-purple-50 p-4 rounded">
                  <p className="text-sm font-medium text-gray-600">Support Staff Salaries</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatCurrency(report.overheads.breakdown.support_staff_salaries)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {report.overheads.details.support_staff_count} employees
                  </p>
                </div>
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded">
                  <p className="text-sm font-medium text-gray-600">Expenses</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatCurrency(report.overheads.breakdown.expenses)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {report.overheads.details.expense_count} transactions
                  </p>
                </div>
                <div className="border-l-4 border-red-500 bg-red-50 p-4 rounded">
                  <p className="text-sm font-medium text-gray-600">Bills</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatCurrency(report.overheads.breakdown.bills)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {report.overheads.details.bill_count} bills
                  </p>
                </div>
              </div>
            </div>

            {/* Revenue by Project */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue by Project</h2>
              {report.revenue_details.projects.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No project revenue for this month</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Project
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Revenue
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          % of Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {report.revenue_details.projects.map((project) => (
                        <tr key={project.project_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {project.project_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {project.client_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                            {formatCurrency(project.cost)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                            {((project.cost / report.summary.revenue) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={2} className="px-6 py-4 text-sm font-bold text-gray-900">
                          Total Revenue
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                          {formatCurrency(report.revenue_details.total)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                          100%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Cost Summary */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Cost Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-gray-600">Overheads (Support + Expenses + Bills)</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(report.overheads.total)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-gray-600">Operational Staff Salaries</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(report.operational_costs.total)}</span>
                </div>
                <div className="flex justify-between items-center border-t-2 pt-2 text-lg font-bold">
                  <span className="text-gray-900">Total Costs</span>
                  <span className="text-gray-900">{formatCurrency(report.summary.total_costs)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
