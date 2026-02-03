"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface PodDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  leader_id: string;
  leader: {
    id: string;
    name: string;
    employee_code: string;
  };
}

export default function EditPodPage() {
  const router = useRouter();
  const params = useParams();
  const [pod, setPod] = useState<PodDetail | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [status, setStatus] = useState("active");
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchPod();
      fetchPeople();
    }
  }, [params.id]);

  const fetchPod = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/pods/${params.id}`);
      if (!res.ok) throw new Error("Failed to fetch pod");
      const data = await res.json();
      setPod(data);
      setName(data.name);
      setDescription(data.description || "");
      setLeaderId(data.leader_id);
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pod");
    } finally {
      setLoading(false);
    }
  };

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
      const res = await fetch(`/api/pods/${params.id}`, {
        method: "PATCH",
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
        throw new Error(data.error || "Failed to update pod");
      }

      router.push(`/pods/${params.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pod");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this pod? This action cannot be undone.")) {
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/pods/${params.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete pod");
      }

      router.push("/pods");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete pod");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !pod) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push(`/pods/${params.id}`)}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back to Pod
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Edit Pod</h1>
          <p className="text-gray-600 mt-2">Update pod information</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Edit Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
                Status *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex justify-between pt-6 border-t">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
              >
                Delete Pod
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/pods/${params.id}`)}
                  disabled={saving}
                  className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
