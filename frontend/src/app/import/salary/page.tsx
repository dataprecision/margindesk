"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import Link from "next/link";

interface ImportStats {
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  newRecords: number;
  updatedRecords: number;
  newEmployees: number;
  errors: string[];
  month: string;
}

export default function SalaryImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportStats | null>(null);
  const [error, setError] = useState("");

  // Set default month to current month
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthNum = String(now.getMonth() + 1).padStart(2, "0");
    setMonth(`${year}-${monthNum}`);
  }, []);

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
              Access denied. Only owners and finance can import salaries.
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

    if (!month) {
      setError("Please select a month");
      return;
    }

    setImporting(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("month", month);

      const response = await fetch("/api/import/salary", {
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
        setError(data.error || "Failed to import salaries");
      }
    } catch (err) {
      setError("Error importing salaries");
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
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-gray-900">Import Salaries</h1>
            <Link
              href="/people"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ← Back to People
            </Link>
          </div>
          <p className="text-sm text-gray-600">
            Upload employee salary data from CSV file
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-medium text-blue-900 mb-2">
            How it works:
          </h2>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Upload a CSV file with columns: Emp Code, Name, Salary Amount</li>
            <li>Third column can have any name (e.g., "Sep-25")</li>
            <li>Select the month for which these salaries apply</li>
            <li>System matches employees by their employee code</li>
            <li>Auto-creates employees if they don't exist in the system</li>
            <li>Upsert strategy: Updates existing salary records or creates new ones</li>
            <li>Salary amounts can include currency symbols (₹, $) and commas</li>
            <li>Empty or dash (-) salary values are skipped</li>
          </ul>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Import Form */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CSV File</h2>

          <div className="space-y-4">
            {/* Month Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Salary Month *
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                disabled={importing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Select the month for which these salaries apply
              </p>
            </div>

            {/* File Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CSV File *
              </label>
              <input
                id="file-input"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={importing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {file && (
                <p className="mt-2 text-sm text-green-600">
                  Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            {/* Import Button */}
            <button
              onClick={handleImport}
              disabled={!file || !month || importing}
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {importing ? "Importing..." : "Import Salaries"}
            </button>
          </div>
        </div>

        {/* Result Summary */}
        {result && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Import Results - {result.month}
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Rows</p>
                <p className="text-2xl font-bold text-gray-900">{result.totalRows}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600">Processed</p>
                <p className="text-2xl font-bold text-green-900">{result.processedRows}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600">New</p>
                <p className="text-2xl font-bold text-blue-900">{result.newRecords}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600">Updated</p>
                <p className="text-2xl font-bold text-purple-900">{result.updatedRecords}</p>
              </div>
              <div className="bg-cyan-50 p-4 rounded-lg">
                <p className="text-sm text-cyan-600">New Employees</p>
                <p className="text-2xl font-bold text-cyan-900">{result.newEmployees}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-sm text-orange-600">Skipped</p>
                <p className="text-2xl font-bold text-orange-900">{result.skippedRows}</p>
              </div>
            </div>

            {/* Errors */}
            {result.errors && result.errors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Errors ({result.errors.length}):
                </h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <ul className="text-sm text-red-800 space-y-1">
                    {result.errors.slice(0, 50).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {result.errors.length > 50 && (
                      <li className="text-red-600 font-medium">
                        ... and {result.errors.length - 50} more errors
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* Success Message */}
            {result.errors.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  ✅ All salary records imported successfully!
                </p>
              </div>
            )}
          </div>
        )}

        {/* CSV Format Example */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            CSV Format Example:
          </h3>
          <pre className="text-xs text-gray-700 bg-white p-3 rounded border border-gray-300 overflow-x-auto">
{`Emp Code,Name,Sep-25
E001,John Doe,50000
E002,Jane Smith,65000
E003,Bob Johnson,55500`}
          </pre>
        </div>
      </div>
    </div>
  );
}
