"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ProjectCost {
  id: string;
  project_id: string;
  period_month: string;
  type: string;
  amount: number;
  notes?: string;
}

interface ProjectConfig {
  id: string;
  project_type: string;
  billing_model: string;
  rate_type: string;
  blended_rate?: number;
  currency: string;
}

interface Project {
  id: string;
  name: string;
  client: {
    id: string;
    name: string;
  };
  config?: ProjectConfig;
  project_costs: ProjectCost[];
}

interface CellData {
  projectId: string;
  month: string;
  value: string;
  isEdited: boolean;
}

export default function ProjectCostsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Month selection
  const [selectedStartMonth, setSelectedStartMonth] = useState("");
  const [selectedEndMonth, setSelectedEndMonth] = useState("");
  const [months, setMonths] = useState<string[]>([]);

  // Filters
  const [clientFilter, setClientFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  // Grid data
  const [gridData, setGridData] = useState<Map<string, CellData>>(new Map());
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());

  // Import
  const [importing, setImporting] = useState(false);
  const [importMonth, setImportMonth] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  // Clipboard support
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [copiedData, setCopiedData] = useState<string[][] | null>(null);
  const isPastingRef = useRef(false);

  useEffect(() => {
    // Set default date range (current month to +2 months)
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    setSelectedStartMonth(start.toISOString().substring(0, 10));
    setSelectedEndMonth(end.toISOString().substring(0, 10));
  }, []);

  useEffect(() => {
    if (selectedStartMonth && selectedEndMonth) {
      generateMonthHeaders();
      fetchProjectCosts();
    }
  }, [selectedStartMonth, selectedEndMonth]);

  const generateMonthHeaders = () => {
    const start = new Date(selectedStartMonth);
    const end = new Date(selectedEndMonth);
    const monthList: string[] = [];

    const current = new Date(start);
    while (current <= end) {
      monthList.push(current.toISOString().substring(0, 10));
      current.setMonth(current.getMonth() + 1);
    }

    setMonths(monthList);
  };

  const fetchProjectCosts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        start_month: selectedStartMonth,
        end_month: selectedEndMonth,
      });

      const res = await fetch(`/api/project-costs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch project costs");

      const data = await res.json();
      setProjects(data.projects);

      // Build grid data from existing costs
      const newGridData = new Map<string, CellData>();
      data.projects.forEach((project: Project) => {
        project.project_costs.forEach((cost) => {
          const key = `${project.id}-${cost.period_month.substring(0, 10)}`;
          newGridData.set(key, {
            projectId: project.id,
            month: cost.period_month.substring(0, 10),
            value: cost.amount.toString(),
            isEdited: false,
          });
        });
      });

      setGridData(newGridData);
      setEditedCells(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const getCellKey = (projectId: string, month: string) => `${projectId}-${month}`;

  const getCellValue = (projectId: string, month: string): string => {
    const key = getCellKey(projectId, month);
    const cellData = gridData.get(key);
    return cellData?.value || "";
  };

  const handleCellChange = (projectId: string, month: string, value: string) => {
    const key = getCellKey(projectId, month);

    // Update grid data
    const newGridData = new Map(gridData);
    newGridData.set(key, {
      projectId,
      month,
      value,
      isEdited: true,
    });
    setGridData(newGridData);

    // Mark as edited
    const newEditedCells = new Set(editedCells);
    newEditedCells.add(key);
    setEditedCells(newEditedCells);
  };

  const handleKeyDown = (e: React.KeyboardEvent, projectId: string, month: string) => {
    const currentIndex = filteredProjects.findIndex(p => p.id === projectId);
    const monthIndex = months.indexOf(month);

    // Arrow key navigation
    if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      const prevProject = filteredProjects[currentIndex - 1];
      document.getElementById(getCellKey(prevProject.id, month))?.focus();
    } else if (e.key === "ArrowDown" && currentIndex < filteredProjects.length - 1) {
      e.preventDefault();
      const nextProject = filteredProjects[currentIndex + 1];
      document.getElementById(getCellKey(nextProject.id, month))?.focus();
    } else if (e.key === "ArrowLeft" && monthIndex > 0) {
      e.preventDefault();
      const prevMonth = months[monthIndex - 1];
      document.getElementById(getCellKey(projectId, prevMonth))?.focus();
    } else if (e.key === "ArrowRight" && monthIndex < months.length - 1) {
      e.preventDefault();
      const nextMonth = months[monthIndex + 1];
      document.getElementById(getCellKey(projectId, nextMonth))?.focus();
    }

    // Copy: Ctrl+C or Cmd+C
    else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      handleCopy(projectId, month);
    }

    // Paste: Ctrl+V or Cmd+V
    else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      if (!isPastingRef.current) {
        handlePaste(projectId, month);
      }
    }
  };

  const handleCopy = (projectId: string, month: string) => {
    const value = getCellValue(projectId, month);
    setCopiedData([[value]]);
    setSuccessMessage("Copied to clipboard");
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const handlePaste = async (projectId: string, month: string) => {
    if (isPastingRef.current) {
      return; // Prevent multiple simultaneous pastes
    }

    try {
      isPastingRef.current = true;

      // Try to read from system clipboard first (for Excel/external data)
      const clipboardText = await navigator.clipboard.readText();

      let dataToProcess: string[][] = [];

      if (clipboardText) {
        // Parse clipboard text (tab-separated for columns, newline for rows)
        const rows = clipboardText.split('\n').filter(row => row.trim());
        dataToProcess = rows.map(row =>
          row.split('\t').map(cell => cell.trim())
        );
      } else if (copiedData) {
        // Fallback to internal copied data
        dataToProcess = copiedData;
      } else {
        isPastingRef.current = false;
        return;
      }

      const startProjectIndex = filteredProjects.findIndex(p => p.id === projectId);
      const startMonthIndex = months.indexOf(month);

      // Collect all changes first, then apply in a single state update
      const newGridData = new Map(gridData);
      const newEditedCells = new Set(editedCells);
      let cellsUpdated = 0;

      dataToProcess.forEach((row, rowOffset) => {
        row.forEach((value, colOffset) => {
          const targetProjectIndex = startProjectIndex + rowOffset;
          const targetMonthIndex = startMonthIndex + colOffset;

          if (targetProjectIndex < filteredProjects.length && targetMonthIndex < months.length) {
            const targetProject = filteredProjects[targetProjectIndex];
            const targetMonth = months[targetMonthIndex];
            const key = getCellKey(targetProject.id, targetMonth);

            // Update the grid data map
            newGridData.set(key, {
              projectId: targetProject.id,
              month: targetMonth,
              value,
              isEdited: true,
            });

            // Mark as edited
            newEditedCells.add(key);
            cellsUpdated++;
          }
        });
      });

      // Apply all changes in a single state update
      setGridData(newGridData);
      setEditedCells(newEditedCells);

      setSuccessMessage(`Pasted ${dataToProcess.length} row(s), ${cellsUpdated} cell(s) updated`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Paste error:', err);
      setError('Failed to paste. Please allow clipboard access.');
      setTimeout(() => setError(null), 3000);
    } finally {
      // Reset isPasting after a short delay
      setTimeout(() => {
        isPastingRef.current = false;
      }, 200);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Build updates array
      const updates = Array.from(editedCells).map((key) => {
        const cellData = gridData.get(key);
        if (!cellData) return null;

        return {
          project_id: cellData.projectId,
          period_month: cellData.month,
          type: "other", // Default type
          amount: parseFloat(cellData.value) || 0,
        };
      }).filter(Boolean);

      if (updates.length === 0) {
        setError("No changes to save");
        return;
      }

      const res = await fetch("/api/project-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save");
      }

      setSuccessMessage(`Successfully saved ${data.updated} cost entries`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Clear edited cells
      setEditedCells(new Set());

      // Refresh data
      fetchProjectCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleExportTemplate = (month: string) => {
    const monthParam = month.substring(0, 7); // YYYY-MM
    window.open(`/api/project-costs/export?month=${monthParam}`, "_blank");
  };

  const handleImportCsv = async (file: File, month: string) => {
    try {
      setImporting(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("month", month);

      const res = await fetch("/api/project-costs/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to import");
      }

      let msg = `Imported ${data.updated} project costs for ${month}`;
      if (data.skipped > 0) msg += `, ${data.skipped} skipped`;
      if (data.errors?.length > 0) msg += `. Errors: ${data.errors.join("; ")}`;

      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 5000);
      setShowImportModal(false);
      fetchProjectCosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const formatMonthHeader = (monthStr: string) => {
    const date = new Date(monthStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Filter projects - only show hourly projects (blended or resource-based)
  const filteredProjects = projects.filter((project) => {
    // ONLY show hourly projects (blended or resource-based)
    if (!project.config ||
        (project.config.project_type !== "hourly_blended" &&
         project.config.project_type !== "hourly_resource_based")) {
      return false;
    }

    const matchesClient = !clientFilter ||
      project.client.name.toLowerCase().includes(clientFilter.toLowerCase());
    const matchesProject = !projectFilter ||
      project.name.toLowerCase().includes(projectFilter.toLowerCase());
    return matchesClient && matchesProject;
  });

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
              <h1 className="text-3xl font-bold text-gray-900">Project Costs</h1>
              <p className="text-gray-600 mt-2">
                Excel-like grid for managing monthly project costs (T&M, Hourly projects)
              </p>
              <p className="text-sm text-blue-600 mt-1">
                For Reselling/Outsourcing projects, use{" "}
                <button
                  onClick={() => router.push("/reselling-invoices/new")}
                  className="underline hover:text-blue-800 font-medium"
                >
                  Reselling Invoice Entry
                </button>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Import CSV
              </button>
              <button
                onClick={() => fetchProjectCosts()}
                disabled={saving}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Refresh
              </button>
              <button
                onClick={handleSave}
                disabled={saving || editedCells.size === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {saving ? "Saving..." : `Save Changes (${editedCells.size})`}
              </button>
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="bg-white p-4 rounded-lg shadow space-y-4">
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Month
                </label>
                <input
                  type="month"
                  value={selectedStartMonth.substring(0, 7)}
                  onChange={(e) =>
                    setSelectedStartMonth(e.target.value + "-01")
                  }
                  className="px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Month
                </label>
                <input
                  type="month"
                  value={selectedEndMonth.substring(0, 7)}
                  onChange={(e) => setSelectedEndMonth(e.target.value + "-01")}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by Client
                </label>
                <input
                  type="text"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  placeholder="Search client..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by Project
                </label>
                <input
                  type="text"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  placeholder="Search project..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              {(clientFilter || projectFilter) && (
                <button
                  onClick={() => {
                    setClientFilter("");
                    setProjectFilter("");
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Clear Filters
                </button>
              )}
            </div>
            <div className="text-sm text-gray-600">
              Tip: Use arrow keys to navigate, Ctrl/Cmd+C to copy, Ctrl/Cmd+V to paste •
              Showing {filteredProjects.length} T&M/Hourly projects
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

        {/* Excel-like Grid */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[250px]">
                  Client / Project
                </th>
                {months.map((month) => (
                  <th
                    key={month}
                    className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700 min-w-[120px]"
                  >
                    {formatMonthHeader(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={months.length + 1}
                    className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                  >
                    {projects.length === 0
                      ? "No active projects found"
                      : "No projects match the current filters"}
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">
                      <div className="font-medium text-gray-900">
                        {project.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {project.client.name}
                      </div>
                    </td>
                    {months.map((month) => {
                      const cellKey = getCellKey(project.id, month);
                      const isEdited = editedCells.has(cellKey);
                      const value = getCellValue(project.id, month);

                      return (
                        <td
                          key={cellKey}
                          className={`border border-gray-300 p-0 ${
                            isEdited ? "bg-yellow-50" : ""
                          }`}
                        >
                          <input
                            id={cellKey}
                            type="text"
                            value={value}
                            onChange={(e) =>
                              handleCellChange(project.id, month, e.target.value)
                            }
                            onKeyDown={(e) => handleKeyDown(e, project.id, month)}
                            onFocus={() => setSelectedCell(cellKey)}
                            className={`w-full px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isEdited ? "bg-yellow-50 font-semibold" : "bg-transparent"
                            }`}
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {editedCells.size > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-800">
              {editedCells.size} cell{editedCells.size > 1 ? "s" : ""} modified. Click "Save
              Changes" to update.
            </p>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <ImportCsvModal
            onClose={() => setShowImportModal(false)}
            onImport={handleImportCsv}
            onExport={handleExportTemplate}
            importing={importing}
          />
        )}
      </div>
    </div>
  );
}

interface ImportCsvModalProps {
  onClose: () => void;
  onImport: (file: File, month: string) => void;
  onExport: (month: string) => void;
  importing: boolean;
}

function ImportCsvModal({ onClose, onImport, onExport, importing }: ImportCsvModalProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file && month) {
      onImport(file, month);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Import Project Costs</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month *
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
              disabled={importing}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => onExport(month + "-01")}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
            >
              Download template for {new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </button>
            <p className="text-xs text-gray-500 mt-1">
              Download the CSV template, fill in the Revenue column, then upload it below.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CSV File *
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
              disabled={importing}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Required columns: Project ID, Revenue. Client and Project Name are for reference only.
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing || !file}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400"
            >
              {importing ? "Importing..." : "Import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
