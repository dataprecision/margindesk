"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";

interface Person {
  id: string;
  name: string;
  email: string;
  employee_code: string | null;
  department: string | null;
  role: string;
}

interface Salary {
  id: string;
  person_id: string;
  month: string;
  base_salary: number;
  bonus: number;
  overtime: number;
  deductions: number;
  total: number;
  is_support_staff: boolean;
  notes: string | null;
  person: Person;
}

interface Stats {
  month: string;
  total_count: number;
  support_staff_count: number;
  operational_staff_count: number;
  total_salary: number;
  support_salary: number;
  operational_salary: number;
}

export default function SalariesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [selectedMonth, setSelectedMonth] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [supportStaffFilter, setSupportStaffFilter] = useState<"all" | "true" | "false">("all");
  const [sortField, setSortField] = useState<"name" | "department" | "total">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Set default month to current month
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${year}-${month}`);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Fetch salaries when month changes
  useEffect(() => {
    if (status === "authenticated" && selectedMonth) {
      fetchSalaries();
    }
  }, [status, selectedMonth, supportStaffFilter, departmentFilter]);

  const fetchSalaries = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        month: selectedMonth,
      });

      if (supportStaffFilter !== "all") {
        params.append("support_staff", supportStaffFilter);
      }

      if (departmentFilter) {
        params.append("department", departmentFilter);
      }

      const response = await fetch(`/api/salaries?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setSalaries(data.salaries);
        setStats(data.stats);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to fetch salaries");
      }
    } catch (err) {
      setError("Error fetching salaries");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSupportStaff = async (salaryId: string, currentValue: boolean) => {
    if (session?.user?.role !== "owner" && session?.user?.role !== "finance") {
      alert("Only owners and finance can update support staff designation");
      return;
    }

    try {
      const response = await fetch(`/api/salaries/${salaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_support_staff: !currentValue }),
      });

      if (response.ok) {
        // Refresh salaries
        fetchSalaries();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to update");
      }
    } catch (err) {
      alert("Error updating support staff designation");
      console.error(err);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Employee Code",
      "Name",
      "Department",
      "Role",
      "Base Salary",
      "Bonus",
      "Overtime",
      "Deductions",
      "Total",
      "Support Staff",
    ];

    const rows = filteredAndSortedSalaries.map((s) => [
      s.person.employee_code || "",
      s.person.name,
      s.person.department || "",
      s.person.role,
      s.base_salary,
      s.bonus,
      s.overtime,
      s.deductions,
      s.total,
      s.is_support_staff ? "Yes" : "No",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salaries-${selectedMonth}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Apply client-side search and sorting
  const filteredAndSortedSalaries = salaries
    .filter((s) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          s.person.name.toLowerCase().includes(term) ||
          s.person.employee_code?.toLowerCase().includes(term)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let aValue, bValue;

      if (sortField === "name") {
        aValue = a.person.name;
        bValue = b.person.name;
      } else if (sortField === "department") {
        aValue = a.person.department || "";
        bValue = b.person.department || "";
      } else {
        aValue = Number(a.total);
        bValue = Number(b.total);
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedSalaries.length / itemsPerPage);
  const paginatedSalaries = filteredAndSortedSalaries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get unique departments
  const departments = Array.from(
    new Set(salaries.map((s) => s.person.department).filter(Boolean))
  ).sort();

  const canEditSupportStaff = session?.user?.role === "owner" || session?.user?.role === "finance";

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Monthly Salaries</h1>
          <p className="text-sm text-gray-600">
            View and manage employee salaries by month
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Month Selector & Filters */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Month Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Month
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Name or Code..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <select
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Support Staff Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Staff Type
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSupportStaffFilter("all");
                    setCurrentPage(1);
                  }}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                    supportStaffFilter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All ({stats?.total_count || 0})
                </button>
                <button
                  onClick={() => {
                    setSupportStaffFilter("true");
                    setCurrentPage(1);
                  }}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                    supportStaffFilter === "true"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Support ({stats?.support_staff_count || 0})
                </button>
                <button
                  onClick={() => {
                    setSupportStaffFilter("false");
                    setCurrentPage(1);
                  }}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md ${
                    supportStaffFilter === "false"
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Operational ({stats?.operational_staff_count || 0})
                </button>
              </div>
            </div>

            {/* Export Button */}
            <div className="flex items-end">
              <button
                onClick={exportToCSV}
                className="w-full px-4 py-2 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white shadow rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_count}</p>
            </div>
            <div className="bg-green-50 shadow rounded-lg p-4">
              <p className="text-sm text-green-600">Support Staff</p>
              <p className="text-2xl font-bold text-green-900">
                {stats.support_staff_count}
                <span className="text-sm text-green-600 ml-2">
                  ({stats.total_count > 0
                    ? ((stats.support_staff_count / stats.total_count) * 100).toFixed(1)
                    : 0}%)
                </span>
              </p>
            </div>
            <div className="bg-purple-50 shadow rounded-lg p-4">
              <p className="text-sm text-purple-600">Operational Staff</p>
              <p className="text-2xl font-bold text-purple-900">
                {stats.operational_staff_count}
                <span className="text-sm text-purple-600 ml-2">
                  ({stats.total_count > 0
                    ? ((stats.operational_staff_count / stats.total_count) * 100).toFixed(1)
                    : 0}%)
                </span>
              </p>
            </div>
            <div className="bg-blue-50 shadow rounded-lg p-4">
              <p className="text-sm text-blue-600">Total Salary Cost</p>
              <p className="text-2xl font-bold text-blue-900">
                ₹{stats.total_salary.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        )}

        {/* Salary Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => {
                      if (sortField === "name") {
                        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                      } else {
                        setSortField("name");
                        setSortDirection("asc");
                      }
                    }}
                  >
                    Employee {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => {
                      if (sortField === "department") {
                        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                      } else {
                        setSortField("department");
                        setSortDirection("asc");
                      }
                    }}
                  >
                    Department {sortField === "department" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Base
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bonus
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overtime
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deductions
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => {
                      if (sortField === "total") {
                        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                      } else {
                        setSortField("total");
                        setSortDirection("desc");
                      }
                    }}
                  >
                    Total {sortField === "total" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Staff Type
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedSalaries.map((salary) => (
                  <tr key={salary.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {salary.person.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {salary.person.employee_code || "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {salary.person.department || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {salary.person.role}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ₹{Number(salary.base_salary).toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ₹{Number(salary.bonus).toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ₹{Number(salary.overtime).toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ₹{Number(salary.deductions).toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      ₹{Number(salary.total).toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => toggleSupportStaff(salary.id, salary.is_support_staff)}
                        disabled={!canEditSupportStaff}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          salary.is_support_staff
                            ? "bg-green-100 text-green-800"
                            : "bg-purple-100 text-purple-800"
                        } ${canEditSupportStaff ? "cursor-pointer hover:opacity-75" : "cursor-not-allowed"}`}
                        title={canEditSupportStaff ? "Click to toggle" : "Owner/Finance only"}
                      >
                        {salary.is_support_staff ? "Support" : "Operational"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Table Footer with Totals */}
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-sm font-medium text-gray-900">
                    Showing {paginatedSalaries.length} of {filteredAndSortedSalaries.length} employees
                  </td>
                  <td colSpan={4} className="px-6 py-4 text-sm text-right text-gray-600">
                    Support Staff Total:
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-green-900">
                    ₹{stats?.support_salary.toLocaleString("en-IN")}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-6 py-3 text-sm text-right text-gray-600">
                    Operational Staff Total:
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-bold text-purple-900">
                    ₹{stats?.operational_salary.toLocaleString("en-IN")}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                    Grand Total:
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-blue-900 text-lg">
                    ₹{stats?.total_salary.toLocaleString("en-IN")}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-700">
                    Page <span className="font-medium">{currentPage}</span> of{" "}
                    <span className="font-medium">{totalPages}</span>
                  </p>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={200}>200 per page</option>
                  </select>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* No Results */}
        {!loading && filteredAndSortedSalaries.length === 0 && (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <p className="text-gray-600">
              No salary records found for {selectedMonth}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
