"use client";

import { useEffect, useState } from "react";

interface OwnerWithTarget {
  owner: {
    id: string;
    name: string;
    person: { id: string; name: string; email: string };
  };
  target: {
    id: string;
    pod_owner_id: string;
    fiscal_year: number;
    profitability_target: string; // Decimal as string
    revenue_growth_target: string;
    baseline_revenue: string;
    notes: string | null;
    set_by: { name: string | null; email: string } | null;
    updated_at: string;
  } | null;
}

// Current Indian FY start year: April flips it forward.
function currentFiscalYearStart(): number {
  const now = new Date();
  return now.getMonth() >= 3 /* Apr */ ? now.getFullYear() : now.getFullYear() - 1;
}

function fyLabel(year: number): string {
  return `FY ${year} (Apr ${year} – Mar ${year + 1})`;
}

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function PodOwnerTargetsPage() {
  const [fiscalYear, setFiscalYear] = useState<number>(currentFiscalYearStart());
  const [rows, setRows] = useState<OwnerWithTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOwnerId, setSavingOwnerId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Edit-state buffer keyed by ownerId. Empty until the user edits a row.
  const [drafts, setDrafts] = useState<
    Record<string, { profitability: string; growth: string; baseline: string; notes: string }>
  >({});

  const yearOptions: number[] = [];
  for (let y = currentFiscalYearStart() + 1; y >= currentFiscalYearStart() - 3; y--) {
    yearOptions.push(y);
  }

  useEffect(() => {
    fetchTargets();
  }, [fiscalYear]);

  const fetchTargets = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/pod-owner-targets?fiscal_year=${fiscalYear}`);
      if (!res.ok) throw new Error("Failed to fetch targets");
      const data = await res.json();
      setRows(data.owners || []);
      setDrafts({});
    } catch (e: any) {
      setMessage({ kind: "err", text: e.message || "Failed to load" });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (row: OwnerWithTarget) => {
    setDrafts((d) => ({
      ...d,
      [row.owner.id]: {
        profitability: row.target?.profitability_target ?? "",
        growth: row.target?.revenue_growth_target ?? "",
        baseline: row.target?.baseline_revenue ?? "",
        notes: row.target?.notes ?? "",
      },
    }));
  };

  const cancelEdit = (ownerId: string) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[ownerId];
      return next;
    });
  };

  const save = async (row: OwnerWithTarget) => {
    const draft = drafts[row.owner.id];
    if (!draft) return;

    const profitability_target = parseFloat(draft.profitability);
    const revenue_growth_target = parseFloat(draft.growth);
    const baseline_revenue = parseFloat(draft.baseline);
    if (
      !Number.isFinite(profitability_target) ||
      !Number.isFinite(revenue_growth_target) ||
      !Number.isFinite(baseline_revenue)
    ) {
      setMessage({ kind: "err", text: "All three numeric fields are required." });
      return;
    }

    setSavingOwnerId(row.owner.id);
    setMessage(null);
    try {
      let res: Response;
      if (row.target) {
        res = await fetch(`/api/pod-owner-targets/${row.target.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profitability_target,
            revenue_growth_target,
            baseline_revenue,
            notes: draft.notes || null,
          }),
        });
      } else {
        res = await fetch(`/api/pod-owner-targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pod_owner_id: row.owner.id,
            fiscal_year: fiscalYear,
            profitability_target,
            revenue_growth_target,
            baseline_revenue,
            notes: draft.notes || null,
          }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      setMessage({ kind: "ok", text: `Target saved for ${row.owner.name}.` });
      await fetchTargets();
    } catch (e: any) {
      setMessage({ kind: "err", text: e.message });
    } finally {
      setSavingOwnerId(null);
    }
  };

  const remove = async (row: OwnerWithTarget) => {
    if (!row.target) return;
    if (!confirm(`Remove target for ${row.owner.name} (${fyLabel(fiscalYear)})?`)) return;
    setSavingOwnerId(row.owner.id);
    try {
      const res = await fetch(`/api/pod-owner-targets/${row.target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Delete failed");
      }
      setMessage({ kind: "ok", text: `Target removed for ${row.owner.name}.` });
      await fetchTargets();
    } catch (e: any) {
      setMessage({ kind: "err", text: e.message });
    } finally {
      setSavingOwnerId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Pod Owner Targets</h1>
          <p className="text-gray-600 mt-2">
            Set profitability and revenue-growth targets per pod owner for an Indian fiscal year
            (April – March). Owner / finance access only.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            <strong>Baseline revenue</strong> is the <strong>full annual</strong> amount (typically last
            FY's total revenue). The Pod Owner Financials report automatically scales it to any
            partial period selected — e.g. for a 3-month view it compares against{" "}
            <code className="text-gray-700">baseline × 3 / 12</code>.
          </p>
        </div>

        {/* FY selector */}
        <div className="bg-white p-4 rounded-lg shadow mb-6 flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(parseInt(e.target.value, 10))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {fyLabel(y)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message && (
          <div
            className={`mb-4 p-3 rounded-md ${
              message.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No active pod owners.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left">Pod Owner</th>
                  <th className="px-4 py-3 text-right">Profitability target</th>
                  <th className="px-4 py-3 text-right">Revenue growth target</th>
                  <th className="px-4 py-3 text-right" title="Full annual baseline — typically last FY's total revenue. The report scales this to the selected period automatically.">Annual baseline revenue (₹)</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => {
                  const editing = !!drafts[row.owner.id];
                  const draft = drafts[row.owner.id];
                  return (
                    <tr key={row.owner.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.owner.name}</div>
                        <div className="text-xs text-gray-500">{row.owner.person.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.profitability}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [row.owner.id]: { ...d[row.owner.id], profitability: e.target.value },
                              }))
                            }
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                            placeholder="45"
                          />
                        ) : row.target ? (
                          `${Number(row.target.profitability_target).toFixed(2)}%`
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.growth}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [row.owner.id]: { ...d[row.owner.id], growth: e.target.value },
                              }))
                            }
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                            placeholder="30"
                          />
                        ) : row.target ? (
                          `${Number(row.target.revenue_growth_target).toFixed(2)}%`
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.baseline}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [row.owner.id]: { ...d[row.owner.id], baseline: e.target.value },
                              }))
                            }
                            className="w-36 px-2 py-1 border border-gray-300 rounded text-right"
                            placeholder="50000000"
                          />
                        ) : row.target ? (
                          formatINR(Number(row.target.baseline_revenue))
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editing ? (
                          <input
                            type="text"
                            value={draft.notes}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [row.owner.id]: { ...d[row.owner.id], notes: e.target.value },
                              }))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        ) : (
                          <span className="text-gray-600">{row.target?.notes ?? ""}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {editing ? (
                          <>
                            <button
                              onClick={() => save(row)}
                              disabled={savingOwnerId === row.owner.id}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 mr-2"
                            >
                              {savingOwnerId === row.owner.id ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={() => cancelEdit(row.owner.id)}
                              className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(row)}
                              className="px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 mr-2"
                            >
                              {row.target ? "Edit" : "Set target"}
                            </button>
                            {row.target && (
                              <button
                                onClick={() => remove(row)}
                                disabled={savingOwnerId === row.owner.id}
                                className="px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
                              >
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
