"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Pod {
  id: string;
  name: string;
  description: string | null;
  status: string;
  leader: {
    id: string;
    name: string;
    employee_code: string;
  };
  member_count: number;
  active_project_count: number;
  created_at: string;
}

export default function PodsPage() {
  const router = useRouter();
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchPods();
  }, [statusFilter]);

  const fetchPods = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      params.append("include_members", "false");
      params.append("include_projects", "false");

      const res = await fetch(`/api/pods?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch pods");
      const data = await res.json();
      setPods(data.pods);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pods");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Financial Pods</h1>
            <p className="text-gray-600 mt-2">
              Manage financial pods for cost allocation and billing
            </p>
          </div>
          <div className="flex gap-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + Create Pod
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Pods List */}
        {pods.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg mb-4">No pods found</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create First Pod
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {pods.map((pod) => (
              <div
                key={pod.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {pod.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          pod.status === "active"
                            ? "bg-green-100 text-green-800"
                            : pod.status === "inactive"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {pod.status}
                      </span>
                    </div>
                    {pod.description && (
                      <p className="text-gray-600 mb-3">{pod.description}</p>
                    )}
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Leader:</span>{" "}
                        {pod.leader.name} ({pod.leader.employee_code})
                      </div>
                      <div>
                        <span className="font-medium">{pod.member_count}</span>{" "}
                        Members
                      </div>
                      <div>
                        <span className="font-medium">
                          {pod.active_project_count}
                        </span>{" "}
                        Projects
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/pods/${pod.id}`)}
                      className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => router.push(`/pods/${pod.id}/edit`)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-md"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Pod Modal */}
        {showCreateModal && (
          <CreatePodModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              fetchPods();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface CreatePodModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreatePodModal({ onClose, onSuccess }: CreatePodModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [status, setStatus] = useState("active");
  const [people, setPeople] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPeople();
  }, []);

  const fetchPeople = async () => {
    try {
      const res = await fetch("/api/people");
      if (!res.ok) throw new Error("Failed to fetch people");
      const data = await res.json();
      setPeople(data.people || []);
    } catch (err) {
      console.error("Error fetching people:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/pods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          leader_id: leaderId,
          status,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create pod");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pod");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Pod</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pod Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g., Cloud Infrastructure Pod"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pod Leader *
            </label>
            <select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select Leader</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.employee_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? "Creating..." : "Create Pod"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
