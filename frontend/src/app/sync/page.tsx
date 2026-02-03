"use client";

import { useState } from "react";

interface SyncStatus {
  type: "idle" | "syncing" | "success" | "error";
  message?: string;
  count?: number;
}

export default function SyncPage() {
  const [expensesStatus, setExpensesStatus] = useState<SyncStatus>({
    type: "idle",
  });
  const [billsStatus, setBillsStatus] = useState<SyncStatus>({ type: "idle" });

  const syncExpenses = async () => {
    setExpensesStatus({ type: "syncing", message: "Syncing expenses..." });

    try {
      const response = await fetch("/api/sync/expenses", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const data = await response.json();

      setExpensesStatus({
        type: "success",
        message: `Successfully synced ${data.count} expenses`,
        count: data.count,
      });
    } catch (error) {
      setExpensesStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to sync expenses",
      });
    }
  };

  const syncBills = async () => {
    setBillsStatus({ type: "syncing", message: "Syncing bills..." });

    try {
      const response = await fetch("/api/sync/bills", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const data = await response.json();

      setBillsStatus({
        type: "success",
        message: `Successfully synced ${data.count} bills`,
        count: data.count,
      });
    } catch (error) {
      setBillsStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to sync bills",
      });
    }
  };

  const getStatusColor = (status: SyncStatus) => {
    switch (status.type) {
      case "syncing":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusIcon = (status: SyncStatus) => {
    switch (status.type) {
      case "syncing":
        return "🔄";
      case "success":
        return "✅";
      case "error":
        return "❌";
      default:
        return "⏸️";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Zoho Books Data Sync</h1>

      <div className="space-y-6">
        {/* Expenses Sync */}
        <div className="border rounded-lg p-6 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Expenses</h2>
              <p className="text-gray-600 text-sm">
                Sync expense records from Zoho Books
              </p>
            </div>
            <button
              onClick={syncExpenses}
              disabled={expensesStatus.type === "syncing"}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {expensesStatus.type === "syncing" ? "Syncing..." : "Sync Expenses"}
            </button>
          </div>

          {expensesStatus.message && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md bg-gray-50 ${getStatusColor(expensesStatus)}`}
            >
              <span className="text-xl">{getStatusIcon(expensesStatus)}</span>
              <span className="font-medium">{expensesStatus.message}</span>
            </div>
          )}
        </div>

        {/* Bills Sync */}
        <div className="border rounded-lg p-6 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Bills</h2>
              <p className="text-gray-600 text-sm">
                Sync vendor bills from Zoho Books (includes expense categories and periods)
              </p>
            </div>
            <button
              onClick={syncBills}
              disabled={billsStatus.type === "syncing"}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {billsStatus.type === "syncing" ? "Syncing..." : "Sync Bills"}
            </button>
          </div>

          {billsStatus.message && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md bg-gray-50 ${getStatusColor(billsStatus)}`}
            >
              <span className="text-xl">{getStatusIcon(billsStatus)}</span>
              <span className="font-medium">{billsStatus.message}</span>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="border rounded-lg p-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold mb-2 text-blue-900">ℹ️ About Data Sync</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Expenses: Direct expense records from Zoho Books</li>
            <li>• Bills: Vendor bills with custom fields (category, billing period)</li>
            <li>• Synced data includes filtering controls for margin calculations</li>
            <li>• Existing records are updated based on Zoho ID</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
