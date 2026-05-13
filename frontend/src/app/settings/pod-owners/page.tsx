"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface PodOwnerNode {
  id: string;
  person_id: string;
  parent_id: string | null;
  name: string;
  start_date: string;
  end_date: string | null;
  person: { id: string; name: string; employee_code: string };
  pods: { id: string; name: string; status: string }[];
  children?: PodOwnerNode[];
}

interface Person {
  id: string;
  name: string;
  employee_code: string;
}

export default function PodOwnersPage() {
  const { data: session } = useSession();
  const [owners, setOwners] = useState<PodOwnerNode[]>([]);
  const [flatOwners, setFlatOwners] = useState<PodOwnerNode[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOwner, setEditingOwner] = useState<PodOwnerNode | null>(null);
  const [showHistorical, setShowHistorical] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPersonId, setFormPersonId] = useState("");
  const [formParentId, setFormParentId] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOwners();
    fetchPeople();
  }, [showHistorical]);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      const activeParam = showHistorical ? "false" : "true";
      const [treeRes, flatRes] = await Promise.all([
        fetch(`/api/pod-owners?format=tree&active_only=${activeParam}`),
        fetch(`/api/pod-owners?active_only=${activeParam}`),
      ]);
      if (!treeRes.ok || !flatRes.ok) throw new Error("Failed to fetch");
      const treeData = await treeRes.json();
      const flatData = await flatRes.json();
      setOwners(treeData.owners);
      setFlatOwners(flatData.owners);
    } catch (err) {
      setError("Failed to fetch pod owners");
    } finally {
      setLoading(false);
    }
  };

  const fetchPeople = async () => {
    try {
      const res = await fetch("/api/people");
      if (!res.ok) throw new Error("Failed to fetch people");
      const data = await res.json();
      setPeople(data.people || data);
    } catch (err) {
      console.error("Error fetching people:", err);
    }
  };

  const openCreateModal = (parentId?: string) => {
    setEditingOwner(null);
    setFormName("");
    setFormPersonId("");
    setFormParentId(parentId || "");
    setFormStartDate(new Date().toISOString().substring(0, 10));
    setFormEndDate("");
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (owner: PodOwnerNode) => {
    setEditingOwner(owner);
    setFormName(owner.name);
    setFormPersonId(owner.person_id);
    setFormParentId(owner.parent_id || "");
    setFormStartDate(owner.start_date.substring(0, 10));
    setFormEndDate(owner.end_date ? owner.end_date.substring(0, 10) : "");
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName || !formPersonId || !formStartDate) {
      setError("Name, person, and start date are required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const body: any = {
        name: formName,
        person_id: formPersonId,
        parent_id: formParentId || null,
        start_date: formStartDate,
        end_date: formEndDate || null,
      };

      const url = editingOwner
        ? `/api/pod-owners/${editingOwner.id}`
        : "/api/pod-owners";
      const method = editingOwner ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setShowModal(false);
      fetchOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pod owner node?")) return;

    try {
      const res = await fetch(`/api/pod-owners/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      fetchOwners();
    } catch (err) {
      alert("Failed to delete pod owner");
    }
  };

  const renderTree = (nodes: PodOwnerNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`flex items-center justify-between p-3 border-b border-gray-100 hover:bg-gray-50 ${
            node.end_date ? "opacity-60" : ""
          }`}
          style={{ paddingLeft: `${depth * 32 + 16}px` }}
        >
          <div className="flex items-center gap-3">
            {depth > 0 && (
              <span className="text-gray-400 text-sm">└─</span>
            )}
            <div>
              <div className="font-medium text-gray-900">{node.name}</div>
              <div className="text-sm text-gray-500">
                {node.person.name} ({node.person.employee_code})
              </div>
              <div className="text-xs text-gray-400">
                {new Date(node.start_date).toLocaleDateString()}
                {node.end_date && ` – ${new Date(node.end_date).toLocaleDateString()}`}
                {!node.end_date && " – present"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {node.pods.length > 0 && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                {node.pods.length} pod{node.pods.length !== 1 ? "s" : ""}
              </span>
            )}
            {!node.end_date && (
              <button
                onClick={() => openCreateModal(node.id)}
                className="text-green-600 hover:text-green-800 text-sm"
                title="Add child owner"
              >
                + Child
              </button>
            )}
            <button
              onClick={() => openEditModal(node)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(node.id)}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Delete
            </button>
          </div>
        </div>
        {node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
      </div>
    ));
  };

  if (session?.user?.role !== "owner" && session?.user?.role !== "finance") {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Access denied. Only owners and finance can manage pod owners.</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Pod Owners</h1>
            <p className="text-gray-600 mt-1">Manage the pod ownership hierarchy</p>
          </div>
          <button
            onClick={() => openCreateModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + Add Owner
          </button>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showHistorical}
              onChange={(e) => setShowHistorical(e.target.checked)}
              className="rounded"
            />
            Show historical (inactive) owners
          </label>
        </div>

        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : owners.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No pod owners configured. Click &quot;+ Add Owner&quot; to create the first one.
            </div>
          ) : (
            renderTree(owners)
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingOwner ? "Edit Pod Owner" : "Add Pod Owner"}
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Piyush's Group"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Person</label>
                  <select
                    value={formPersonId}
                    onChange={(e) => setFormPersonId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select Person</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.employee_code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Owner</label>
                  <select
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">None (top-level)</option>
                    {flatOwners
                      .filter((o) => o.id !== editingOwner?.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.person.name})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Leave empty for active"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? "Saving..." : editingOwner ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
