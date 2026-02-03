"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
  type: string;
}

interface ProjectConfig {
  id: string;
  project_type: string;
  product_id?: string;
}

interface Project {
  id: string;
  name: string;
  client: {
    id: string;
    name: string;
  };
  config?: ProjectConfig;
}

interface ResellingData {
  project_id: string;
  product_id: string;
  revenue: string;
  oem_costs: string;
  other_expenses: string;
  isEdited: boolean;
}

export default function ResellingMonthlyDataPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Month selection - default to current month
  const [selectedMonth, setSelectedMonth] = useState("");

  // Grid data
  const [gridData, setGridData] = useState<Map<string, ResellingData>>(new Map());
  const [editedProjects, setEditedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Set default to current month
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(monthStr);
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchData();
    }
  }, [selectedMonth]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch reselling/outsourcing projects
      const projectsRes = await fetch("/api/projects?type=reselling,outsourcing");
      if (!projectsRes.ok) throw new Error("Failed to fetch projects");
      const projectsData = await projectsRes.json();

      // Fetch products
      const productsRes = await fetch("/api/products");
      if (!productsRes.ok) throw new Error("Failed to fetch products");
      const productsData = await productsRes.json();

      setProjects(projectsData.projects || []);
      setProducts(productsData.products || []);

      // Fetch existing data for this month
      const monthDate = `${selectedMonth}-01`;
      const dataRes = await fetch(`/api/reselling-invoices?period_month=${monthDate}`);
      if (dataRes.ok) {
        const data = await dataRes.json();

        // Build grid data from existing invoices
        const newGridData = new Map<string, ResellingData>();
        data.invoices?.forEach((inv: any) => {
          newGridData.set(inv.project_id, {
            project_id: inv.project_id,
            product_id: inv.product_id,
            revenue: inv.invoice_amount.toString(),
            oem_costs: inv.total_oem_cost.toString(),
            other_expenses: inv.other_expenses.toString(),
            isEdited: false,
          });
        });

        setGridData(newGridData);
      }

      setEditedProjects(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const getProjectData = (projectId: string): ResellingData => {
    const existingData = gridData.get(projectId);
    if (existingData) return existingData;

    // Pre-populate product_id from project config
    const project = projects.find(p => p.id === projectId);
    return {
      project_id: projectId,
      product_id: project?.config?.product_id || "",
      revenue: "",
      oem_costs: "",
      other_expenses: "",
      isEdited: false,
    };
  };

  const handleFieldChange = (
    projectId: string,
    field: "product_id" | "revenue" | "oem_costs" | "other_expenses",
    value: string
  ) => {
    const newGridData = new Map(gridData);
    const currentData = getProjectData(projectId);

    newGridData.set(projectId, {
      ...currentData,
      [field]: value,
      isEdited: true,
    });

    setGridData(newGridData);

    // Mark as edited
    const newEditedProjects = new Set(editedProjects);
    newEditedProjects.add(projectId);
    setEditedProjects(newEditedProjects);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Build updates array from edited projects
      const updates = Array.from(editedProjects)
        .map((projectId) => {
          const data = gridData.get(projectId);
          if (!data) return null;

          // Validate required fields
          if (!data.product_id || !data.revenue) {
            return null;
          }

          return {
            project_id: data.project_id,
            product_id: data.product_id,
            period_month: `${selectedMonth}-01`,
            invoice_amount: parseFloat(data.revenue) || 0,
            total_oem_cost: parseFloat(data.oem_costs) || 0,
            other_expenses: parseFloat(data.other_expenses) || 0,
          };
        })
        .filter(Boolean);

      if (updates.length === 0) {
        setError("No valid changes to save. Ensure Product and Revenue are filled.");
        return;
      }

      const res = await fetch("/api/reselling-invoices/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || "Failed to save");
      }

      setSuccessMessage(
        `Successfully saved ${responseData.created + responseData.updated} entries`
      );
      setTimeout(() => setSuccessMessage(null), 3000);

      // Clear edited projects
      setEditedProjects(new Set());

      // Refresh data
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const formatMonthDisplay = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-[95%] mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-[95%] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Reselling Monthly Data Entry
              </h1>
              <p className="text-gray-600 mt-2">
                Enter monthly revenue, OEM costs, and other expenses for reselling/outsourcing projects
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/reselling-invoices"
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                View All Invoices
              </Link>
              <button
                onClick={() => fetchData()}
                disabled={saving}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Refresh
              </button>
              <button
                onClick={handleSave}
                disabled={saving || editedProjects.size === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {saving ? "Saving..." : `Save Changes (${editedProjects.size})`}
              </button>
            </div>
          </div>

          {/* Month Selector */}
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Month
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="text-sm text-gray-600">
                Showing data for <strong>{formatMonthDisplay(selectedMonth)}</strong> •
                {projects.length} reselling/outsourcing projects
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800">{successMessage}</p>
          </div>
        )}

        {/* Data Grid */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[250px]">
                  Client / Project
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[150px]">
                  Product
                </th>
                <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700 min-w-[150px]">
                  Revenue (₹)
                </th>
                <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700 min-w-[150px]">
                  OEM Costs (₹)
                </th>
                <th className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700 min-w-[150px]">
                  Other Expenses (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                  >
                    No reselling/outsourcing projects found. Please create projects with type "reselling" or "outsourcing" first.
                  </td>
                </tr>
              ) : (
                projects.map((project) => {
                  const projectData = getProjectData(project.id);
                  const isEdited = editedProjects.has(project.id);

                  return (
                    <tr key={project.id} className={`hover:bg-gray-50 ${isEdited ? "bg-yellow-50" : ""}`}>
                      <td className="border border-gray-300 px-4 py-2">
                        <div className="font-medium text-gray-900">
                          {project.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {project.client.name}
                        </div>
                      </td>
                      <td className="border border-gray-300 p-2">
                        {project.config?.product_id ? (
                          <div className="text-sm text-gray-700">
                            <div className="font-medium">
                              {products.find(p => p.id === project.config?.product_id)?.name || "Unknown Product"}
                            </div>
                            <div className="text-xs text-gray-500">
                              Configured in project
                            </div>
                          </div>
                        ) : (
                          <select
                            value={projectData.product_id}
                            onChange={(e) =>
                              handleFieldChange(project.id, "product_id", e.target.value)
                            }
                            className={`w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isEdited ? "bg-yellow-50" : "bg-transparent"
                            }`}
                          >
                            <option value="">Select Product</option>
                            {products
                              .filter(p => p.type === "reselling" || p.type === "outsourcing")
                              .map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="border border-gray-300 p-0">
                        <input
                          type="text"
                          value={projectData.revenue}
                          onChange={(e) =>
                            handleFieldChange(project.id, "revenue", e.target.value)
                          }
                          className={`w-full px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isEdited ? "bg-yellow-50" : "bg-transparent"
                          }`}
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-gray-300 p-0">
                        <input
                          type="text"
                          value={projectData.oem_costs}
                          onChange={(e) =>
                            handleFieldChange(project.id, "oem_costs", e.target.value)
                          }
                          className={`w-full px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isEdited ? "bg-yellow-50" : "bg-transparent"
                          }`}
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-gray-300 p-0">
                        <input
                          type="text"
                          value={projectData.other_expenses}
                          onChange={(e) =>
                            handleFieldChange(project.id, "other_expenses", e.target.value)
                          }
                          className={`w-full px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isEdited ? "bg-yellow-50" : "bg-transparent"
                          }`}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {editedProjects.size > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-800">
              {editedProjects.size} project{editedProjects.size > 1 ? "s" : ""} modified. Click "Save
              Changes" to update.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
