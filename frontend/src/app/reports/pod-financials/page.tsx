"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface PodReport {
  pod: {
    id: string;
    name: string;
    leader: { id: string; name: string; employee_code: string };
    status: string;
  };
  period: {
    start: string;
    end: string;
    months: string[];
  };
  financials: {
    revenue: {
      total: number;
      by_month: Record<string, number>;
      by_project: Record<string, { name: string; client: string; total: number }>;
    };
    costs: {
      salaries: number;
      by_month: Record<string, number>;
      overheads: number;
      overhead_by_month: Record<string, number>;
      direct_expenses: number;
      direct_expenses_by_project: Record<string, number>;
      direct_expenses_by_month: Record<string, number>;
    };
    contracted_hours?: {
      total: number;
      by_project: Record<string, number>;
      by_month: Record<string, number>;
      logged_by_project: Record<string, number>;
    };
    gross_profit: {
      amount: number;
      margin_pct: number;
    };
    net_profit: {
      amount: number;
      margin_pct: number;
    };
  };
  utilization: {
    summary: {
      total_billable_hours: number;
      total_working_hours: number;
      total_worked_hours: number;
      total_unutilized_hours: number;
      overall_utilization_pct: number;
      overall_billability_pct: number;
    };
    by_member: Array<{
      person: { id: string; name: string; employee_code: string };
      allocation_pct: number;
      billable_hours: number;
      non_billable_hours: number;
      working_hours: number;
      worked_hours: number;
      unutilized_hours: number;
      utilization_pct: number;
      billable_pct: number;
      projects: Record<string, { name: string; hours: number }>;
    }>;
  };
}

interface Pod {
  id: string;
  name: string;
  leader: { name: string };
}

export default function PodFinancialsReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPodId, setSelectedPodId] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [report, setReport] = useState<PodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);

  useEffect(() => {
    fetchPods();

    // Check for URL query params
    const qPodId = searchParams.get("pod_id");
    const qStart = searchParams.get("start");
    const qEnd = searchParams.get("end");

    if (qStart) {
      setStartMonth(qStart);
    } else {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      setStartMonth(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`);
    }

    if (qEnd) {
      setEndMonth(qEnd);
    } else {
      const now = new Date();
      setEndMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    }

    if (qPodId) {
      setSelectedPodId(qPodId);
      setAutoGenerate(true);
    }
  }, []);

  // Auto-generate report when navigated with query params
  useEffect(() => {
    if (autoGenerate && pods.length > 0 && selectedPodId) {
      setAutoGenerate(false);
      fetchReport();
    }
  }, [autoGenerate, pods, selectedPodId]);

  const fetchPods = async () => {
    try {
      const res = await fetch("/api/pods?status=active");
      if (!res.ok) throw new Error("Failed to fetch pods");
      const data = await res.json();
      setPods(data.pods);
      // Only set default pod if no query param was provided
      if (data.pods.length > 0 && !searchParams.get("pod_id")) {
        setSelectedPodId(data.pods[0].id);
      }
    } catch (err) {
      console.error("Error fetching pods:", err);
    }
  };

  const fetchReport = async () => {
    if (!selectedPodId || !startMonth || !endMonth) {
      setError("Please select pod and month range");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // End month: use last day of selected month
      const [endYear, endMon] = endMonth.split("-").map(Number);
      const lastDay = new Date(endYear, endMon, 0).getDate();
      const endDate = `${endMonth}-${String(lastDay).padStart(2, "0")}`;

      const params = new URLSearchParams({
        pod_id: selectedPodId,
        start_month: `${startMonth}-01`,
        end_month: endDate,
      });

      const res = await fetch(`/api/reports/pod-financials?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to generate report");

      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatMonth = (monthStr: string) => {
    const date = new Date(monthStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          {searchParams.get("from") === "pod-owner" && (
            <button
              onClick={() => {
                const ownerId = searchParams.get("owner_id");
                router.push(`/reports/pod-owner-financials${ownerId ? `?owner_id=${ownerId}&start=${startMonth}&end=${endMonth}` : ""}`);
              }}
              className="text-blue-600 hover:text-blue-800 mb-2 text-sm"
            >
              ← Back to Pod Owner Report
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900">Pod Financial & Utilization Report</h1>
          <p className="text-gray-600 mt-2">Revenue, costs, profitability, and resource utilization</p>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pod</label>
              <select
                value={selectedPodId}
                onChange={(e) => setSelectedPodId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select Pod</option>
                {pods.map((pod) => (
                  <option key={pod.id} value={pod.id}>
                    {pod.name} (Leader: {pod.leader.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Month</label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Month</label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <button
              onClick={fetchReport}
              disabled={loading || !selectedPodId}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(report.financials.revenue.total)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Salary Costs</div>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(report.financials.costs.salaries)}
                </div>
              </div>
              <div
                className="bg-white p-6 rounded-lg shadow"
                title="Tagged BillLineItems whose bill's billed-for-month falls in this period. Tag bills to projects on the /bills page."
              >
                <div className="text-sm text-gray-600 mb-1">Direct Expenses</div>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(report.financials.costs.direct_expenses)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Gross Profit</div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(report.financials.gross_profit.amount)}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Margin: {formatPercent(report.financials.gross_profit.margin_pct)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Overall Utilization</div>
                <div className="text-2xl font-bold text-purple-600">
                  {formatPercent(report.utilization.summary.overall_utilization_pct)}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Billability: {formatPercent(report.utilization.summary.overall_billability_pct)}
                </div>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue Breakdown</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">By Project</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                        <tr>
                          <th className="px-3 py-2">Project</th>
                          <th className="px-3 py-2 text-right">Revenue</th>
                          <th
                            className="px-3 py-2 text-right"
                            title="Sum of contracted hours from /project-hours for the selected period"
                          >
                            Contracted Hrs
                          </th>
                          <th
                            className="px-3 py-2 text-right"
                            title="Billable hours logged via timesheets in the selected period"
                          >
                            Logged Hrs
                          </th>
                          <th
                            className="px-3 py-2 text-right"
                            title="logged / contracted. >120% suggests scope creep; <80% suggests under-delivery."
                          >
                            Δ %
                          </th>
                          <th
                            className="px-3 py-2 text-right"
                            title="Revenue / Contracted Hrs — what the client actually pays per hour bought"
                          >
                            Eff. Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Object.entries(report.financials.revenue.by_project).map(([id, proj]) => {
                          const contracted =
                            report.financials.contracted_hours?.by_project[id] ?? 0;
                          const logged =
                            report.financials.contracted_hours?.logged_by_project[id] ?? 0;
                          const deltaPct =
                            contracted > 0 ? (logged / contracted) * 100 : null;
                          const effRate =
                            contracted > 0 ? proj.total / contracted : null;
                          const deltaClass =
                            deltaPct === null
                              ? "text-gray-400"
                              : deltaPct > 120
                                ? "text-red-600 font-semibold"
                                : deltaPct < 80
                                  ? "text-orange-600"
                                  : "text-gray-700";
                          return (
                            <tr key={id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <div className="font-medium">{proj.name}</div>
                                <div className="text-xs text-gray-500">{proj.client}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-green-600">
                                {formatCurrency(proj.total)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {contracted > 0 ? contracted.toFixed(1) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {logged > 0 ? logged.toFixed(1) : "—"}
                              </td>
                              <td className={`px-3 py-2 text-right ${deltaClass}`}>
                                {deltaPct === null ? "—" : `${deltaPct.toFixed(0)}%`}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {effRate === null
                                  ? "—"
                                  : `₹${effRate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/hr`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {report.financials.contracted_hours && (
                        <tfoot className="bg-gray-50 text-xs">
                          <tr className="font-semibold">
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2 text-right text-green-600">
                              {formatCurrency(report.financials.revenue.total)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {report.financials.contracted_hours.total.toFixed(1)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Object.values(
                                report.financials.contracted_hours.logged_by_project
                              )
                                .reduce((s, v) => s + v, 0)
                                .toFixed(1)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {report.financials.contracted_hours.total > 0
                                ? `${(
                                    (Object.values(
                                      report.financials.contracted_hours.logged_by_project
                                    ).reduce((s, v) => s + v, 0) /
                                      report.financials.contracted_hours.total) *
                                    100
                                  ).toFixed(0)}%`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {report.financials.contracted_hours.total > 0
                                ? `₹${(
                                    report.financials.revenue.total /
                                    report.financials.contracted_hours.total
                                  ).toLocaleString("en-IN", { maximumFractionDigits: 0 })}/hr`
                                : "—"}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">By Month</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {report.period.months.map((month) => (
                      <div key={month} className="p-3 bg-gray-50 rounded text-center">
                        <div className="text-xs text-gray-600">{formatMonth(month)}</div>
                        <div className="font-semibold text-sm mt-1">
                          {formatCurrency(report.financials.revenue.by_month[month] || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Utilization Details */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Resource Utilization</h2>

              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-blue-50 rounded-lg">
                <div>
                  <div className="text-sm text-gray-600">Billable Hours</div>
                  <div className="text-lg font-semibold text-blue-600">
                    {report.utilization.summary.total_billable_hours.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Billability: {formatPercent(report.utilization.summary.overall_billability_pct)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Worked Hours</div>
                  <div className="text-lg font-semibold text-green-600">
                    {report.utilization.summary.total_worked_hours.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Utilization: {formatPercent(report.utilization.summary.overall_utilization_pct)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Working Hours</div>
                  <div className="text-lg font-semibold text-gray-600">
                    {report.utilization.summary.total_working_hours.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">&nbsp;</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Unutilized Hours</div>
                  <div className="text-lg font-semibold text-red-600">
                    {report.utilization.summary.total_unutilized_hours.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {report.utilization.summary.total_working_hours > 0
                      ? formatPercent(
                          (report.utilization.summary.total_unutilized_hours /
                            report.utilization.summary.total_working_hours) * 100
                        )
                      : "—"}{" "}
                    of capacity
                  </div>
                </div>
              </div>

              {/* Member Details */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Resource</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Allocation %</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Billable Hrs</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Non-Bill Hrs</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Unutilized</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Utilization</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Billability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {report.utilization.by_member.map((member) => (
                      <tr key={member.person.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium">{member.person.name}</div>
                          <div className="text-sm text-gray-600">{member.person.employee_code}</div>
                        </td>
                        <td className="px-4 py-3 text-center">{member.allocation_pct}%</td>
                        <td className="px-4 py-3 text-right">{member.billable_hours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right">{member.non_billable_hours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{member.unutilized_hours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              member.utilization_pct >= 80
                                ? "bg-green-100 text-green-800"
                                : member.utilization_pct >= 60
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {formatPercent(member.utilization_pct)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              member.billable_pct >= 70
                                ? "bg-green-100 text-green-800"
                                : member.billable_pct >= 50
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {formatPercent(member.billable_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Project Breakdown per Member */}
              <div className="mt-6">
                <h3 className="font-semibold text-gray-700 mb-3">Billable Hours by Project</h3>
                <div className="space-y-4">
                  {report.utilization.by_member.map((member) => (
                    <div key={member.person.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="font-medium mb-2">{member.person.name}</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {Object.entries(member.projects).map(([projectId, proj]) => (
                          <div key={projectId} className="flex justify-between p-2 bg-white rounded">
                            <span className="text-sm text-gray-600">{proj.name}</span>
                            <span className="text-sm font-medium">{proj.hours.toFixed(1)}h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
