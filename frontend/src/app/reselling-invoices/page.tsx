"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ResellingInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  period_month: string;
  invoice_amount: number;
  total_oem_cost: number;
  resource_cost: number;
  other_expenses: number;
  total_cost: number;
  gross_profit: number;
  profit_margin_pct: number;
  project: {
    id: string;
    name: string;
    client: {
      id: string;
      name: string;
    };
  };
  product: {
    id: string;
    name: string;
    type: string;
  };
  bill_allocations: any[];
}

export default function ResellingInvoicesPage() {
  const [invoices, setInvoices] = useState<ResellingInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const fetchInvoices = async () => {
    try {
      const response = await fetch("/api/reselling-invoices");
      if (!response.ok) {
        throw new Error("Failed to fetch invoices");
      }
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Extract unique values for filters
  const months = Array.from(
    new Set(
      invoices.map((inv) => {
        const date = new Date(inv.period_month);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      })
    )
  ).sort().reverse();

  const products = Array.from(
    new Set(invoices.map((inv) => inv.product.name))
  ).sort();

  const projects = Array.from(
    new Set(invoices.map((inv) => inv.project.name))
  ).sort();

  const clients = Array.from(
    new Set(invoices.map((inv) => inv.project.client.name))
  ).sort();

  // Apply filters
  const filteredInvoices = invoices.filter((inv) => {
    if (monthFilter !== "all") {
      const invDate = new Date(inv.period_month);
      const invMonth = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
      if (invMonth !== monthFilter) return false;
    }
    if (productFilter !== "all" && inv.product.name !== productFilter) return false;
    if (projectFilter !== "all" && inv.project.name !== projectFilter) return false;
    if (clientFilter !== "all" && inv.project.client.name !== clientFilter) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

  // Calculate totals
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + Number(inv.invoice_amount), 0);
  const totalCosts = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_cost), 0);
  const totalProfit = filteredInvoices.reduce((sum, inv) => sum + Number(inv.gross_profit), 0);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [monthFilter, productFilter, projectFilter, clientFilter]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Reselling Invoices</h1>
        <Link
          href="/reselling-invoices/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Create Invoice
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
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

          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Products</option>
            {products.map((product) => (
              <option key={product} value={product}>
                {product}
              </option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Projects</option>
            {projects.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white text-sm"
          >
            <option value="all">All Clients</option>
            {clients.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-500 self-center">
            Showing {filteredInvoices.length} of {invoices.length} invoices
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
          <div className="text-2xl font-bold text-blue-600">
            ₹{totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Total Costs</div>
          <div className="text-2xl font-bold text-orange-600">
            ₹{totalCosts.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">Gross Profit</div>
          <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
            ₹{totalProfit.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No invoices found. Click "+ Create Invoice" to add one.
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
                </select>
                <span className="text-sm text-gray-700">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredInvoices.length)} of {filteredInvoices.length}
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
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Invoice #
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Client / Project
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Product
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Costs
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Profit
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Margin %
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">
                        {invoice.invoice_number || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(invoice.invoice_date).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium">{invoice.project.client.name}</div>
                        <div className="text-xs text-gray-600">{invoice.project.name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {invoice.product.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        ₹{Number(invoice.invoice_amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        ₹{Number(invoice.total_cost).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-medium ${
                        Number(invoice.gross_profit) >= 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        ₹{Number(invoice.gross_profit).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right ${
                        Number(invoice.profit_margin_pct) >= 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {Number(invoice.profit_margin_pct).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/reselling-invoices/${invoice.id}`}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr className="font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-sm text-right">
                      Totals ({filteredInvoices.length} invoices):
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      ₹{totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      ₹{totalCosts.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ₹{totalProfit.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0}%
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
