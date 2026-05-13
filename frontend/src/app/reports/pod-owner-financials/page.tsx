"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface PodResult {
  pod: { id: string; name: string; leader: { name: string } };
  revenue: number;
  salary_costs: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_billable_hours: number;
  total_working_hours: number;
  total_worked_hours: number;
  utilization_pct: number;
  billability_pct: number;
  member_count: number;
}

interface ReportData {
  owner: { id: string; name: string; person: { name: string } };
  period: { start: string; end: string; months: string[] };
  pods: PodResult[];
  aggregate: {
    revenue: number;
    salary_costs: number;
    gross_profit: number;
    gross_margin_pct: number;
    total_billable_hours: number;
    total_working_hours: number;
    total_worked_hours: number;
    overall_utilization_pct: number;
    overall_billability_pct: number;
  };
}

interface PodOwner {
  id: string;
  name: string;
  person: { id: string; name: string; employee_code: string };
}

export default function PodOwnerFinancialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [owners, setOwners] = useState<PodOwner[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);

  useEffect(() => {
    fetchOwners();

    const qOwnerId = searchParams.get("owner_id");
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

    if (qOwnerId) {
      setSelectedOwnerId(qOwnerId);
      setAutoGenerate(true);
    }
  }, []);

  useEffect(() => {
    if (autoGenerate && owners.length > 0 && selectedOwnerId) {
      setAutoGenerate(false);
      fetchReport();
    }
  }, [autoGenerate, owners, selectedOwnerId]);

  const fetchOwners = async () => {
    try {
      const res = await fetch("/api/pod-owners?active_only=true");
      if (!res.ok) throw new Error("Failed to fetch owners");
      const data = await res.json();
      setOwners(data.owners || []);
      if (data.owners?.length > 0 && !searchParams.get("owner_id")) {
        setSelectedOwnerId(data.owners[0].id);
      }
    } catch (err) {
      console.error("Error fetching owners:", err);
    }
  };

  const fetchReport = async () => {
    if (!selectedOwnerId || !startMonth || !endMonth) {
      setError("Please select owner and month range");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [endYear, endMon] = endMonth.split("-").map(Number);
      const lastDay = new Date(endYear, endMon, 0).getDate();
      const endDate = `${endMonth}-${String(lastDay).padStart(2, "0")}`;

      const params = new URLSearchParams({
        owner_id: selectedOwnerId,
        start_month: `${startMonth}-01`,
        end_month: endDate,
      });

      const res = await fetch(`/api/reports/pod-owner-financials?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to generate report");
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Pod Owner Financial Report</h1>
          <p className="text-gray-600 mt-2">
            Aggregated financials across all pods under a pod owner
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pod Owner</label>
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select Owner</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name} ({owner.person.name})
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
              disabled={loading || !selectedOwnerId}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {report && (
          <div className="space-y-6">
            {/* Aggregate Summary */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(report.aggregate.revenue)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Salary Costs</div>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(report.aggregate.salary_costs)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Gross Profit</div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(report.aggregate.gross_profit)}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Margin: {formatPercent(report.aggregate.gross_margin_pct)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Utilization</div>
                <div className="text-2xl font-bold text-purple-600">
                  {formatPercent(report.aggregate.overall_utilization_pct)}
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="text-sm text-gray-600 mb-1">Billability</div>
                <div className="text-2xl font-bold text-indigo-600">
                  {formatPercent(report.aggregate.overall_billability_pct)}
                </div>
              </div>
            </div>

            {/* Per-Pod Breakdown */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Pod Breakdown ({report.pods.length} pods)
              </h2>
              {report.pods.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No pods found under this owner</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Pod</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Leader</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Members</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Revenue</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Salary Costs</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Gross Profit</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Margin</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Utilization</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Billability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {report.pods.map((pod) => (
                        <tr key={pod.pod.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">
                            <button
                              onClick={() => router.push(`/reports/pod-financials?pod_id=${pod.pod.id}&start=${startMonth}&end=${endMonth}&from=pod-owner&owner_id=${selectedOwnerId}`)}
                              className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                            >
                              {pod.pod.name}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{pod.pod.leader.name}</td>
                          <td className="px-4 py-3 text-center">{pod.member_count}</td>
                          <td className="px-4 py-3 text-right text-green-600">{formatCurrency(pod.revenue)}</td>
                          <td className="px-4 py-3 text-right text-red-600">{formatCurrency(pod.salary_costs)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(pod.gross_profit)}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                pod.gross_margin_pct >= 30
                                  ? "bg-green-100 text-green-800"
                                  : pod.gross_margin_pct >= 15
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {formatPercent(pod.gross_margin_pct)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                pod.utilization_pct >= 80
                                  ? "bg-green-100 text-green-800"
                                  : pod.utilization_pct >= 60
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {formatPercent(pod.utilization_pct)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                pod.billability_pct >= 70
                                  ? "bg-green-100 text-green-800"
                                  : pod.billability_pct >= 50
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {formatPercent(pod.billability_pct)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-4 py-3" colSpan={3}>Totals</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(report.aggregate.revenue)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatCurrency(report.aggregate.salary_costs)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(report.aggregate.gross_profit)}</td>
                        <td className="px-4 py-3 text-center">{formatPercent(report.aggregate.gross_margin_pct)}</td>
                        <td className="px-4 py-3 text-center">{formatPercent(report.aggregate.overall_utilization_pct)}</td>
                        <td className="px-4 py-3 text-center">{formatPercent(report.aggregate.overall_billability_pct)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
