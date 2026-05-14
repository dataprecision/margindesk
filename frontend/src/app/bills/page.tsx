"use client";

import { useState, useEffect, useRef, useMemo } from "react";

interface ProjectComboboxProps {
  value: string | null;
  projects: ProjectOption[];
  // Currently-tagged project even if no longer in `projects` list (e.g. completed)
  currentProject?: { id: string; name: string } | null;
  disabled?: boolean;
  onChange: (projectId: string | null) => void;
}

/** Searchable single-select. Click to open, type to filter (matches client OR project name), arrow keys to navigate, Enter to pick, Esc to close. */
function ProjectCombobox({
  value,
  projects,
  currentProject,
  disabled,
  onChange,
}: ProjectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the full option list, prepending currentProject if it's tagged but missing from active list
  const options = useMemo(() => {
    const list = projects.map((p) => ({
      id: p.id,
      label: p.client?.name ? `${p.client.name} — ${p.name}` : p.name,
      stale: false,
    }));
    if (currentProject && !projects.find((p) => p.id === currentProject.id)) {
      list.unshift({
        id: currentProject.id,
        label: `${currentProject.name} (current)`,
        stale: true,
      });
    }
    return list;
  }, [projects, currentProject]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const selected = options.find((o) => o.id === value);
  const buttonLabel = selected ? selected.label : "— Untagged —";

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length, i + 1)); // filtered.length = "Untagged" row index
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx === filtered.length) {
        pick(null); // "Untagged" row
      } else if (filtered[activeIdx]) {
        pick(filtered[activeIdx].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={wrapperRef} className="relative inline-block w-[200px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full text-left text-xs px-2 py-1 border border-gray-300 rounded bg-white truncate ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400"
        }`}
        title={buttonLabel}
      >
        {buttonLabel}
        <span className="float-right text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-[280px] bg-white border border-gray-300 rounded shadow-lg">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search client or project…"
            className="w-full text-xs px-2 py-1.5 border-b border-gray-200 focus:outline-none"
          />
          <ul className="max-h-60 overflow-y-auto text-xs">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-gray-500 italic">No matches</li>
            ) : (
              filtered.map((o, idx) => (
                <li
                  key={o.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.id);
                  }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`px-2 py-1.5 cursor-pointer truncate ${
                    idx === activeIdx ? "bg-blue-50 text-blue-900" : "hover:bg-gray-50"
                  } ${o.stale ? "italic text-gray-600" : ""} ${
                    o.id === value ? "font-semibold" : ""
                  }`}
                  title={o.label}
                >
                  {o.label}
                </li>
              ))
            )}
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                pick(null);
              }}
              onMouseEnter={() => setActiveIdx(filtered.length)}
              className={`px-2 py-1.5 cursor-pointer border-t border-gray-100 text-gray-500 ${
                activeIdx === filtered.length ? "bg-blue-50 text-blue-900" : "hover:bg-gray-50"
              } ${value === null ? "font-semibold" : ""}`}
            >
              — Untagged —
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

interface BillLineItem {
  id: string;
  item_name: string;
  description: string | null;
  quantity: number;
  rate: number;
  item_total: number;
  tax_amount: number;
  tax_percentage: number;
  customer_name: string | null;
  account_name: string | null;
  project_id: string | null;
  project?: { id: string; name: string; status: string } | null;
}

interface ProjectOption {
  id: string;
  name: string;
  client: { name: string };
  status: string;
}

interface Bill {
  id: string;
  zoho_bill_id: string | null;
  vendor_name: string;
  bill_number: string;
  bill_date: string;
  total: number;
  balance: number;
  status: string;
  cf_expense_category: string | null;
  cf_billed_for_month: string | null;
  include_in_calculation: boolean;
  exclusion_reason: string | null;
  tags: string[];
  sub_total: number | null;
  tax_total: number | null;
  exchange_rate: number | null;
  tds_total: number | null;
  details_sync_status: "pending" | "syncing" | "synced" | "error";
  line_items?: BillLineItem[];
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "included" | "excluded">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("this_fiscal_year");

  // Date range filter for display
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Additional filter for billed month
  const [billedMonthFilter, setBilledMonthFilter] = useState<string>("all");

  // Vendor search filter
  const [vendorSearch, setVendorSearch] = useState<string>("");

  // Date sort direction
  const [dateSortDirection, setDateSortDirection] = useState<"desc" | "asc">("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Expanded rows for line items
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Track which bills are currently syncing details
  const [syncingDetails, setSyncingDetails] = useState<Set<string>>(new Set());

  // Projects for the line-item project dropdown
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  // Track in-flight project-tag saves keyed by line_item_id
  const [taggingLineItems, setTaggingLineItems] = useState<Set<string>>(new Set());

  const tagLineItemProject = async (lineItemId: string, projectId: string | null) => {
    setTaggingLineItems((s) => new Set(s).add(lineItemId));
    try {
      const res = await fetch(`/api/bills/line-items/${lineItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed to tag line item");
        return;
      }
      const updated = await res.json();
      setBills((prev) =>
        prev.map((b) => ({
          ...b,
          line_items: b.line_items?.map((li) =>
            li.id === lineItemId
              ? { ...li, project_id: updated.line_item.project_id, project: updated.line_item.project }
              : li
          ),
        }))
      );
    } catch (e: any) {
      alert(e.message || "Failed to tag line item");
    } finally {
      setTaggingLineItems((s) => {
        const next = new Set(s);
        next.delete(lineItemId);
        return next;
      });
    }
  };

  const toggleRowExpansion = (billId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(billId)) {
      newExpanded.delete(billId);
    } else {
      newExpanded.add(billId);
    }
    setExpandedRows(newExpanded);
  };

  const fetchBills = async () => {
    try {
      const response = await fetch("/api/bills?limit=0"); // Fetch all records for client-side filtering
      if (!response.ok) {
        throw new Error("Failed to fetch bills");
      }
      const data = await response.json();
      setBills(data.bills || []);
    } catch (error) {
      console.error("Failed to fetch bills:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncBills = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/sync/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: dateRange }),
      });
      const data = await response.json();
      if (data.success) {
        alert(
          `Synced ${data.count} bills successfully!\nCreated: ${data.created}, Updated: ${data.updated}`
        );
        fetchBills();
      } else {
        alert(`Failed to sync bills: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      alert("Failed to sync bills");
    } finally {
      setSyncing(false);
    }
  };

  const toggleBill = async (id: string, currentValue: boolean) => {
    try {
      await fetch(`/api/bills/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_in_calculation: !currentValue }),
      });
      fetchBills();
    } catch (error) {
      alert("Failed to update bill");
    }
  };

  const syncBillDetails = async (billId: string) => {
    setSyncingDetails((prev) => new Set(prev).add(billId));
    try {
      const response = await fetch(`/api/bills/${billId}/details`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        // Refresh the bills list to get updated details
        await fetchBills();
      } else {
        alert(`Failed to sync details: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      alert("Failed to sync bill details");
    } finally {
      setSyncingDetails((prev) => {
        const newSet = new Set(prev);
        newSet.delete(billId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    fetch("/api/projects?status=active")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
    fetchBills();
  }, []);

  const categories = Array.from(
    new Set(bills.map((b) => b.cf_expense_category).filter(Boolean))
  ).sort();

  const statuses = Array.from(new Set(bills.map((b) => b.status))).sort();

  // Get unique billed months
  const billedMonths = Array.from(
    new Set(bills.map((b) => b.cf_billed_for_month).filter(Boolean))
  ).sort().reverse(); // Most recent first

  // First, apply all filters EXCEPT the include/exclude filter to get base filtered set
  const baseFilteredBills = bills.filter((bill) => {
    // Filter by vendor search
    if (vendorSearch && !bill.vendor_name.toLowerCase().includes(vendorSearch.toLowerCase()))
      return false;

    // Filter by category
    if (categoryFilter !== "all" && bill.cf_expense_category !== categoryFilter)
      return false;

    // Filter by status
    if (statusFilter !== "all" && bill.status !== statusFilter) return false;

    // Filter by date range
    if (startDate && new Date(bill.bill_date) < new Date(startDate)) return false;
    if (endDate && new Date(bill.bill_date) > new Date(endDate)) return false;

    // Filter by billed month
    if (billedMonthFilter !== "all" && bill.cf_billed_for_month !== billedMonthFilter)
      return false;

    return true;
  });

  // Calculate counts for filter buttons from base filtered set
  const allCount = baseFilteredBills.length;
  const includedCountForButton = baseFilteredBills.filter((b) => b.include_in_calculation).length;
  const excludedCountForButton = baseFilteredBills.filter((b) => !b.include_in_calculation).length;

  // Then apply include/exclude filter on top
  const filteredBills = baseFilteredBills.filter((bill) => {
    if (filter === "included" && !bill.include_in_calculation) return false;
    if (filter === "excluded" && bill.include_in_calculation) return false;
    return true;
  }).sort((a, b) => {
    const dateA = new Date(a.bill_date).getTime();
    const dateB = new Date(b.bill_date).getTime();
    return dateSortDirection === "desc" ? dateB - dateA : dateA - dateB;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBills = filteredBills.slice(startIndex, endIndex);

  // Calculate totals from filtered bills with Number() wrapper to prevent string concatenation
  const totalAmount = filteredBills.reduce((sum, bill) => sum + Number(bill.total), 0);
  const totalBalance = filteredBills.reduce((sum, bill) => sum + Number(bill.balance), 0);

  // Counts for display (from filteredBills, not all bills)
  const includedCount = filteredBills.filter((b) => b.include_in_calculation).length;
  const excludedCount = filteredBills.filter((b) => !b.include_in_calculation).length;
  const paidCount = bills.filter((b) => b.status === "paid").length;
  const overdueCount = bills.filter((b) => b.status === "overdue").length;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, startDate, endDate, categoryFilter, statusFilter, billedMonthFilter, vendorSearch]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "open":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getDetailsSyncBadge = (status: "pending" | "syncing" | "synced" | "error") => {
    switch (status) {
      case "synced":
        return <span className="text-xs text-green-600">✓ Synced</span>;
      case "syncing":
        return <span className="text-xs text-blue-600">⟳ Syncing...</span>;
      case "error":
        return <span className="text-xs text-red-600">✗ Error</span>;
      case "pending":
      default:
        return <span className="text-xs text-gray-500">- Pending</span>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Bills</h1>
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
            onClick={syncBills}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {syncing ? "Syncing..." : "Sync Bills from Zoho"}
          </button>
          <a
            href="/sync/bill-details"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 inline-block"
          >
            Sync Bill Details
          </a>
          <a
            href="/settings/bill-exclusion-rules"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 inline-block"
          >
            Exclusion Rules
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-gray-600 text-sm">Total Bills</div>
          <div className="text-2xl font-bold">{bills.length}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow border border-green-200">
          <div className="text-green-700 text-sm">Paid</div>
          <div className="text-2xl font-bold text-green-700">{paidCount}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg shadow border border-red-200">
          <div className="text-red-700 text-sm">Overdue</div>
          <div className="text-2xl font-bold text-red-700">{overdueCount}</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow border border-blue-200">
          <div className="text-blue-700 text-sm">Included</div>
          <div className="text-2xl font-bold text-blue-700">{includedCount}</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg shadow border border-purple-200">
          <div className="text-purple-700 text-sm">Total Amount</div>
          <div className="text-2xl font-bold text-purple-700">
            ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
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

        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="text"
            placeholder="Search vendor..."
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white"
          >
            <option value="all">All Categories ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat!}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white"
          >
            <option value="all">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={billedMonthFilter}
            onChange={(e) => setBilledMonthFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white"
          >
            <option value="all">All Billed Months ({billedMonths.length})</option>
            {billedMonths.map((month) => (
              <option key={month} value={month!}>
                {month}
              </option>
            ))}
          </select>

          {(vendorSearch || categoryFilter !== "all" || statusFilter !== "all" || billedMonthFilter !== "all" || startDate || endDate) && (
            <button
              onClick={() => {
                setVendorSearch("");
                setCategoryFilter("all");
                setStatusFilter("all");
                setBilledMonthFilter("all");
                setStartDate("");
                setEndDate("");
              }}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
            >
              Clear All Filters
            </button>
          )}
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
            Showing {filteredBills.length} of {bills.length} bills
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : filteredBills.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No bills found. Click "Sync Bills from Zoho" to import data.
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
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredBills.length)} of {filteredBills.length}
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
                    <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700 w-10">

                    </th>
                    <th
                      className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                      onClick={() => setDateSortDirection(dateSortDirection === "desc" ? "asc" : "desc")}
                    >
                      Date {dateSortDirection === "desc" ? "↓" : "↑"}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Vendor
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Bill #
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Period
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Subtotal
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Total
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Details
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Include
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedBills.map((bill) => {
                    const isExpanded = expandedRows.has(bill.id);
                    const hasLineItems = bill.line_items && bill.line_items.length > 0;

                    return (
                      <>
                        <tr key={bill.id} className="hover:bg-gray-50">
                          <td className="px-2 py-3 text-center">
                            {hasLineItems && (
                              <button
                                onClick={() => toggleRowExpansion(bill.id)}
                                className="text-gray-500 hover:text-gray-700 focus:outline-none"
                              >
                                {isExpanded ? "▼" : "▶"}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {new Date(bill.bill_date).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            {bill.vendor_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {bill.bill_number}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
                              {bill.cf_expense_category || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {bill.cf_billed_for_month || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {bill.sub_total ? `₹${bill.sub_total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            ₹{bill.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(bill.status)}`}>
                              {bill.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {getDetailsSyncBadge(bill.details_sync_status)}
                              {bill.details_sync_status !== "syncing" && (
                                <button
                                  onClick={() => syncBillDetails(bill.id)}
                                  disabled={syncingDetails.has(bill.id)}
                                  className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                                >
                                  {syncingDetails.has(bill.id) ? "Syncing..." : bill.details_sync_status === "synced" ? "Resync" : "Sync"}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() =>
                                toggleBill(bill.id, bill.include_in_calculation)
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                                bill.include_in_calculation
                                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                                  : "bg-red-100 text-red-700 hover:bg-red-200"
                              }`}
                            >
                              {bill.include_in_calculation ? "✓ Included" : "✗ Excluded"}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded row showing line items and financial breakdown */}
                        {isExpanded && hasLineItems && (
                          <tr key={`${bill.id}-expanded`} className="bg-gray-50">
                            <td colSpan={11} className="px-4 py-4">
                              <div className="space-y-4">
                                {/* Financial Summary */}
                                <div className="grid grid-cols-4 gap-4 p-4 bg-white rounded-lg border border-gray-200">
                                  <div>
                                    <div className="text-xs text-gray-500">Subtotal</div>
                                    <div className="text-sm font-semibold">
                                      ₹{(bill.sub_total || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">Tax</div>
                                    <div className="text-sm font-semibold">
                                      ₹{(bill.tax_total || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">TDS</div>
                                    <div className="text-sm font-semibold">
                                      ₹{(bill.tds_total || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">Exchange Rate</div>
                                    <div className="text-sm font-semibold">
                                      {bill.exchange_rate || 1}
                                    </div>
                                  </div>
                                </div>

                                {/* Line Items Table */}
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Line Items ({bill.line_items.length})</h4>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm border border-gray-200">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-semibold">Item</th>
                                          <th className="px-3 py-2 text-left text-xs font-semibold">Description</th>
                                          <th className="px-3 py-2 text-left text-xs font-semibold">Customer</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold">Qty</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold">Rate</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold">Tax</th>
                                          <th className="px-3 py-2 text-right text-xs font-semibold">Total</th>
                                          <th className="px-3 py-2 text-left text-xs font-semibold" title="Tagging a line item to a project makes its amount count as that project's direct expense for the bill's billed-for-month.">Project (direct expense)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {bill.line_items.map((item) => (
                                          <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-xs font-medium">{item.item_name}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate" title={item.description || ""}>
                                              {item.description || "-"}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-600">
                                              {item.customer_name || "-"}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-right">
                                              {item.quantity.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-right">
                                              ₹{item.rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-right">
                                              ₹{item.tax_amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                              {item.tax_percentage > 0 && (
                                                <span className="text-gray-500 ml-1">({item.tax_percentage}%)</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-right font-medium">
                                              ₹{item.item_total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                              <ProjectCombobox
                                                value={item.project_id}
                                                projects={projects}
                                                currentProject={item.project}
                                                disabled={taggingLineItems.has(item.id) || !bill.include_in_calculation}
                                                onChange={(id) => tagLineItemProject(item.id, id)}
                                              />
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr className="font-semibold">
                    <td colSpan={7} className="px-4 py-3 text-sm text-right">
                      Totals ({filteredBills.length} bills):
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td colSpan={3} className="px-4 py-3 text-sm text-center">
                      <div className="text-xs text-gray-600">
                        {includedCount} included / {excludedCount} excluded
                      </div>
                    </td>
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
