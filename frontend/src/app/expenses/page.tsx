"use client";

import { useState, useEffect } from "react";

interface Expense {
  id: string;
  zoho_expense_id: string | null;
  expense_date: string;
  amount: number;
  total: number;
  status: string;
  description: string | null;
  account_name: string | null;
  customer_name: string | null;
  include_in_calculation: boolean;
  exclusion_reason: string | null;
  tags: string[];
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "included" | "excluded">("all");
  const [dateRange, setDateRange] = useState<string>("this_fiscal_year");

  // Date range filter for display
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Additional filters
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sort direction for date
  const [dateSortDirection, setDateSortDirection] = useState<"desc" | "asc">("desc"); // desc = newest first

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const fetchExpenses = async () => {
    try {
      const response = await fetch("/api/expenses?limit=0"); // Fetch all records for client-side filtering
      if (!response.ok) {
        throw new Error("Failed to fetch expenses");
      }
      const data = await response.json();
      setExpenses(data.expenses || []);
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncExpenses = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/sync/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: dateRange }),
      });
      const data = await response.json();
      if (data.success) {
        alert(
          `Synced ${data.count} expenses successfully!\nCreated: ${data.created}, Updated: ${data.updated}`
        );
        fetchExpenses();
      } else {
        alert(`Failed to sync expenses: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      alert("Failed to sync expenses");
    } finally {
      setSyncing(false);
    }
  };

  const toggleExpense = async (id: string, currentValue: boolean) => {
    const newValue = !currentValue;

    try {
      await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          include_in_calculation: newValue,
          exclusion_reason: newValue ? null : "Manually excluded"
        }),
      });
      fetchExpenses();
    } catch (error) {
      alert("Failed to update expense");
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  // Get unique values for filters
  const accounts = Array.from(
    new Set(expenses.map((e) => e.account_name).filter(Boolean))
  ).sort();
  const customers = Array.from(
    new Set(expenses.map((e) => e.customer_name).filter(Boolean))
  ).sort();
  const months = Array.from(
    new Set(
      expenses.map((e) => {
        const date = new Date(e.expense_date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      })
    )
  ).sort().reverse(); // Most recent first
  const statuses = Array.from(new Set(expenses.map((e) => e.status))).sort();

  // First, apply all filters EXCEPT the include/exclude filter to get base filtered set
  const baseFilteredExpenses = expenses.filter((exp) => {
    // Filter by date range
    if (startDate && new Date(exp.expense_date) < new Date(startDate)) return false;
    if (endDate && new Date(exp.expense_date) > new Date(endDate)) return false;

    // Filter by account
    if (accountFilter !== "all" && exp.account_name !== accountFilter) return false;

    // Filter by customer
    if (customerFilter !== "all" && exp.customer_name !== customerFilter) return false;

    // Filter by month
    if (monthFilter !== "all") {
      const expDate = new Date(exp.expense_date);
      const expMonth = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
      if (expMonth !== monthFilter) return false;
    }

    // Filter by status
    if (statusFilter !== "all" && exp.status !== statusFilter) return false;

    return true;
  });

  // Calculate counts for filter buttons based on baseFiltered (excludes include/exclude filter)
  const allCount = baseFilteredExpenses.length;
  const includedCountForButton = baseFilteredExpenses.filter((e) => e.include_in_calculation).length;
  const excludedCountForButton = baseFilteredExpenses.filter((e) => !e.include_in_calculation).length;

  // Now apply the include/exclude filter on top of base filters
  const filteredExpenses = baseFilteredExpenses.filter((exp) => {
    // Filter by include/exclude
    if (filter === "included" && !exp.include_in_calculation) return false;
    if (filter === "excluded" && exp.include_in_calculation) return false;
    return true;
  }).sort((a, b) => {
    // Sort by date
    const dateA = new Date(a.expense_date).getTime();
    const dateB = new Date(b.expense_date).getTime();
    return dateSortDirection === "desc" ? dateB - dateA : dateA - dateB;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedExpenses = filteredExpenses.slice(startIndex, endIndex);

  // Calculate statistics from filtered expenses (matching the filter criteria)
  // Using 'amount' which excludes taxes, not 'total' which includes taxes
  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const totalWithTax = filteredExpenses.reduce((sum, exp) => sum + Number(exp.total), 0);
  const includedCount = filteredExpenses.filter((e) => e.include_in_calculation).length;
  const excludedCount = filteredExpenses.filter((e) => !e.include_in_calculation).length;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, startDate, endDate, accountFilter, customerFilter, monthFilter, statusFilter]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Expenses</h1>
        <div className="flex gap-3 items-center">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="last_month">Last Month</option>
            <option value="this_month">This Month</option>
            <option value="last_quarter">Last Quarter</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_fiscal_year">This Fiscal Year</option>
            <option value="last_fiscal_year">Last Fiscal Year</option>
            <option value="last_year">Last Year (365 days)</option>
            <option value="all">All Records</option>
          </select>
          <button
            onClick={syncExpenses}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {syncing ? "Syncing..." : "Sync from Zoho"}
          </button>
        </div>
      </div>

      {/* Auto-Exclusion Rules Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-blue-700 text-sm">
              ℹ️ Auto-exclusion rules are active. Click any expense to manually include/exclude it.
            </span>
          </div>
          <a
            href="/settings/exclusion-rules"
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 whitespace-nowrap transition-colors"
          >
            Manage Rules
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All ({allCount})
          </button>
          <button
            onClick={() => setFilter("included")}
            className={`px-4 py-2 rounded-lg ${
              filter === "included"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Included ({includedCountForButton})
          </button>
          <button
            onClick={() => setFilter("excluded")}
            className={`px-4 py-2 rounded-lg ${
              filter === "excluded"
                ? "bg-red-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Excluded ({excludedCountForButton})
          </button>
        </div>

        {/* Additional Filters */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Accounts</option>
            {accounts.map((account) => (
              <option key={account} value={account!}>
                {account}
              </option>
            ))}
          </select>

          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Customers</option>
            {customers.map((customer) => (
              <option key={customer} value={customer!}>
                {customer}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Months</option>
            {months.map((month) => {
              const [year, monthNum] = month.split("-");
              const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
              return (
                <option key={month} value={month}>
                  {monthName}
                </option>
              );
            })}
          </select>
        </div>

        {/* Date Range Filter */}
        <div className="flex gap-3 items-center flex-wrap">
          <label className="text-sm font-medium text-gray-700">Filter by Date:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Start Date"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="End Date"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Clear Dates
            </button>
          )}
          <span className="text-sm text-gray-500">
            Showing {filteredExpenses.length} of {expenses.length} expenses
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No expenses found. Click "Sync from Zoho" to import data.
          </div>
        ) : (
          <>
            {/* Pagination Controls */}
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Items per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <span className="text-sm text-gray-700">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredExpenses.length)} of {filteredExpenses.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => setDateSortDirection(prev => prev === "desc" ? "asc" : "desc")}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        <span className="text-xs">
                          {dateSortDirection === "desc" ? "↓" : "↑"}
                        </span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Account
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Include
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        {new Date(expense.expense_date).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {expense.description || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {expense.account_name || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {expense.customer_name || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        ₹{Number(expense.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100">
                          {expense.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            toggleExpense(expense.id, expense.include_in_calculation)
                          }
                          className={`px-3 py-1 rounded-lg text-xs font-medium ${
                            expense.include_in_calculation
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {expense.include_in_calculation ? "✓ Included" : "✗ Excluded"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr className="font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-sm text-right">
                      Totals ({filteredExpenses.length} expenses):
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      <div className="text-xs text-gray-600 font-normal">
                        (With Tax: ₹{totalWithTax.toLocaleString("en-IN", { maximumFractionDigits: 2 })})
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <div className="text-xs text-gray-600">
                        {includedCount} included / {excludedCount} excluded
                      </div>
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
