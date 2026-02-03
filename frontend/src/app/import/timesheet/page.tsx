"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";

interface ImportStats {
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  newProjects: number;
  newContractors: number;
  newAllocations: number;
  updatedAllocations: number;
  errors: string[];
  allocationIds: string[];
}

interface ImportHistory {
  id: string;
  created_at: string;
  actor_id: string;
  after_json: ImportStats;
}

export default function TimesheetImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportStats | null>(null);
  const [error, setError] = useState("");
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastImportId, setLastImportId] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Check permissions
  if (status === "authenticated" && session?.user?.role !== "owner" && session?.user?.role !== "finance") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">
              Access denied. Only owners and finance can import timesheets.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv")) {
        setError("Please select a CSV file");
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError("");
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    setImporting(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/timesheet", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data.stats);
        setFile(null);
        // Reset file input
        const fileInput = document.getElementById("file-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      } else {
        setError(data.error || "Failed to import timesheet");
      }
    } catch (err) {
      setError("Error importing timesheet");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      "⚠️ WARNING: This will delete ALL allocations in the system!\n\n" +
      "This action cannot be undone.\n\n" +
      "Type 'DELETE_ALL_ALLOCATIONS' in the next prompt to confirm."
    );

    if (!confirmed) return;

    const confirmText = window.prompt(
      "Type exactly: DELETE_ALL_ALLOCATIONS"
    );

    if (confirmText !== "DELETE_ALL_ALLOCATIONS") {
      alert("Confirmation text did not match. Deletion cancelled.");
      return;
    }

    setImporting(true);
    setError("");

    try {
      const response = await fetch("/api/import/rollback/all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirm: "DELETE_ALL_ALLOCATIONS",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Successfully deleted ${data.deletedCount} allocations`);
        setResult(null);
      } else {
        setError(data.error || "Failed to delete allocations");
      }
    } catch (err) {
      setError("Error deleting allocations");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Import Timesheet</h1>
          <p className="text-gray-600 mt-1">
            Upload monthly timesheet CSV from Zoho Projects
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-medium text-blue-900 mb-2">
            How it works:
          </h2>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Upload a CSV file exported from Zoho Projects timesheet</li>
            <li>System will automatically create missing projects under "Unknown Client"</li>
            <li>Raw daily timesheet entries are stored with task-level details</li>
            <li>Billable hours come from "Hours(For Client)" column</li>
            <li>Delete+Insert strategy: Existing entries for the period are replaced with fresh data</li>
            <li>Auto-creates contractors as employees if they don't exist in the system</li>
          </ul>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* File Upload */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Select CSV File
          </h2>
          <div className="space-y-4">
            <div>
              <input
                id="file-input"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  cursor-pointer"
              />
            </div>
            {file && (
              <div className="text-sm text-gray-600">
                Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {importing ? "Importing..." : "Import Timesheet"}
              </button>
              {session?.user?.role === "owner" && (
                <button
                  onClick={handleDeleteAll}
                  disabled={importing}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Delete All Allocations
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Import Results */}
        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Import Results
            </h2>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">
                  {result.totalRows}
                </div>
                <div className="text-sm text-gray-600">Total Rows</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-900">
                  {result.processedRows}
                </div>
                <div className="text-sm text-green-700">Processed</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-900">
                  {result.skippedRows}
                </div>
                <div className="text-sm text-yellow-700">Skipped</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-900">
                  {result.newProjects}
                </div>
                <div className="text-sm text-blue-700">New Projects</div>
              </div>
              <div className="bg-cyan-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-cyan-900">
                  {result.newContractors}
                </div>
                <div className="text-sm text-cyan-700">New Contractors</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-900">
                  {result.newAllocations}
                </div>
                <div className="text-sm text-purple-700">New Allocations</div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-indigo-900">
                  {result.updatedAllocations}
                </div>
                <div className="text-sm text-indigo-700">Updated Allocations</div>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-red-900 mb-2">
                  Errors ({result.errors.length})
                </h3>
                <div className="max-h-60 overflow-y-auto">
                  <ul className="text-sm text-red-700 space-y-1">
                    {result.errors.map((err, idx) => (
                      <li key={idx} className="font-mono text-xs">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Success Message */}
            {result.errors.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-700">
                  ✓ Import completed successfully with no errors!
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
