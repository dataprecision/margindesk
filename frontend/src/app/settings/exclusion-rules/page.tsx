"use client";

import { useState, useEffect } from "react";
import { type ExclusionRule } from "@/lib/exclusion-rules";

// Available fields for rule creation
const AVAILABLE_FIELDS = [
  { value: "account_name", label: "Account Name", description: "Expense account name from Zoho Books" },
  { value: "description", label: "Description", description: "Expense description text" },
  { value: "customer_name", label: "Customer Name", description: "Associated customer name" },
  { value: "amount", label: "Amount", description: "Expense amount (numeric)" },
  { value: "notes", label: "Notes", description: "Additional notes on the expense" },
] as const;

// Available operators
const AVAILABLE_OPERATORS = [
  { value: "equals", label: "equals", description: "Exact match (case-insensitive)" },
  { value: "contains", label: "contains", description: "Text contains substring" },
  { value: "starts_with", label: "starts with", description: "Text starts with prefix" },
  { value: "ends_with", label: "ends with", description: "Text ends with suffix" },
  { value: "greater_than", label: "greater than", description: "Number is greater than value" },
  { value: "less_than", label: "less than", description: "Number is less than value" },
] as const;

export default function ExclusionRulesPage() {
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    field: "account_name" as ExclusionRule["field"],
    operator: "equals" as ExclusionRule["operator"],
    value: "",
    reason: "",
  });

  // Fetch rules from API
  const fetchRules = async () => {
    try {
      const response = await fetch("/api/exclusion-rules");
      const data = await response.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error("Failed to fetch exclusion rules:", error);
      alert("Failed to load exclusion rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const toggleRule = async (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    try {
      await fetch(`/api/exclusion-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      fetchRules(); // Refresh from server
    } catch (error) {
      alert("Failed to update rule");
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    try {
      await fetch(`/api/exclusion-rules/${ruleId}`, {
        method: "DELETE",
      });
      fetchRules(); // Refresh from server
    } catch (error) {
      alert("Failed to delete rule");
    }
  };

  const addRule = async () => {
    if (!newRule.name || !newRule.value || !newRule.reason) {
      alert("Please fill in all required fields (Name, Value, Reason)");
      return;
    }

    try {
      await fetch("/api/exclusion-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRule.name,
          description: newRule.description || null,
          field: newRule.field,
          operator: newRule.operator,
          value: newRule.value,
          reason: newRule.reason,
        }),
      });

      setNewRule({
        name: "",
        description: "",
        field: "account_name",
        operator: "equals",
        value: "",
        reason: "",
      });
      setShowAddForm(false);
      fetchRules(); // Refresh from server
    } catch (error) {
      alert("Failed to create rule");
    }
  };

  const getOperatorLabel = (operator: string) => {
    const labels: Record<string, string> = {
      equals: "equals",
      contains: "contains",
      starts_with: "starts with",
      ends_with: "ends with",
      greater_than: "greater than",
      less_than: "less than",
    };
    return labels[operator] || operator;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="text-gray-600">Loading exclusion rules...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Expense Exclusion Rules</h1>
        <p className="text-gray-600">
          Configure which expenses are automatically excluded from margin calculations during sync from Zoho Books.
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">ℹ️ How Exclusion Rules Work</h3>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>Rules are checked when expenses are synced from Zoho Books</li>
          <li>If an expense matches any <strong>enabled</strong> rule, it will be auto-excluded</li>
          <li>Existing expenses with manual changes are never affected</li>
          <li>You can always manually include/exclude individual expenses</li>
        </ul>
      </div>

      {/* Add New Rule Button */}
      <div className="mb-4">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add New Rule"}
        </button>
      </div>

      {/* Add New Rule Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create New Exclusion Rule</h2>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                placeholder="e.g., Software Subscriptions"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={newRule.description}
                onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                placeholder="Brief description of what this rule does"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Field Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Field to Check <span className="text-red-500">*</span>
              </label>
              <select
                value={newRule.field}
                onChange={(e) => setNewRule({ ...newRule, field: e.target.value as ExclusionRule["field"] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {AVAILABLE_FIELDS.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label} - {field.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Operator Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condition <span className="text-red-500">*</span>
              </label>
              <select
                value={newRule.operator}
                onChange={(e) => setNewRule({ ...newRule, operator: e.target.value as ExclusionRule["operator"] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {AVAILABLE_OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label} - {operator.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value <span className="text-red-500">*</span>
              </label>
              <input
                type={newRule.operator === "greater_than" || newRule.operator === "less_than" ? "number" : "text"}
                value={newRule.value}
                onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                placeholder={newRule.operator === "greater_than" || newRule.operator === "less_than" ? "Enter number" : "Enter text value"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Exclusion Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newRule.reason}
                onChange={(e) => setNewRule({ ...newRule, reason: e.target.value })}
                placeholder="Why should expenses matching this rule be excluded?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                onClick={addRule}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Create Rule
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h2 className="text-lg font-semibold">Active Rules ({rules.length})</h2>
        </div>

        <div className="divide-y">
          {rules.map((rule) => (
            <div key={rule.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        rule.enabled ? "bg-green-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          rule.enabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <h3 className="text-md font-semibold">{rule.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        rule.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-2">{rule.description}</p>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                      {rule.field}
                    </span>
                    <span className="text-gray-400">{getOperatorLabel(rule.operator)}</span>
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                      "{rule.value}"
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-gray-500">
                    <strong>Reason:</strong> {rule.reason}
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="ml-4 px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Success Note */}
      <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-green-800 mb-2">✅ Persistent Storage</h3>
        <p className="text-xs text-green-700">
          All rule changes are automatically saved to the database and will persist across sessions.
          Rules are applied during expense sync from Zoho Books.
        </p>
      </div>

      {/* Back Button */}
      <div className="mt-6">
        <a
          href="/expenses"
          className="inline-block px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          ← Back to Expenses
        </a>
      </div>
    </div>
  );
}
