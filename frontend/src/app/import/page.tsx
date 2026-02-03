"use client";

import { useState } from "react";

interface ImportResult {
  type: string;
  success: boolean;
  message: string;
  count?: number;
  errors?: string[];
}

export default function ImportPage() {
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [timesheetFile, setTimesheetFile] = useState<File | null>(null);
  const [allocationFile, setAllocationFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (type === "timesheet") {
      setTimesheetFile(file);
    } else if (type === "allocation") {
      setAllocationFile(file);
    }
    setImportResult(null);
  };

  const handleImport = async (type: string) => {
    const file = type === "timesheet" ? timesheetFile : allocationFile;
    if (!file) return;

    setUploading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const response = await fetch("/api/import/timesheet", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Backend returns stats.newEntries for timesheet imports
        const count = data.stats?.newEntries || data.count;
        setImportResult({
          type,
          success: true,
          message: `Successfully imported ${count} ${type} records`,
          count: count,
        });
        // Clear the file after successful import
        if (type === "timesheet") {
          setTimesheetFile(null);
        } else {
          setAllocationFile(null);
        }
      } else {
        setImportResult({
          type,
          success: false,
          message: data.error || `Failed to import ${type}`,
          errors: data.errors,
        });
      }
    } catch (error: any) {
      setImportResult({
        type,
        success: false,
        message: error.message || `Error importing ${type}`,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Import Data</h1>
          <p className="mt-1 text-sm text-gray-600">
            Upload CSV or Excel files to import timesheet and allocation data
          </p>
        </div>

        {/* Import Result Message */}
        {importResult && (
          <div
            className={`mb-6 rounded-lg border p-4 ${
              importResult.success
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-start">
              {importResult.success ? (
                <svg
                  className="h-5 w-5 text-green-600 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 text-red-600 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <div className="flex-1">
                <p
                  className={`font-medium ${
                    importResult.success ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {importResult.message}
                </p>
                {importResult.errors && importResult.errors.length > 0 && (
                  <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                    {importResult.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => setImportResult(null)}
                className={`${
                  importResult.success
                    ? "text-green-700 hover:text-green-900"
                    : "text-red-700 hover:text-red-900"
                }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Import Cards */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Timesheet Import */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-8 w-8 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Timesheet Data</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Import employee timesheets with hours logged per project
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="sr-only">Choose file</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => handleFileSelect(e, "timesheet")}
                  disabled={uploading}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100
                    disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>
              {timesheetFile && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm text-blue-800 font-medium">{timesheetFile.name}</span>
                  </div>
                  <button
                    onClick={() => setTimesheetFile(null)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                onClick={() => handleImport("timesheet")}
                disabled={!timesheetFile || uploading}
                className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
              >
                {uploading ? "Importing..." : "Import Timesheet Data"}
              </button>
              <p className="text-xs text-gray-500">
                CSV or Excel format. Expected columns: Employee, Project, Date, Hours
              </p>
            </div>
          </div>

          {/* Allocation Import */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Allocations</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Import planned employee allocations to projects
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="sr-only">Choose file</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => handleFileSelect(e, "allocation")}
                  disabled={uploading}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-green-50 file:text-green-700
                    hover:file:bg-green-100
                    disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>
              {allocationFile && (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-md">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm text-green-800 font-medium">{allocationFile.name}</span>
                  </div>
                  <button
                    onClick={() => setAllocationFile(null)}
                    className="text-green-600 hover:text-green-800"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                onClick={() => handleImport("allocation")}
                disabled={!allocationFile || uploading}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
              >
                {uploading ? "Importing..." : "Import Allocation Data"}
              </button>
              <p className="text-xs text-gray-500">
                CSV or Excel format. Expected columns: Employee, Project, Start Date, End Date, Allocation %
              </p>
            </div>
          </div>

          {/* Future: Expense Import */}
          <div className="bg-white rounded-lg shadow p-6 opacity-50">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-8 w-8 text-orange-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Project Expenses</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Import project-specific expenses and costs
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                disabled
                className="w-full py-2 px-4 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed"
              >
                Coming Soon
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Manual expense import will be available soon. Use Zoho Books sync for now.
              </p>
            </div>
          </div>

          {/* Future: Invoice Import */}
          <div className="bg-white rounded-lg shadow p-6 opacity-50">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-8 w-8 text-purple-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Import client invoices and revenue data
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                disabled
                className="w-full py-2 px-4 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed"
              >
                Coming Soon
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Manual invoice import will be available soon. Use Zoho Books sync for now.
              </p>
            </div>
          </div>
        </div>

        {/* Instructions Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">Import Guidelines</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
            <div>
              <h4 className="font-medium mb-2">File Format</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Supported formats: CSV, Excel (.xlsx, .xls)</li>
                <li>UTF-8 encoding recommended for CSV</li>
                <li>First row should contain column headers</li>
                <li>Date format: YYYY-MM-DD or DD/MM/YYYY</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Data Validation</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Employee names must match existing records</li>
                <li>Project names must match existing projects</li>
                <li>Hours must be positive numbers</li>
                <li>Allocation percentages: 0-100</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
