"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const { data: session } = useSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formExpires, setFormExpires] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Plaintext key shown exactly once after creation
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      setError("Failed to fetch API keys");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormName("");
    setFormExpires("");
    setError(null);
    setNewKey(null);
    setCopied(false);
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      setError("Name is required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          expires_at: formExpires || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      setNewKey(data.key);
      fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (key: ApiKey) => {
    const action = key.active ? "revoke" : "re-activate";
    if (!confirm(`Are you sure you want to ${action} "${key.name}"?`)) return;
    try {
      const res = await fetch(`/api/api-keys/${key.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !key.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update");
        return;
      }
      fetchKeys();
    } catch (err) {
      alert("Failed to update key");
    }
  };

  const handleDelete = async (key: ApiKey) => {
    if (!confirm(`Permanently delete "${key.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/api-keys/${key.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      fetchKeys();
    } catch (err) {
      alert("Failed to delete key");
    }
  };

  const copyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
  };

  if (session?.user?.role !== "owner" && session?.user?.role !== "finance") {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">
              Access denied. Only owners and finance can manage API keys.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
            <p className="text-gray-600 mt-1">
              Keys for external apps to read the pod structure via{" "}
              <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">
                GET /api/external/pods-by-email
              </code>
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + New Key
          </button>
        </div>

        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <p className="font-medium mb-1">How consumers authenticate</p>
          <p>
            Send the key as a bearer token:{" "}
            <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200">
              Authorization: Bearer &lt;key&gt;
            </code>
            . Keys are stored hashed — the full value is shown only once at creation.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No API keys yet. Click &quot;+ New Key&quot; to create one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Prefix</th>
                  <th className="px-4 py-3 font-medium">Scopes</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last used</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-b border-gray-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{key.name}</div>
                      {key.created_by && (
                        <div className="text-xs text-gray-400">by {key.created_by}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{key.prefix}…</td>
                    <td className="px-4 py-3 text-gray-600">{key.scopes.join(", ")}</td>
                    <td className="px-4 py-3">
                      {key.active ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          active
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">
                          revoked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleString()
                        : "never"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {key.expires_at
                        ? new Date(key.expires_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(key)}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                      >
                        {key.active ? "Revoke" : "Re-activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(key)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
              {newKey ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">API key created</h3>
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
                    Copy this key now — it will <strong>not</strong> be shown again.
                  </div>
                  <div className="flex items-center gap-2 mb-6">
                    <code className="flex-1 px-3 py-2 bg-gray-100 rounded font-mono text-sm break-all">
                      {newKey}
                    </code>
                    <button
                      onClick={copyKey}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 whitespace-nowrap"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900"
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">New API key</h3>
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                      {error}
                    </div>
                  )}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name / consumer
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g., HR Portal"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Expires on <span className="text-gray-400">(optional)</span>
                      </label>
                      <input
                        type="date"
                        value={formExpires}
                        onChange={(e) => setFormExpires(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Scope: <code>pods:read</code>
                    </p>
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {saving ? "Creating..." : "Create"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
