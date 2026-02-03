"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Person {
  id: string;
  name: string;
  email: string;
}

interface Client {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  client: Client;
}

interface TimesheetEntry {
  person: Person;
  project: Project;
  period_month?: Date;
  month_label?: string;
  work_date?: Date;
  hours_logged: number;
  hours_billable: number;
  hours_nonbillable: number;
  days_worked?: number;
  task_count?: number;
  tasks?: Array<{
    task_name: string | null;
    task_type: string | null;
    hours_logged: number;
    hours_billable: number;
    notes: string | null;
  }>;
}

interface Totals {
  hours_logged: number;
  hours_billable: number;
  hours_nonbillable: number;
}

export default function TimesheetsPage() {
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals>({
    hours_logged: 0,
    hours_billable: 0,
    hours_nonbillable: 0,
  });

  // Filters
  const [period, setPeriod] = useState<string>("this_month");
  const [personId, setPersonId] = useState<string>("all");
  const [projectId, setProjectId] = useState<string>("all");
  const [aggregate, setAggregate] = useState<"monthly" | "daily" | "none">("monthly");

  // Expanded rows for task details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRowExpansion = (key: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedRows(newExpanded);
  };

  // Fetch people and projects for filters
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [peopleRes, projectsRes] = await Promise.all([
          fetch("/api/people"),
          fetch("/api/projects"),
        ]);

        if (peopleRes.ok) {
          const peopleData = await peopleRes.json();
          setPeople(peopleData.people || peopleData || []);
        }

        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          // Handle both array and object response formats
          setProjects(Array.isArray(projectsData) ? projectsData : (projectsData.projects || []));
        }
      } catch (error) {
        console.error("Failed to fetch filters:", error);
      }
    };

    fetchFilters();
  }, []);

  // Fetch timesheet entries
  useEffect(() => {
    fetchTimesheets();
  }, [period, personId, projectId, aggregate]);

  const fetchTimesheets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        person_id: personId,
        project_id: projectId,
        aggregate,
      });

      const response = await fetch(`/api/timesheets?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch timesheets");
      }

      const data = await response.json();
      setEntries(data.entries || []);
      setTotals(data.totals || { hours_logged: 0, hours_billable: 0, hours_nonbillable: 0 });
    } catch (error) {
      console.error("Failed to fetch timesheets:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | Date | undefined) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatHours = (hours: number) => {
    return hours.toFixed(2);
  };

  const getRowKey = (entry: TimesheetEntry, index: number) => {
    if (aggregate === "monthly") {
      return `${entry.person.id}-${entry.project.id}-${entry.month_label}`;
    } else if (aggregate === "daily") {
      return `${entry.person.id}-${entry.project.id}-${entry.work_date}`;
    }
    return `entry-${index}`;
  };

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <Link
            href="/import/timesheet"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Import Timesheet
          </Link>
        </div>
        <p className="text-sm text-gray-600">
          View and analyze timesheet entries by period, employee, or project
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Period Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
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

          {/* Person Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Employee
            </label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Employees</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.client.name})
                </option>
              ))}
            </select>
          </div>

          {/* Aggregation Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              View
            </label>
            <select
              value={aggregate}
              onChange={(e) => setAggregate(e.target.value as "monthly" | "daily" | "none")}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="monthly">Monthly Summary</option>
              <option value="daily">Daily Summary</option>
              <option value="none">Raw Entries</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-sm font-medium text-gray-600">Total Hours</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {formatHours(totals.hours_logged)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-sm font-medium text-gray-600">Billable Hours</p>
          <p className="text-2xl font-bold text-green-600 mt-2">
            {formatHours(totals.hours_billable)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-sm font-medium text-gray-600">Non-Billable Hours</p>
          <p className="text-2xl font-bold text-orange-600 mt-2">
            {formatHours(totals.hours_nonbillable)}
          </p>
        </div>
      </div>

      {/* Timesheets Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Timesheet Entries ({entries.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading timesheets...</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No timesheet entries found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {aggregate === "monthly" ? "Month" : aggregate === "daily" ? "Date" : "Date"}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Hours
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Billable
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Non-Billable
                  </th>
                  {aggregate !== "none" && (
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map((entry, index) => {
                  const rowKey = getRowKey(entry, index);
                  const isExpanded = expandedRows.has(rowKey);

                  return (
                    <>
                      <tr key={rowKey} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {aggregate === "monthly"
                            ? entry.month_label
                            : aggregate === "daily"
                            ? formatDate(entry.work_date)
                            : formatDate(entry.work_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.person.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.project.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.project.client.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {formatHours(entry.hours_logged)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                          {formatHours(entry.hours_billable)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 text-right">
                          {formatHours(entry.hours_nonbillable)}
                        </td>
                        {aggregate !== "none" && entry.tasks && entry.tasks.length > 0 && (
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                            <button
                              onClick={() => toggleRowExpansion(rowKey)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              {isExpanded ? "Hide" : "Show"} ({entry.task_count} tasks)
                            </button>
                          </td>
                        )}
                        {aggregate !== "none" && (!entry.tasks || entry.tasks.length === 0) && (
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-400">
                            -
                          </td>
                        )}
                      </tr>

                      {/* Expanded Task Details */}
                      {isExpanded && entry.tasks && entry.tasks.length > 0 && (
                        <tr key={`${rowKey}-details`}>
                          <td colSpan={8} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm text-gray-700">Task Details:</h4>
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left py-1">Task</th>
                                    <th className="text-left py-1">Type</th>
                                    <th className="text-right py-1">Hours</th>
                                    <th className="text-right py-1">Billable</th>
                                    <th className="text-left py-1">Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.tasks.map((task, taskIndex) => (
                                    <tr key={taskIndex} className="border-t border-gray-200">
                                      <td className="py-1 text-gray-900">
                                        {task.task_name || "-"}
                                      </td>
                                      <td className="py-1 text-gray-600">
                                        {task.task_type || "-"}
                                      </td>
                                      <td className="py-1 text-right text-gray-900">
                                        {formatHours(task.hours_logged)}
                                      </td>
                                      <td className="py-1 text-right text-green-600">
                                        {formatHours(task.hours_billable)}
                                      </td>
                                      <td className="py-1 text-gray-600">
                                        {task.notes || "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
