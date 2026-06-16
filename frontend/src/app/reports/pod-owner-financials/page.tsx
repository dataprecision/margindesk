"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

interface PodResult {
  pod: { id: string; name: string; leader: { name: string } };
  revenue: number;
  salary_costs: number;
  direct_expenses: number;
  contracted_hours: number;
  allocated_capacity_hours: number;
  sold_capacity_pct: number | null;
  effective_rate: number | null;
  gross_profit: number;
  gross_margin_pct: number;
  total_billable_hours: number;
  total_working_hours: number;
  total_worked_hours: number;
  utilization_pct: number;
  billability_pct: number;
  member_count: number;
}

interface BenchPerson {
  person_id: string;
  name: string;
  department: string | null;
  role: string | null;
  bench_since: string; // YYYY-MM-DD
}

interface BenchResult {
  salary_cost: number;
  people_count: number;
  people: BenchPerson[];
}

interface TargetVsActual {
  fiscal_year: number;
  fiscal_year_label?: string;
  rolled_up?: boolean;
  rollup_contributors?: string[];
  months_in_period?: number;
  spans_multiple_fy?: boolean;
  profitability_target_pct?: number;
  profitability_actual_pct?: number;
  profitability_delta_pp?: number;
  revenue_growth_target_pct?: number;
  baseline_revenue?: number;
  proportional_baseline_revenue?: number;
  proportional_target_revenue?: number;
  actual_revenue?: number;
  actual_growth_pct?: number | null;
  growth_delta_pp?: number | null;
  notes?: string | null;
  target?: null; // present when no target is set for this FY
}

interface ReportData {
  owner: { id: string; name: string; person: { name: string } };
  period: { start: string; end: string; months: string[] };
  pods: PodResult[];
  bench: BenchResult;
  aggregate: {
    revenue: number;
    salary_costs: number;
    bench_salary_cost: number;
    total_salary_cost: number;
    direct_expenses: number;
    contracted_hours: number;
    allocated_capacity_hours: number;
    sold_capacity_pct: number | null;
    effective_rate: number | null;
    gross_profit: number;
    gross_margin_pct: number;
    total_billable_hours: number;
    total_working_hours: number;
    total_worked_hours: number;
    overall_utilization_pct: number;
    overall_billability_pct: number;
  };
  target?: TargetVsActual;
}

interface PodOwner {
  id: string;
  name: string;
  person: { id: string; name: string; employee_code: string };
}

export default function PodOwnerFinancialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as string | undefined;
  const canManageTargets = userRole === "owner" || userRole === "finance";
  const [owners, setOwners] = useState<PodOwner[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [benchExpanded, setBenchExpanded] = useState(false);

  // Sort state for the per-pod breakdown table. First click on a column sorts
  // it descending (high → low); clicking the same column toggles to ascending.
  type SortField =
    | "name" | "leader" | "member_count" | "revenue" | "salary_costs" | "direct_expenses"
    | "contracted_hours" | "sold_capacity_pct" | "effective_rate"
    | "gross_profit" | "gross_margin_pct" | "utilization_pct" | "billability_pct";
  const [sortField, setSortField] = useState<SortField>("salary_costs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const setSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedPods = report
    ? [...report.pods].sort((a, b) => {
        let av: string | number;
        let bv: string | number;
        if (sortField === "name") {
          av = a.pod.name.toLowerCase(); bv = b.pod.name.toLowerCase();
        } else if (sortField === "leader") {
          av = (a.pod.leader?.name || "").toLowerCase();
          bv = (b.pod.leader?.name || "").toLowerCase();
        } else {
          av = (a as any)[sortField] as number;
          bv = (b as any)[sortField] as number;
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      })
    : [];

  const sortArrow = (field: SortField) =>
    field === sortField ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  useEffect(() => {
    fetchOwners();

    const qOwnerId = searchParams.get("owner_id");
    const qStart = searchParams.get("start");
    const qEnd = searchParams.get("end");

    if (qStart) {
      setStartMonth(qStart);
    } else {
      // Default to the start of the current Indian fiscal year (April–March):
      // April of the current FY, so the report opens on FY-to-date.
      const now = new Date();
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      setStartMonth(`${fyStartYear}-04`);
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
            {/* Target vs Actual */}
            {report.target && report.target.profitability_target_pct !== undefined ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Target vs Actual</h2>
                  <span className="text-sm text-gray-500">
                    {report.target.fiscal_year_label} · {report.target.months_in_period} month
                    {report.target.months_in_period === 1 ? "" : "s"} in view
                  </span>
                </div>
                {report.target.rolled_up && (
                  <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                    No target is set on {report.owner.name} directly — rolled up from{" "}
                    {report.target.rollup_contributors?.join(", ")} (baselines summed, margin target
                    revenue-weighted).
                  </div>
                )}
                {report.target.spans_multiple_fy && (
                  <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    Period crosses fiscal-year boundary — comparison uses the target for FY{" "}
                    {report.target.fiscal_year}.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Profitability */}
                  <div className="p-4 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                      Profitability (gross margin)
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-bold text-gray-900">
                        {formatPercent(report.target.profitability_actual_pct!)}
                      </span>
                      <span className="text-sm text-gray-600">
                        Target {formatPercent(report.target.profitability_target_pct)}
                      </span>
                    </div>
                    <div
                      className={`text-sm mt-1 ${
                        report.target.profitability_delta_pp! >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {report.target.profitability_delta_pp! >= 0 ? "▲" : "▼"}{" "}
                      {Math.abs(report.target.profitability_delta_pp!).toFixed(1)} pp{" "}
                      {report.target.profitability_delta_pp! >= 0 ? "above" : "below"} target
                    </div>
                  </div>
                  {/* Revenue growth */}
                  <div className="p-4 rounded border border-gray-200">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                      Revenue growth vs prior year
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-bold text-gray-900">
                        {report.target.actual_growth_pct !== null && report.target.actual_growth_pct !== undefined
                          ? formatPercent(report.target.actual_growth_pct)
                          : "—"}
                      </span>
                      <span className="text-sm text-gray-600">
                        Target {formatPercent(report.target.revenue_growth_target_pct!)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Period revenue {formatCurrency(report.target.actual_revenue!)} vs proportional
                      baseline {formatCurrency(report.target.proportional_baseline_revenue!)} (annual{" "}
                      {formatCurrency(report.target.baseline_revenue!)} × {report.target.months_in_period}
                      /12)
                    </div>
                    {report.target.growth_delta_pp !== null && report.target.growth_delta_pp !== undefined && (
                      <div
                        className={`text-sm mt-1 ${
                          report.target.growth_delta_pp >= 0 ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {report.target.growth_delta_pp >= 0 ? "▲" : "▼"}{" "}
                        {Math.abs(report.target.growth_delta_pp).toFixed(1)} pp{" "}
                        {report.target.growth_delta_pp >= 0 ? "above" : "below"} target
                      </div>
                    )}
                  </div>
                </div>
                {report.target.notes && (
                  <div className="mt-3 text-xs text-gray-500">Notes: {report.target.notes}</div>
                )}
              </div>
            ) : canManageTargets ? (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-900">
                No target set for {report.owner.name} in FY{" "}
                {report.target?.fiscal_year ?? "(this period)"}. Set one in{" "}
                <a href="/settings/pod-owner-targets" className="underline">
                  Settings → Pod Owner Targets
                </a>{" "}
                to compare actuals against the budget.
              </div>
            ) : null}

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
                  {formatCurrency(report.aggregate.total_salary_cost)}
                </div>
                {report.aggregate.bench_salary_cost > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Pods {formatCurrency(report.aggregate.salary_costs)} + Bench {formatCurrency(report.aggregate.bench_salary_cost)}
                  </div>
                )}
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
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("name")} className="hover:text-blue-600">
                            Pod{sortArrow("name")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("leader")} className="hover:text-blue-600">
                            Leader{sortArrow("leader")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("member_count")} className="hover:text-blue-600">
                            Members{sortArrow("member_count")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("revenue")} className="hover:text-blue-600">
                            Revenue{sortArrow("revenue")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("salary_costs")} className="hover:text-blue-600">
                            Salary Costs{sortArrow("salary_costs")}
                          </button>
                        </th>
                        <th
                          className="px-4 py-3 text-right text-sm font-semibold text-gray-700"
                          title="Sum of BillLineItems tagged to projects in this pod, by Bill.cf_billed_for_month."
                        >
                          <button onClick={() => setSort("direct_expenses")} className="hover:text-blue-600">
                            Direct Exp.{sortArrow("direct_expenses")}
                          </button>
                        </th>
                        <th
                          className="px-4 py-3 text-right text-sm font-semibold text-gray-700"
                          title="Sum of contracted hours (ProjectHours) across this pod's projects for the selected period."
                        >
                          <button onClick={() => setSort("contracted_hours")} className="hover:text-blue-600">
                            Contracted Hrs{sortArrow("contracted_hours")}
                          </button>
                        </th>
                        <th
                          className="px-4 py-3 text-center text-sm font-semibold text-gray-700"
                          title="Contracted hours / allocation-scaled pod capacity. >100% means the pod is over-sold."
                        >
                          <button onClick={() => setSort("sold_capacity_pct")} className="hover:text-blue-600">
                            Sold Cap.{sortArrow("sold_capacity_pct")}
                          </button>
                        </th>
                        <th
                          className="px-4 py-3 text-right text-sm font-semibold text-gray-700"
                          title="Revenue / Contracted Hrs — what the client actually pays per hour bought."
                        >
                          <button onClick={() => setSort("effective_rate")} className="hover:text-blue-600">
                            Eff. Rate{sortArrow("effective_rate")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("gross_profit")} className="hover:text-blue-600">
                            Gross Profit{sortArrow("gross_profit")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("gross_margin_pct")} className="hover:text-blue-600">
                            Margin{sortArrow("gross_margin_pct")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("utilization_pct")} className="hover:text-blue-600">
                            Utilization{sortArrow("utilization_pct")}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                          <button onClick={() => setSort("billability_pct")} className="hover:text-blue-600">
                            Billability{sortArrow("billability_pct")}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sortedPods.map((pod) => (
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
                          <td className="px-4 py-3 text-right text-red-600">{formatCurrency(pod.direct_expenses || 0)}</td>
                          <td className="px-4 py-3 text-right">
                            {pod.contracted_hours > 0 ? pod.contracted_hours.toFixed(1) : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {pod.sold_capacity_pct === null || pod.sold_capacity_pct === undefined ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  pod.sold_capacity_pct >= 100
                                    ? "bg-red-100 text-red-800"
                                    : pod.sold_capacity_pct >= 70
                                      ? "bg-green-100 text-green-800"
                                      : pod.sold_capacity_pct >= 40
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {formatPercent(pod.sold_capacity_pct)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {pod.effective_rate
                              ? `₹${pod.effective_rate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/hr`
                              : "—"}
                          </td>
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
                      {/* Bench row — virtual pod for reportees not in any pod */}
                      {report.bench && (
                        <>
                          <tr
                            className={`bg-amber-50 hover:bg-amber-100 cursor-pointer border-t-2 border-amber-200 ${
                              report.bench.people_count === 0 ? "opacity-60" : ""
                            }`}
                            onClick={() => report.bench.people_count > 0 && setBenchExpanded(!benchExpanded)}
                            title={
                              report.bench.people_count > 0
                                ? "Click to see who's on bench"
                                : "No one on bench in this period"
                            }
                          >
                            <td className="px-4 py-3 font-medium" colSpan={2}>
                              <span className="inline-flex items-center gap-2">
                                <span className="text-amber-900">
                                  {report.bench.people_count > 0 ? (benchExpanded ? "▼" : "▶") : "○"}
                                </span>
                                <span>Bench — {report.owner.name}</span>
                                <span className="text-xs text-gray-500">(virtual)</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">{report.bench.people_count}</td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-right text-red-600">
                              {formatCurrency(report.bench.salary_cost)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-center text-gray-400">—</td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-right text-gray-400">—</td>
                            <td className="px-4 py-3 text-center text-gray-400">—</td>
                            <td className="px-4 py-3 text-center text-gray-400">—</td>
                            <td className="px-4 py-3 text-center text-gray-400">—</td>
                          </tr>
                          {benchExpanded && report.bench.people_count > 0 && (
                            <tr className="bg-amber-25">
                              <td colSpan={13} className="px-6 py-4 bg-amber-50/40">
                                <div className="text-xs text-gray-600 mb-2">
                                  These reportees had no pod allocation for part of the period. Cost shown
                                  on the row above is the sum across all unallocated person-days, prorated
                                  by daily allocation. Click a name to manage their pod assignment.
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-xs text-gray-600 border-b border-amber-200">
                                      <th className="py-2 pr-4 font-semibold">Name</th>
                                      <th className="py-2 pr-4 font-semibold">Department</th>
                                      <th className="py-2 pr-4 font-semibold">Role</th>
                                      <th className="py-2 pr-4 font-semibold">On bench since</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {report.bench.people.map((p) => (
                                      <tr key={p.person_id} className="border-b border-amber-100 last:border-0">
                                        <td className="py-2 pr-4">
                                          <button
                                            onClick={() => router.push(`/employees/${p.person_id}`)}
                                            className="text-blue-600 hover:underline"
                                          >
                                            {p.name}
                                          </button>
                                        </td>
                                        <td className="py-2 pr-4 text-gray-700">{p.department || "—"}</td>
                                        <td className="py-2 pr-4 text-gray-700">{p.role || "—"}</td>
                                        <td className="py-2 pr-4 text-gray-700 font-mono text-xs">{p.bench_since}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-4 py-3" colSpan={3}>Totals (incl. bench)</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatCurrency(report.aggregate.revenue)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatCurrency(report.aggregate.total_salary_cost)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatCurrency(report.aggregate.direct_expenses || 0)}</td>
                        <td className="px-4 py-3 text-right">
                          {report.aggregate.contracted_hours > 0
                            ? report.aggregate.contracted_hours.toFixed(1)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {report.aggregate.sold_capacity_pct === null
                            ? "—"
                            : formatPercent(report.aggregate.sold_capacity_pct)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {report.aggregate.effective_rate
                            ? `₹${report.aggregate.effective_rate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/hr`
                            : "—"}
                        </td>
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
