"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  billable: boolean;
  ctc_monthly: number;
  utilization_target: number;
  start_date: string;
  end_date: string | null;
  zoho_employee_id: string | null;
  microsoft_user_id: string | null;
  manager_id: string | null;
  manager?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface ManagerHistoryRecord {
  id: string;
  start_date: string;
  end_date: string | null;
  manager: {
    id: string;
    name: string;
    email: string;
  };
}

export default function EmployeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [syncingLeaves, setSyncingLeaves] = useState(false);
  const [leavesSyncResult, setLeavesSyncResult] = useState<any>(null);
  const [syncingHolidays, setSyncingHolidays] = useState(false);
  const [holidaysSyncResult, setHolidaysSyncResult] = useState<any>(null);
  const [syncingManagers, setSyncingManagers] = useState(false);
  const [managerSyncResult, setManagerSyncResult] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterBillable, setFilterBillable] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterStatus, setFilterStatus] = useState("active"); // Default to active employees
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [managerHistory, setManagerHistory] = useState<ManagerHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newManagerId, setNewManagerId] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Fetch employees
  useEffect(() => {
    if (status === "authenticated") {
      fetchEmployees();
    }
  }, [status]);

  const fetchEmployees = async () => {
    try {
      const response = await fetch("/api/people");
      if (response.ok) {
        const data = await response.json();
        setEmployees(data.people);
      } else {
        setError("Failed to fetch employees");
      }
    } catch (err) {
      setError("Error fetching employees");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromZoho = async () => {
    setSyncing(true);
    setError("");
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync/zoho-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncType: "employees" }),
      });

      if (response.ok) {
        const result = await response.json();
        setSyncResult(result.syncLog);
        // Refresh the employees list
        await fetchEmployees();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to sync from Zoho People");
      }
    } catch (err) {
      setError("Error syncing from Zoho People");
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncLeaves = async () => {
    setSyncingLeaves(true);
    setError("");
    setLeavesSyncResult(null);

    try {
      const response = await fetch("/api/sync/zoho-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncType: "leaves" }),
      });

      if (response.ok) {
        const result = await response.json();
        setLeavesSyncResult(result.syncLog);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to sync leaves from Zoho People");
      }
    } catch (err) {
      setError("Error syncing leaves from Zoho People");
    } finally {
      setSyncingLeaves(false);
    }
  };

  const handleSyncHolidays = async () => {
    setSyncingHolidays(true);
    setError("");
    setHolidaysSyncResult(null);

    try {
      const response = await fetch("/api/sync/zoho-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncType: "holidays" }),
      });

      if (response.ok) {
        const result = await response.json();
        setHolidaysSyncResult(result.syncLog);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to sync holidays from Zoho People");
      }
    } catch (err) {
      setError("Error syncing holidays from Zoho People");
    } finally {
      setSyncingHolidays(false);
    }
  };

  const fetchManagerHistory = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setLoadingHistory(true);
    setManagerHistory([]);

    try {
      const response = await fetch(`/api/people/${employee.id}/manager-history`);
      if (response.ok) {
        const data = await response.json();
        setManagerHistory(data.managerHistory);
      } else {
        setError("Failed to fetch manager history");
      }
    } catch (err) {
      setError("Error fetching manager history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const closeHistoryModal = () => {
    setSelectedEmployee(null);
    setManagerHistory([]);
    setEditingRecord(null);
    setEditStartDate("");
    setEditEndDate("");
    setShowAddForm(false);
    setNewManagerId("");
    setNewStartDate("");
    setNewEndDate("");
  };

  const startEditing = (record: ManagerHistoryRecord) => {
    setEditingRecord(record.id);
    setEditStartDate(new Date(record.start_date).toISOString().split('T')[0]);
    setEditEndDate(record.end_date ? new Date(record.end_date).toISOString().split('T')[0] : "");
  };

  const cancelEditing = () => {
    setEditingRecord(null);
    setEditStartDate("");
    setEditEndDate("");
  };

  const saveManagerHistory = async (recordId: string) => {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/manager-history/${recordId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_date: editStartDate,
          end_date: editEndDate || null,
        }),
      });

      if (response.ok) {
        // Refresh manager history
        if (selectedEmployee) {
          await fetchManagerHistory(selectedEmployee);
        }
        cancelEditing();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update manager history");
      }
    } catch (err) {
      setError("Error updating manager history");
    } finally {
      setSaving(false);
    }
  };

  const deleteManagerHistory = async (recordId: string) => {
    if (!confirm("Are you sure you want to delete this manager history record?")) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/manager-history/${recordId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Refresh manager history
        if (selectedEmployee) {
          await fetchManagerHistory(selectedEmployee);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to delete manager history");
      }
    } catch (err) {
      setError("Error deleting manager history");
    } finally {
      setSaving(false);
    }
  };

  const addManagerHistory = async () => {
    if (!selectedEmployee || !newManagerId || !newStartDate) {
      setError("Manager and start date are required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/people/${selectedEmployee.id}/manager-history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          manager_id: newManagerId,
          start_date: newStartDate,
          end_date: newEndDate || null,
        }),
      });

      if (response.ok) {
        // Refresh manager history
        await fetchManagerHistory(selectedEmployee);
        // Reset form
        setShowAddForm(false);
        setNewManagerId("");
        setNewStartDate("");
        setNewEndDate("");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to add manager history");
      }
    } catch (err) {
      setError("Error adding manager history");
    } finally {
      setSaving(false);
    }
  };

  // Filter employees based on search and filters
  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.role.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBillable =
      filterBillable === "" ||
      (filterBillable === "true" && employee.billable) ||
      (filterBillable === "false" && !employee.billable);

    const matchesDepartment =
      filterDepartment === "" ||
      employee.department === filterDepartment;

    const matchesStatus =
      filterStatus === "" ||
      (filterStatus === "active" && !employee.end_date) ||
      (filterStatus === "exited" && employee.end_date);

    return matchesSearch && matchesBillable && matchesDepartment && matchesStatus;
  });

  // Get unique departments for filter
  const departments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean))
  );

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Employees</h1>
            <p className="text-gray-600 mt-1">
              Manage your team members and sync from Zoho People
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {(session?.user?.role === "owner" ||
              session?.user?.role === "finance") && (
              <>
                <button
                  onClick={handleSyncFromZoho}
                  disabled={syncing}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {syncing ? "Syncing..." : "Sync Employees"}
                </button>
                <button
                  onClick={handleSyncLeaves}
                  disabled={syncingLeaves}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {syncingLeaves ? "Syncing..." : "Sync Leaves"}
                </button>
                <button
                  onClick={handleSyncHolidays}
                  disabled={syncingHolidays}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {syncingHolidays ? "Syncing..." : "Sync Holidays"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Sync Results */}
        {syncResult && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            <p className="font-medium">Employee sync completed successfully!</p>
            <div className="mt-2 text-sm">
              <p>
                Processed: {syncResult.processed} | Synced: {syncResult.synced}{" "}
                | Created: {syncResult.created} | Updated: {syncResult.updated}
              </p>
              {syncResult.errors > 0 && (
                <p className="text-red-600 mt-1">
                  Errors: {syncResult.errors}
                </p>
              )}
            </div>
          </div>
        )}

        {leavesSyncResult && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            <p className="font-medium">Leaves sync completed successfully!</p>
            <div className="mt-2 text-sm">
              <p>
                Processed: {leavesSyncResult.processed} | Synced: {leavesSyncResult.synced}{" "}
                | Created: {leavesSyncResult.created} | Updated: {leavesSyncResult.updated}
              </p>
              {leavesSyncResult.errors > 0 && (
                <p className="text-red-600 mt-1">
                  Errors: {leavesSyncResult.errors}
                </p>
              )}
            </div>
          </div>
        )}

        {holidaysSyncResult && (
          <div className="mb-6 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            <p className="font-medium">Holidays sync completed successfully!</p>
            <div className="mt-2 text-sm">
              <p>
                Processed: {holidaysSyncResult.processed} | Synced: {holidaysSyncResult.synced}{" "}
                | Created: {holidaysSyncResult.created} | Updated: {holidaysSyncResult.updated}
              </p>
              {holidaysSyncResult.errors > 0 && (
                <p className="text-red-600 mt-1">
                  Errors: {holidaysSyncResult.errors}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or role..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="exited">Exited</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billable Status
              </label>
              <select
                value={filterBillable}
                onChange={(e) => setFilterBillable(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All</option>
                <option value="true">Billable</option>
                <option value="false">Non-Billable</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept as string}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Employees Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Billable
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Zoho ID
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    {searchTerm || filterBillable || filterDepartment || filterStatus
                      ? "No employees match your filters"
                      : "No employees found. Sync from Zoho People to get started."}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/employees/${employee.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        {employee.name}
                      </Link>
                      <div className="text-xs text-gray-500">
                        Start: {new Date(employee.start_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.role}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.department || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {(employee as any).currentUtilization ? (
                        <div>
                          <div className={`font-semibold ${
                            (employee as any).currentUtilization.utilizationPct > 100 ? 'text-red-600' :
                            (employee as any).currentUtilization.utilizationPct >= 70 ? 'text-green-600' :
                            'text-yellow-600'
                          }`}>
                            {(employee as any).currentUtilization.utilizationPct.toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-500">
                            {(employee as any).currentUtilization.workedHours.toFixed(0)}/{(employee as any).currentUtilization.workingHours.toFixed(0)}h
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">No data</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {employee.manager ? (
                            <>
                              <div className="font-medium">{employee.manager.name}</div>
                              <div className="text-xs text-gray-500">{employee.manager.email}</div>
                            </>
                          ) : (
                            <span className="text-gray-400">No current manager</span>
                          )}
                        </div>
                        <button
                          onClick={() => fetchManagerHistory(employee)}
                          className="ml-2 text-blue-600 hover:text-blue-800 text-xs underline whitespace-nowrap"
                          title="View manager history"
                        >
                          History
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          employee.billable
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {employee.billable ? "Billable" : "Non-Billable"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {employee.end_date ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Exited
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employee.zoho_employee_id || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 text-sm text-gray-600">
          Showing {filteredEmployees.length} of {employees.length} employees
        </div>

        {/* Manager History Modal */}
        {selectedEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Manager History
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedEmployee.name} ({selectedEmployee.email})
                    </p>
                  </div>
                  <button
                    onClick={closeHistoryModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 overflow-y-auto flex-1">
                {/* Add New Record Button and Form */}
                {(session?.user?.role === "owner" ||
                  session?.user?.role === "finance") && (
                  <div className="mb-4">
                    {!showAddForm ? (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                      >
                        + Add New Manager Record
                      </button>
                    ) : (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-3">
                          Add New Manager Record
                        </h3>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Select Manager
                            </label>
                            <select
                              value={newManagerId}
                              onChange={(e) => setNewManagerId(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            >
                              <option value="">-- Select a manager --</option>
                              {employees
                                .filter((emp) => emp.id !== selectedEmployee?.id)
                                .map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name} ({emp.email})
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Start Date
                            </label>
                            <input
                              type="date"
                              value={newStartDate}
                              onChange={(e) => setNewStartDate(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              End Date (leave empty for current)
                            </label>
                            <input
                              type="date"
                              value={newEndDate}
                              onChange={(e) => setNewEndDate(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={addManagerHistory}
                              disabled={saving}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                            >
                              {saving ? "Adding..." : "Add Record"}
                            </button>
                            <button
                              onClick={() => {
                                setShowAddForm(false);
                                setNewManagerId("");
                                setNewStartDate("");
                                setNewEndDate("");
                              }}
                              disabled={saving}
                              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {loadingHistory ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading manager history...
                  </div>
                ) : managerHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No manager history found.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {managerHistory.map((record, index) => (
                      <div
                        key={record.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {record.manager.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {record.manager.email}
                            </div>
                          </div>
                          {index === 0 && !record.end_date && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Current
                            </span>
                          )}
                        </div>

                        {editingRecord === record.id ? (
                          // Edit mode
                          <div className="mt-3 space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Start Date
                              </label>
                              <input
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                End Date (leave empty for current)
                              </label>
                              <input
                                type="date"
                                value={editEndDate}
                                onChange={(e) => setEditEndDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveManagerHistory(record.id)}
                                disabled={saving}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                              >
                                {saving ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={cancelEditing}
                                disabled={saving}
                                className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <>
                            <div className="mt-2 text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">From:</span>
                                <span>
                                  {new Date(record.start_date).toLocaleDateString()}
                                </span>
                              </div>
                              {record.end_date && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-medium">To:</span>
                                  <span>
                                    {new Date(record.end_date).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                              {!record.end_date && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-medium">To:</span>
                                  <span className="text-green-600">Present</span>
                                </div>
                              )}
                            </div>
                            {(session?.user?.role === "owner" ||
                              session?.user?.role === "finance") && (
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => startEditing(record)}
                                  className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                                >
                                  Edit Dates
                                </button>
                                <button
                                  onClick={() => deleteManagerHistory(record.id)}
                                  disabled={saving}
                                  className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={closeHistoryModal}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
