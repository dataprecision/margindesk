"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Job {
  id: string;
  filter_type: string;
  filter_value: string;
  status: "running" | "completed" | "failed" | "cancelled";
  total_bills: number;
  processed_bills: number;
  success_count: number;
  error_count: number;
  force_refetch: boolean;
  error_messages: string[];
  started_at: string;
  completed_at: string | null;
  progress_percentage: number;
}

export default function SyncBillDetailsPage() {
  const [filterType, setFilterType] = useState<"bill_date" | "billed_for_month">("bill_date");
  const [filterValue, setFilterValue] = useState("last_month");
  const [forceRefetch, setForceRefetch] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch recent jobs on mount
  useEffect(() => {
    fetchRecentJobs();
  }, []);

  // Poll active job status
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/sync/bill-details/${activeJobId}`);
        const data = await response.json();

        if (data.job) {
          // Update jobs list
          setJobs((prev) =>
            prev.map((j) => (j.id === activeJobId ? data.job : j))
          );

          // Stop polling if job is complete
          if (["completed", "failed", "cancelled"].includes(data.job.status)) {
            setActiveJobId(null);
            setIsSyncing(false);
          }
        }
      } catch (error) {
        console.error("Error polling job status:", error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [activeJobId]);

  const fetchRecentJobs = async () => {
    try {
      // For now, we'll just keep the jobs from the current session
      // In a full implementation, you'd fetch from an API endpoint
    } catch (error) {
      console.error("Error fetching recent jobs:", error);
    }
  };

  const handleStartSync = async () => {
    try {
      setError(null);
      setIsSyncing(true);

      const response = await fetch("/api/sync/bill-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter_type: filterType,
          filter_value: filterValue,
          force_refetch: forceRefetch,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start sync");
      }

      // Add job to list and start polling
      const newJob: Job = {
        id: data.job_id,
        filter_type: filterType,
        filter_value: filterValue,
        status: "running",
        total_bills: 0,
        processed_bills: 0,
        success_count: 0,
        error_count: 0,
        force_refetch: forceRefetch,
        error_messages: [],
        started_at: new Date().toISOString(),
        completed_at: null,
        progress_percentage: 0,
      };

      setJobs((prev) => [newJob, ...prev]);
      setActiveJobId(data.job_id);
    } catch (error: any) {
      console.error("Error starting sync:", error);
      setError(error.message);
      setIsSyncing(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/sync/bill-details/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel job");
      }

      // Update job status
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, status: "cancelled" as const, completed_at: new Date().toISOString() } : j
        )
      );

      if (activeJobId === jobId) {
        setActiveJobId(null);
        setIsSyncing(false);
      }
    } catch (error) {
      console.error("Error cancelling job:", error);
    }
  };

  const getStatusBadge = (status: Job["status"]) => {
    const badges = {
      running: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded ${badges[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Sync Bill Details</h1>
          <Link
            href="/bills"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            ← Back to Bills
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          Fetch detailed bill information (line items, financial data) from Zoho Books
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Sync Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Start New Sync</h2>

        <div className="space-y-4">
          {/* Filter Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter By
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="bill_date"
                  checked={filterType === "bill_date"}
                  onChange={(e) => setFilterType(e.target.value as "bill_date")}
                  className="mr-2"
                  disabled={isSyncing}
                />
                <span className="text-sm text-gray-700">Bill Date</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="billed_for_month"
                  checked={filterType === "billed_for_month"}
                  onChange={(e) => setFilterType(e.target.value as "billed_for_month")}
                  className="mr-2"
                  disabled={isSyncing}
                />
                <span className="text-sm text-gray-700">Billed For Month (Custom Field)</span>
              </label>
            </div>
          </div>

          {/* Period Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period
            </label>
            <select
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              disabled={isSyncing}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="last_quarter">Last Quarter</option>
              <option value="this_fiscal_year">This Fiscal Year</option>
              <option value="last_fiscal_year">Last Fiscal Year</option>
              <option value="last_year">Last Year</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Force Refetch */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={forceRefetch}
                onChange={(e) => setForceRefetch(e.target.checked)}
                disabled={isSyncing}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">
                Force refetch (sync bills that already have details)
              </span>
            </label>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartSync}
            disabled={isSyncing}
            className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSyncing ? "Syncing..." : "Start Sync"}
          </button>
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Sync Jobs</h2>
        </div>

        {jobs.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No sync jobs yet. Start a sync to see jobs here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filter
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Results
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Started
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(job.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {job.filter_type === "bill_date" ? "Bill Date" : "Billed For Month"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {job.filter_value}
                      {job.force_refetch && (
                        <span className="ml-2 text-xs text-orange-600">(forced)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            job.status === "completed"
                              ? "bg-green-600"
                              : job.status === "failed"
                              ? "bg-red-600"
                              : "bg-blue-600"
                          }`}
                          style={{ width: `${job.progress_percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {job.processed_bills} / {job.total_bills} bills ({job.progress_percentage}%)
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="text-green-600">✓ {job.success_count}</div>
                      {job.error_count > 0 && (
                        <div className="text-red-600">✗ {job.error_count}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(job.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {job.status === "running" && (
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
