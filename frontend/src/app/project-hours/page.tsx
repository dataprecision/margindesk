"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";

interface ProjectHoursRow {
  id: string;
  project_id: string;
  period_month: string;
  hours: number;
  notes?: string;
}

interface ProjectConfig {
  project_type: string;
  blended_rate?: number;
  currency: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  end_date?: string | null;
  client: { id: string; name: string };
  config?: ProjectConfig;
  project_hours: ProjectHoursRow[];
}

interface CellData {
  projectId: string;
  month: string;
  value: string;
  isEdited: boolean;
}

export default function ProjectHoursPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canEdit = role === "owner" || role === "finance" || role === "pm";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedStartMonth, setSelectedStartMonth] = useState("");
  const [selectedEndMonth, setSelectedEndMonth] = useState("");
  const [months, setMonths] = useState<string[]>([]);

  const [clientFilter, setClientFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const [gridData, setGridData] = useState<Map<string, CellData>>(new Map());
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());

  const isPastingRef = useRef(false);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    setSelectedStartMonth(start.toISOString().substring(0, 10));
    setSelectedEndMonth(end.toISOString().substring(0, 10));
  }, []);

  useEffect(() => {
    if (selectedStartMonth && selectedEndMonth) {
      generateMonthHeaders();
      fetchProjectHours();
    }
  }, [selectedStartMonth, selectedEndMonth]);

  const generateMonthHeaders = () => {
    const start = new Date(selectedStartMonth);
    const end = new Date(selectedEndMonth);
    const list: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      list.push(cur.toISOString().substring(0, 10));
      cur.setMonth(cur.getMonth() + 1);
    }
    setMonths(list);
  };

  const fetchProjectHours = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        start_month: selectedStartMonth,
        end_month: selectedEndMonth,
      });
      const res = await fetch(`/api/project-hours?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch project hours");
      const data = await res.json();
      setProjects(data.projects);

      const newGrid = new Map<string, CellData>();
      data.projects.forEach((p: Project) => {
        p.project_hours.forEach((h) => {
          const key = `${p.id}-${h.period_month.substring(0, 10)}`;
          newGrid.set(key, {
            projectId: p.id,
            month: h.period_month.substring(0, 10),
            value: String(h.hours),
            isEdited: false,
          });
        });
      });
      setGridData(newGrid);
      setEditedCells(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const getCellKey = (projectId: string, month: string) =>
    `${projectId}-${month}`;
  const getCellValue = (projectId: string, month: string): string =>
    gridData.get(getCellKey(projectId, month))?.value || "";

  const setCell = (projectId: string, month: string, value: string) => {
    const key = getCellKey(projectId, month);
    const newGrid = new Map(gridData);
    newGrid.set(key, { projectId, month, value, isEdited: true });
    setGridData(newGrid);
    const newEdits = new Set(editedCells);
    newEdits.add(key);
    setEditedCells(newEdits);
  };

  const handleCellChange = (projectId: string, month: string, value: string) => {
    setCell(projectId, month, value);
  };

  /** Fill the leftmost non-empty value forward through project end (or grid end). */
  const handleFillForward = (project: Project) => {
    if (!canEdit) return;
    // Find leftmost non-empty value
    let sourceIdx = -1;
    let sourceValue = "";
    for (let i = 0; i < months.length; i++) {
      const v = getCellValue(project.id, months[i]);
      if (v !== "" && Number(v) > 0) {
        sourceIdx = i;
        sourceValue = v;
        break;
      }
    }
    if (sourceIdx === -1) {
      setError("Enter a value in the first month, then click Fill →");
      setTimeout(() => setError(null), 3000);
      return;
    }
    // Determine fill ceiling (project end date if set)
    const projectEndMonth = project.end_date
      ? project.end_date.substring(0, 7)
      : null;
    const newGrid = new Map(gridData);
    const newEdits = new Set(editedCells);
    let filled = 0;
    for (let i = sourceIdx + 1; i < months.length; i++) {
      const m = months[i];
      if (projectEndMonth && m.substring(0, 7) > projectEndMonth) break;
      const key = getCellKey(project.id, m);
      const existing = newGrid.get(key);
      // Don't overwrite cells that already have a non-empty value
      if (existing && existing.value !== "") continue;
      newGrid.set(key, {
        projectId: project.id,
        month: m,
        value: sourceValue,
        isEdited: true,
      });
      newEdits.add(key);
      filled++;
    }
    setGridData(newGrid);
    setEditedCells(newEdits);
    setSuccessMessage(
      `Filled ${filled} cell${filled === 1 ? "" : "s"} forward with ${sourceValue}`
    );
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    projectId: string,
    month: string
  ) => {
    const idx = filteredProjects.findIndex((p) => p.id === projectId);
    const mIdx = months.indexOf(month);
    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      document
        .getElementById(getCellKey(filteredProjects[idx - 1].id, month))
        ?.focus();
    } else if (e.key === "ArrowDown" && idx < filteredProjects.length - 1) {
      e.preventDefault();
      document
        .getElementById(getCellKey(filteredProjects[idx + 1].id, month))
        ?.focus();
    } else if (e.key === "ArrowLeft" && mIdx > 0) {
      e.preventDefault();
      document
        .getElementById(getCellKey(projectId, months[mIdx - 1]))
        ?.focus();
    } else if (e.key === "ArrowRight" && mIdx < months.length - 1) {
      e.preventDefault();
      document
        .getElementById(getCellKey(projectId, months[mIdx + 1]))
        ?.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      if (!isPastingRef.current) handlePaste(projectId, month);
    }
  };

  const handlePaste = async (projectId: string, month: string) => {
    if (isPastingRef.current) return;
    try {
      isPastingRef.current = true;
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText) return;
      const rows = clipboardText.split("\n").filter((r) => r.trim());
      const data = rows.map((r) => r.split("\t").map((c) => c.trim()));
      const startIdx = filteredProjects.findIndex((p) => p.id === projectId);
      const startM = months.indexOf(month);
      const newGrid = new Map(gridData);
      const newEdits = new Set(editedCells);
      let cellsUpdated = 0;
      data.forEach((row, rOff) => {
        row.forEach((val, cOff) => {
          const pIdx = startIdx + rOff;
          const mIdx = startM + cOff;
          if (pIdx < filteredProjects.length && mIdx < months.length) {
            const p = filteredProjects[pIdx];
            const m = months[mIdx];
            const key = getCellKey(p.id, m);
            newGrid.set(key, {
              projectId: p.id,
              month: m,
              value: val,
              isEdited: true,
            });
            newEdits.add(key);
            cellsUpdated++;
          }
        });
      });
      setGridData(newGrid);
      setEditedCells(newEdits);
      setSuccessMessage(`Pasted ${cellsUpdated} cell(s)`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error("Paste error:", err);
    } finally {
      setTimeout(() => {
        isPastingRef.current = false;
      }, 200);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const updates = Array.from(editedCells)
        .map((key) => {
          const c = gridData.get(key);
          if (!c) return null;
          return {
            project_id: c.projectId,
            period_month: c.month,
            hours: c.value === "" ? null : parseFloat(c.value),
          };
        })
        .filter(Boolean);
      if (updates.length === 0) {
        setError("No changes to save");
        return;
      }
      const res = await fetch("/api/project-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSuccessMessage(`Saved ${data.updated} cell${data.updated === 1 ? "" : "s"}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setEditedCells(new Set());
      fetchProjectHours();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const formatMonthHeader = (m: string) =>
    new Date(m).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const filteredProjects = projects.filter((p) => {
    if (
      !p.config ||
      (p.config.project_type !== "hourly_blended" &&
        p.config.project_type !== "hourly_resource_based")
    )
      return false;
    const mc =
      !clientFilter ||
      p.client.name.toLowerCase().includes(clientFilter.toLowerCase());
    const mp =
      !projectFilter ||
      p.name.toLowerCase().includes(projectFilter.toLowerCase());
    return mc && mp;
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
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Project Hours</h1>
              <p className="text-gray-600 mt-2">
                Contracted hours per project per month. Used for utilization,
                sold-capacity, and effective-rate reporting.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => fetchProjectHours()}
                disabled={saving}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Refresh
              </button>
              {canEdit && (
                <button
                  onClick={handleSave}
                  disabled={saving || editedCells.size === 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? "Saving..." : `Save Changes (${editedCells.size})`}
                </button>
              )}
            </div>
          </div>

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
                  onChange={(e) =>
                    setSelectedEndMonth(e.target.value + "-01")
                  }
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
              Arrow keys navigate • Ctrl/Cmd+V to paste • Fill → copies a row's
              first value forward through project end • Showing{" "}
              {filteredProjects.length} hourly project
              {filteredProjects.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

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

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="border border-gray-300 px-4 py-3 text-left text-sm font-semibold text-gray-700 min-w-[250px]">
                  Client / Project
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    className="border border-gray-300 px-3 py-3 text-center text-sm font-semibold text-gray-700 min-w-[100px]"
                  >
                    {formatMonthHeader(m)}
                  </th>
                ))}
                {canEdit && (
                  <th className="border border-gray-300 px-2 py-3 text-center text-xs font-semibold text-gray-700 min-w-[60px]">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={months.length + (canEdit ? 2 : 1)}
                    className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                  >
                    {projects.length === 0
                      ? "No active hourly projects found"
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
                    {months.map((m) => {
                      const key = getCellKey(project.id, m);
                      const isEdited = editedCells.has(key);
                      const value = getCellValue(project.id, m);
                      return (
                        <td
                          key={key}
                          className={`border border-gray-300 p-0 ${
                            isEdited ? "bg-yellow-50" : ""
                          }`}
                        >
                          <input
                            id={key}
                            type="text"
                            value={value}
                            onChange={(e) =>
                              handleCellChange(project.id, m, e.target.value)
                            }
                            onKeyDown={(e) => handleKeyDown(e, project.id, m)}
                            readOnly={!canEdit}
                            className={`w-full px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isEdited
                                ? "bg-yellow-50 font-semibold"
                                : "bg-transparent"
                            } ${!canEdit ? "cursor-default" : ""}`}
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                    {canEdit && (
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        <button
                          onClick={() => handleFillForward(project)}
                          title="Copy the row's first value forward through project end"
                          className="text-xs px-2 py-1 text-blue-700 border border-blue-300 rounded hover:bg-blue-50"
                        >
                          Fill →
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {editedCells.size > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-blue-800">
              {editedCells.size} cell{editedCells.size > 1 ? "s" : ""} modified.
              Click "Save Changes" to update.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
