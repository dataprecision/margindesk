"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  client: {
    id: string;
    name: string;
  };
  config?: ProjectConfig;
}

interface ProjectConfig {
  id: string;
  project_id: string;
  project_type: "hourly_blended" | "hourly_resource_based";
  billing_model: "time_and_material";
  rate_type: "blended" | "role_based";
  blended_rate?: number;
  rate_card?: Record<string, number>;
  currency: string;
  billing_frequency: string;
  hours_cap?: number;
  hours_cap_per_role?: Record<string, number>;
  overage_policy: "billable" | "absorbed";
  po_amount?: number;
  po_valid_from?: string;
  po_valid_to?: string;
}

interface RoleRate {
  role: string;
  rate: string;
}

interface RoleHoursCap {
  role: string;
  hours: string;
}

export default function ProjectConfigPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [projectType, setProjectType] = useState<"hourly_blended" | "hourly_resource_based">("hourly_blended");
  const [blendedRate, setBlendedRate] = useState("");
  const [roleRates, setRoleRates] = useState<RoleRate[]>([{ role: "", rate: "" }]);
  const [currency, setCurrency] = useState("INR");
  const [billingFrequency, setBillingFrequency] = useState("monthly");
  const [hoursCap, setHoursCap] = useState("");
  const [roleHoursCaps, setRoleHoursCaps] = useState<RoleHoursCap[]>([]);
  const [overagePolicy, setOveragePolicy] = useState<"billable" | "absorbed">("billable");
  const [poAmount, setPoAmount] = useState("");
  const [poValidFrom, setPoValidFrom] = useState("");
  const [poValidTo, setPoValidTo] = useState("");

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
              Access denied. Only owners and finance can configure projects.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fetch project and existing config
  useEffect(() => {
    if (status === "authenticated" && projectId) {
      fetchProject();
    }
  }, [status, projectId]);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data);

        // Load existing config if available
        if (data.config) {
          const config = data.config;
          setProjectType(config.project_type);
          setCurrency(config.currency || "INR");
          setBillingFrequency(config.billing_frequency || "monthly");
          setHoursCap(config.hours_cap?.toString() || "");
          setOveragePolicy(config.overage_policy || "billable");
          setPoAmount(config.po_amount?.toString() || "");
          setPoValidFrom(config.po_valid_from ? new Date(config.po_valid_from).toISOString().split('T')[0] : "");
          setPoValidTo(config.po_valid_to ? new Date(config.po_valid_to).toISOString().split('T')[0] : "");

          if (config.project_type === "hourly_blended") {
            setBlendedRate(config.blended_rate?.toString() || "");
          } else {
            // Load rate card
            if (config.rate_card) {
              const rates = Object.entries(config.rate_card).map(([role, rate]) => ({
                role,
                rate: rate.toString(),
              }));
              setRoleRates(rates.length > 0 ? rates : [{ role: "", rate: "" }]);
            }

            // Load hours cap per role
            if (config.hours_cap_per_role) {
              const caps = Object.entries(config.hours_cap_per_role).map(([role, hours]) => ({
                role,
                hours: hours.toString(),
              }));
              setRoleHoursCaps(caps);
            }
          }
        }
      } else {
        setError("Failed to fetch project");
      }
    } catch (err) {
      console.error("Error fetching project:", err);
      setError("Error loading project");
    } finally {
      setLoading(false);
    }
  };

  const addRoleRate = () => {
    setRoleRates([...roleRates, { role: "", rate: "" }]);
  };

  const removeRoleRate = (index: number) => {
    setRoleRates(roleRates.filter((_, i) => i !== index));
  };

  const updateRoleRate = (index: number, field: "role" | "rate", value: string) => {
    const updated = [...roleRates];
    updated[index][field] = value;
    setRoleRates(updated);
  };

  const addRoleHoursCap = () => {
    setRoleHoursCaps([...roleHoursCaps, { role: "", hours: "" }]);
  };

  const removeRoleHoursCap = (index: number) => {
    setRoleHoursCaps(roleHoursCaps.filter((_, i) => i !== index));
  };

  const updateRoleHoursCap = (index: number, field: "role" | "hours", value: string) => {
    const updated = [...roleHoursCaps];
    updated[index][field] = value;
    setRoleHoursCaps(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const configData: any = {
        project_type: projectType,
        billing_model: "time_and_material",
        rate_type: projectType === "hourly_blended" ? "blended" : "role_based",
        currency,
        billing_frequency: billingFrequency,
        overage_policy: overagePolicy,
      };

      // Add rate information
      if (projectType === "hourly_blended") {
        if (!blendedRate) {
          setError("Blended rate is required");
          setSaving(false);
          return;
        }
        configData.blended_rate = parseFloat(blendedRate);
      } else {
        // Build rate card
        const rateCard: Record<string, number> = {};
        for (const rr of roleRates) {
          if (rr.role && rr.rate) {
            rateCard[rr.role] = parseFloat(rr.rate);
          }
        }
        if (Object.keys(rateCard).length === 0) {
          setError("At least one role with rate is required");
          setSaving(false);
          return;
        }
        configData.rate_card = rateCard;

        // Build hours cap per role if specified
        if (roleHoursCaps.length > 0) {
          const capsObj: Record<string, number> = {};
          for (const cap of roleHoursCaps) {
            if (cap.role && cap.hours) {
              capsObj[cap.role] = parseInt(cap.hours);
            }
          }
          if (Object.keys(capsObj).length > 0) {
            configData.hours_cap_per_role = capsObj;
          }
        }
      }

      // Add optional fields
      if (hoursCap) {
        configData.hours_cap = parseInt(hoursCap);
      }
      if (poAmount) {
        configData.po_amount = parseFloat(poAmount);
      }
      if (poValidFrom) {
        configData.po_valid_from = poValidFrom;
      }
      if (poValidTo) {
        configData.po_valid_to = poValidTo;
      }

      const response = await fetch(`/api/projects/${projectId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configData),
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess("Project configuration saved successfully!");
        // Refresh project data
        fetchProject();
      } else {
        setError(result.error || "Failed to save configuration");
      }
    } catch (err) {
      console.error("Error saving config:", err);
      setError("Error saving configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this configuration?")) {
      return;
    }

    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/config`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess("Configuration deleted successfully!");
        // Reset form
        setProjectType("hourly_blended");
        setBlendedRate("");
        setRoleRates([{ role: "", rate: "" }]);
        setRoleHoursCaps([]);
        setHoursCap("");
        setPoAmount("");
        setPoValidFrom("");
        setPoValidTo("");
        // Refresh project
        fetchProject();
      } else {
        setError(result.error || "Failed to delete configuration");
      }
    } catch (err) {
      console.error("Error deleting config:", err);
      setError("Error deleting configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-red-600">Project not found</p>
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
            <h1 className="text-2xl font-bold text-gray-900">
              Configure Project: {project.name}
            </h1>
            <Link
              href="/projects"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ← Back to Projects
            </Link>
          </div>
          <p className="text-sm text-gray-600">
            Client: {project.client.name}
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
          {/* Project Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Type *
            </label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value as "hourly_blended" | "hourly_resource_based")}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="hourly_blended">Hourly Blended (Single Rate)</option>
              <option value="hourly_resource_based">Hourly Resource-Based (Role-Based Rates)</option>
            </select>
          </div>

          {/* Blended Rate (for hourly_blended) */}
          {projectType === "hourly_blended" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Blended Rate *
              </label>
              <input
                type="number"
                step="0.01"
                value={blendedRate}
                onChange={(e) => setBlendedRate(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 1500"
                required
              />
            </div>
          )}

          {/* Role-Based Rates (for hourly_resource_based) */}
          {projectType === "hourly_resource_based" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rate Card (Role-Based Rates) *
              </label>
              <div className="space-y-2">
                {roleRates.map((rr, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={rr.role}
                      onChange={(e) => updateRoleRate(index, "role", e.target.value)}
                      disabled={saving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Role name (e.g., Analyst)"
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={rr.rate}
                      onChange={(e) => updateRoleRate(index, "rate", e.target.value)}
                      disabled={saving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Rate (e.g., 1000)"
                      required
                    />
                    {roleRates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRoleRate(index)}
                        disabled={saving}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addRoleRate}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50"
                >
                  + Add Role
                </button>
              </div>
            </div>
          )}

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Currency *
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          {/* Billing Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Billing Frequency *
            </label>
            <select
              value={billingFrequency}
              onChange={(e) => setBillingFrequency(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>

          {/* Hours Cap */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hours Cap (Optional)
            </label>
            <input
              type="number"
              value={hoursCap}
              onChange={(e) => setHoursCap(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., 500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Maximum hours for the project
            </p>
          </div>

          {/* Hours Cap Per Role (for resource-based only) */}
          {projectType === "hourly_resource_based" && roleHoursCaps.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hours Cap Per Role (Optional)
              </label>
              <div className="space-y-2">
                {roleHoursCaps.map((cap, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={cap.role}
                      onChange={(e) => updateRoleHoursCap(index, "role", e.target.value)}
                      disabled={saving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Role name"
                    />
                    <input
                      type="number"
                      value={cap.hours}
                      onChange={(e) => updateRoleHoursCap(index, "hours", e.target.value)}
                      disabled={saving}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Hours (e.g., 200)"
                    />
                    <button
                      type="button"
                      onClick={() => removeRoleHoursCap(index)}
                      disabled={saving}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {projectType === "hourly_resource_based" && (
            <button
              type="button"
              onClick={addRoleHoursCap}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50"
            >
              + Add Role Hours Cap
            </button>
          )}

          {/* Overage Policy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Overage Policy *
            </label>
            <select
              value={overagePolicy}
              onChange={(e) => setOveragePolicy(e.target.value as "billable" | "absorbed")}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="billable">Billable (charge for extra hours)</option>
              <option value="absorbed">Absorbed (no charge for extra hours)</option>
            </select>
          </div>

          {/* PO Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PO Amount (Optional)
            </label>
            <input
              type="number"
              step="0.01"
              value={poAmount}
              onChange={(e) => setPoAmount(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., 1500000"
            />
          </div>

          {/* PO Valid From/To */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PO Valid From (Optional)
              </label>
              <input
                type="date"
                value={poValidFrom}
                onChange={(e) => setPoValidFrom(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PO Valid To (Optional)
              </label>
              <input
                type="date"
                value={poValidTo}
                onChange={(e) => setPoValidTo(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>

            {project.config && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="px-6 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Delete Configuration
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
