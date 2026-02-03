"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface PodMember {
  id: string;
  person: {
    id: string;
    name: string;
    employee_code: string;
  };
  start_date: string;
  end_date: string | null;
  allocation_pct: number;
}

interface PodProject {
  id: string;
  project: {
    id: string;
    name: string;
    client: {
      id: string;
      name: string;
    };
  };
  start_date: string;
  end_date: string | null;
}

interface PodDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  leader: {
    id: string;
    name: string;
    employee_code: string;
  };
  active_members: PodMember[];
  historical_members: PodMember[];
  active_projects: PodProject[];
  historical_projects: PodProject[];
  created_at: string;
}

export default function PodDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [pod, setPod] = useState<PodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistoricalMembers, setShowHistoricalMembers] = useState(false);
  const [showHistoricalProjects, setShowHistoricalProjects] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchPod();
    }
  }, [params.id]);

  const fetchPod = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/pods/${params.id}`);
      if (!res.ok) throw new Error("Failed to fetch pod");
      const data = await res.json();
      setPod(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch pod");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = (personId: string, personName: string) => {
    setMemberToRemove({ id: personId, name: personName });
    setShowRemoveMemberModal(true);
  };

  const handleRemoveProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Remove ${projectName} from this pod?`)) return;

    try {
      const res = await fetch(`/api/pods/${params.id}/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove project");
      }

      fetchPod();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove project");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !pod) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error || "Pod not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/pods")}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back to Pods
          </button>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{pod.name}</h1>
                <span
                  className={`px-3 py-1 text-sm font-medium rounded-full ${
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
                <p className="text-gray-600">{pod.description}</p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                Leader: {pod.leader.name} ({pod.leader.employee_code})
              </p>
            </div>
            <button
              onClick={() => router.push(`/pods/${pod.id}/edit`)}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Edit Pod
            </button>
          </div>
        </div>

        {/* Current Members */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Current Members ({pod.active_members.length})
            </h2>
            <button
              onClick={() => setShowAddMemberModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              + Add Member
            </button>
          </div>
          <div className="overflow-x-auto">
            {pod.active_members.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No active members
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Employee Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Start Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Allocation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pod.active_members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.person.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.person.employee_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(member.start_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.allocation_pct}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() =>
                            handleRemoveMember(
                              member.person.id,
                              member.person.name
                            )
                          }
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Historical Members */}
        {pod.historical_members.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <button
              onClick={() => setShowHistoricalMembers(!showHistoricalMembers)}
              className="w-full px-6 py-4 text-left flex justify-between items-center"
            >
              <h2 className="text-xl font-semibold text-gray-900">
                Historical Members ({pod.historical_members.length})
              </h2>
              <span className="text-gray-500">
                {showHistoricalMembers ? "▼" : "▶"}
              </span>
            </button>
            {showHistoricalMembers && (
              <div className="overflow-x-auto border-t border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        End Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Allocation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pod.historical_members.map((member) => (
                      <tr key={member.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {member.person.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {new Date(member.start_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {member.end_date
                            ? new Date(member.end_date).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {member.allocation_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Current Projects */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Current Projects ({pod.active_projects.length})
            </h2>
            <button
              onClick={() => setShowAddProjectModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              + Add Project
            </button>
          </div>
          <div className="overflow-x-auto">
            {pod.active_projects.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No active projects
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Project Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Start Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pod.active_projects.map((proj) => (
                    <tr key={proj.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {proj.project.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {proj.project.client.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(proj.start_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() =>
                            handleRemoveProject(
                              proj.project.id,
                              proj.project.name
                            )
                          }
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Historical Projects */}
        {pod.historical_projects.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <button
              onClick={() =>
                setShowHistoricalProjects(!showHistoricalProjects)
              }
              className="w-full px-6 py-4 text-left flex justify-between items-center"
            >
              <h2 className="text-xl font-semibold text-gray-900">
                Historical Projects ({pod.historical_projects.length})
              </h2>
              <span className="text-gray-500">
                {showHistoricalProjects ? "▼" : "▶"}
              </span>
            </button>
            {showHistoricalProjects && (
              <div className="overflow-x-auto border-t border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Project Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Client
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        End Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pod.historical_projects.map((proj) => (
                      <tr key={proj.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {proj.project.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {proj.project.client.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {new Date(proj.start_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {proj.end_date
                            ? new Date(proj.end_date).toLocaleDateString()
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modals */}
        {showAddMemberModal && (
          <AddMemberModal
            podId={pod.id}
            onClose={() => setShowAddMemberModal(false)}
            onSuccess={() => {
              setShowAddMemberModal(false);
              fetchPod();
            }}
          />
        )}

        {showAddProjectModal && (
          <AddProjectModal
            podId={pod.id}
            onClose={() => setShowAddProjectModal(false)}
            onSuccess={() => {
              setShowAddProjectModal(false);
              fetchPod();
            }}
          />
        )}

        {showRemoveMemberModal && memberToRemove && (
          <RemoveMemberModal
            podId={pod.id}
            personId={memberToRemove.id}
            personName={memberToRemove.name}
            onClose={() => {
              setShowRemoveMemberModal(false);
              setMemberToRemove(null);
            }}
            onSuccess={() => {
              setShowRemoveMemberModal(false);
              setMemberToRemove(null);
              fetchPod();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface AddMemberModalProps {
  podId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddMemberModal({ podId, onClose, onSuccess }: AddMemberModalProps) {
  const [personId, setPersonId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [allocationPct, setAllocationPct] = useState("100");
  const [people, setPeople] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

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
    setWarning(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/pods/${podId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: personId,
          start_date: startDate,
          allocation_pct: parseInt(allocationPct),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add member");
      }

      if (data.warning) {
        setWarning(data.warning);
        setTimeout(() => onSuccess(), 2000);
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Member</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {warning && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-yellow-800 text-sm">{warning}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Person *
            </label>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select Person</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} ({person.employee_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Allocation % *
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={allocationPct}
              onChange={(e) => setAllocationPct(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Percentage of time allocated to this pod (0-100)
            </p>
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
              {saving ? "Adding..." : "Add Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddProjectModalProps {
  podId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddProjectModal({ podId, onClose, onSuccess }: AddProjectModalProps) {
  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/pods/${podId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          start_date: startDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add project");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Project</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project *
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} - {project.client?.name || "No Client"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
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
              {saving ? "Adding..." : "Add Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RemoveMemberModalProps {
  podId: string;
  personId: string;
  personName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function RemoveMemberModal({ podId, personId, personName, onClose, onSuccess }: RemoveMemberModalProps) {
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(
        `/api/pods/${podId}/members/${personId}?end_date=${endDate}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove member");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Remove Member</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <p className="text-gray-700 mb-4">
          Remove <strong>{personName}</strong> from this pod?
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date *
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              The last day this person was a member of the pod
            </p>
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
              className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
            >
              {saving ? "Removing..." : "Remove Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
