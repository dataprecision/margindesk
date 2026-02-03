"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Client {
  id: string;
  name: string;
}

interface ProjectConfig {
  project_type?: "hourly_blended" | "hourly_resource_based" | "reselling" | "outsourcing";
  product_id?: string;
}

interface Project {
  id: string;
  client_id: string;
  name: string;
  pricing_model?: "TnM" | "Retainer" | "Milestone" | null;
  start_date: string;
  end_date: string | null;
  status: "draft" | "active" | "on_hold" | "completed" | "cancelled";
  created_at: string;
  client: Client;
  config?: ProjectConfig;
}

interface Product {
  id: string;
  name: string;
  type: string;
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPricingModel, setFilterPricingModel] = useState("");
  const [filterClient, setFilterClient] = useState("");

  // Client search state for modal
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    client_id: "",
    name: "",
    pricing_model: "" as "" | "TnM" | "Retainer" | "Milestone",
    project_type: "" as "" | "hourly_blended" | "hourly_resource_based" | "reselling" | "outsourcing",
    product_id: "",
    start_date: "",
    end_date: "",
    status: "draft" as "draft" | "active" | "on_hold" | "completed" | "cancelled",
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Fetch projects, clients, and products
  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([fetchProjects(), fetchClients(), fetchProducts()]);
    }
  }, [status]);

  // Close client dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node)
      ) {
        setShowClientDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/products");
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          end_date: formData.end_date || null,
        }),
      });

      if (response.ok) {
        const newProject = await response.json();
        setProjects([...projects, newProject]);
        setShowCreateModal(false);
        setClientSearchTerm("");
        setShowClientDropdown(false);
        setFormData({
          client_id: "",
          name: "",
          pricing_model: "",
          project_type: "",
          product_id: "",
          start_date: "",
          end_date: "",
          status: "draft",
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create project");
      }
    } catch (err) {
      setError("Error creating project");
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setFormData({
      client_id: project.client_id,
      name: project.name,
      pricing_model: project.pricing_model || "",
      project_type: project.config?.project_type || "",
      product_id: project.config?.product_id || "",
      start_date: project.start_date.split("T")[0],
      end_date: project.end_date ? project.end_date.split("T")[0] : "",
      status: project.status,
    });
    setShowEditModal(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    setError("");

    try {
      const response = await fetch(`/api/projects/${editingProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          end_date: formData.end_date || null,
        }),
      });

      if (response.ok) {
        const updatedProject = await response.json();
        setProjects(
          projects.map((p) => (p.id === updatedProject.id ? updatedProject : p))
        );
        setShowEditModal(false);
        setEditingProject(null);
        setClientSearchTerm("");
        setShowClientDropdown(false);
        setFormData({
          client_id: "",
          name: "",
          pricing_model: "",
          project_type: "",
          product_id: "",
          start_date: "",
          end_date: "",
          status: "draft",
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update project");
      }
    } catch (err) {
      setError("Error updating project");
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this project? This action cannot be undone."
      )
    ) {
      return;
    }

    setDeletingProjectId(projectId);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setProjects(projects.filter((p) => p.id !== projectId));
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to delete project");
      }
    } catch (err) {
      setError("Error deleting project");
    } finally {
      setDeletingProjectId(null);
    }
  };

  // Filter and search logic
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      searchTerm === "" ||
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.client.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === "" || project.status === filterStatus;

    const matchesPricingModel =
      filterPricingModel === "" || project.pricing_model === filterPricingModel;

    const matchesClient =
      filterClient === "" || project.client_id === filterClient;

    return matchesSearch && matchesStatus && matchesPricingModel && matchesClient;
  });

  const activeFiltersCount =
    (searchTerm ? 1 : 0) +
    (filterStatus ? 1 : 0) +
    (filterPricingModel ? 1 : 0) +
    (filterClient ? 1 : 0);

  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterStatus("");
    setFilterPricingModel("");
    setFilterClient("");
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: "bg-gray-100 text-gray-800",
      active: "bg-green-100 text-green-800",
      on_hold: "bg-yellow-100 text-yellow-800",
      completed: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${
          styles[status as keyof typeof styles]
        }`}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  const getPricingModelLabel = (model: string) => {
    const labels = {
      TnM: "Time & Materials",
      Retainer: "Retainer",
      Milestone: "Milestone",
    };
    return labels[model as keyof typeof labels];
  };

  const getProjectTypeLabel = (type?: string) => {
    if (!type) return "-";
    const labels = {
      hourly_blended: "Hourly (Blended)",
      hourly_resource_based: "Hourly (Resource Based)",
      reselling: "Reselling",
      outsourcing: "Outsourcing",
    };
    return labels[type as keyof typeof labels] || "-";
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const canEdit =
    session?.user?.role === "owner" ||
    session?.user?.role === "finance" ||
    session?.user?.role === "pm";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600 mt-1">Manage project portfolio</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Create Project
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 px-4 py-3 rounded bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {/* Search and Filter Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Project or client name..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
                <svg
                  className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Pricing Model Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pricing Model
              </label>
              <select
                value={filterPricingModel}
                onChange={(e) => setFilterPricingModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Models</option>
                <option value="TnM">Time & Materials</option>
                <option value="Retainer">Retainer</option>
                <option value="Milestone">Milestone</option>
              </select>
            </div>

            {/* Client Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client
              </label>
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filters Display */}
          {activeFiltersCount > 0 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Active filters:</span>
              {searchTerm && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center gap-1">
                  Search: "{searchTerm}"
                  <button
                    onClick={() => setSearchTerm("")}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              )}
              {filterStatus && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center gap-1">
                  Status: {filterStatus.replace("_", " ")}
                  <button
                    onClick={() => setFilterStatus("")}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              )}
              {filterPricingModel && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center gap-1">
                  Model: {getPricingModelLabel(filterPricingModel)}
                  <button
                    onClick={() => setFilterPricingModel("")}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              )}
              {filterClient && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center gap-1">
                  Client: {clients.find((c) => c.id === filterClient)?.name}
                  <button
                    onClick={() => setFilterClient("")}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Results Counter */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredProjects.length} of {projects.length} projects
          </div>
        </div>

        {/* Projects Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  End Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                {canEdit && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {project.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {project.client.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {getProjectTypeLabel(project.config?.project_type)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(project.start_date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {project.end_date
                        ? new Date(project.end_date).toLocaleDateString()
                        : "-"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(project.status)}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleEditProject(project)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        disabled={deletingProjectId === project.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {deletingProjectId === project.id ? "..." : "Delete"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProjects.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {projects.length === 0
                ? "No projects yet. Create your first project to get started."
                : "No projects match your filters."}
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || showEditModal) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-6">
                {showCreateModal ? "Create Project" : "Edit Project"}
              </h2>

              <form onSubmit={showCreateModal ? handleCreateProject : handleUpdateProject}>
                <div className="mb-4 relative" ref={clientDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        formData.client_id
                          ? clients.find((c) => c.id === formData.client_id)?.name || ""
                          : clientSearchTerm
                      }
                      onChange={(e) => {
                        setClientSearchTerm(e.target.value);
                        setShowClientDropdown(true);
                        if (!e.target.value) {
                          setFormData({ ...formData, client_id: "" });
                        }
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="Search clients..."
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <svg
                      className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  {showClientDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {clients
                        .filter((client) =>
                          client.name.toLowerCase().includes(clientSearchTerm.toLowerCase())
                        )
                        .map((client) => (
                          <div
                            key={client.id}
                            onClick={() => {
                              setFormData({ ...formData, client_id: client.id });
                              setClientSearchTerm("");
                              setShowClientDropdown(false);
                            }}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">{client.name}</div>
                            {client.billing_currency && (
                              <div className="text-xs text-gray-500">
                                Currency: {client.billing_currency}
                              </div>
                            )}
                          </div>
                        ))}
                      {clients.filter((client) =>
                        client.name.toLowerCase().includes(clientSearchTerm.toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          No clients found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Pricing Model - Hidden as per user request */}
                {/* <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pricing Model
                  </label>
                  <select
                    value={formData.pricing_model}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pricing_model: e.target.value as "" | "TnM" | "Retainer" | "Milestone",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">None</option>
                    <option value="TnM">Time & Materials</option>
                    <option value="Retainer">Retainer</option>
                    <option value="Milestone">Milestone</option>
                  </select>
                </div> */}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Type
                  </label>
                  <select
                    value={formData.project_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        project_type: e.target.value as "" | "hourly_blended" | "hourly_resource_based" | "reselling" | "outsourcing",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">None</option>
                    <option value="hourly_blended">Hourly (Blended)</option>
                    <option value="hourly_resource_based">Hourly (Resource Based)</option>
                    <option value="reselling">Reselling</option>
                    <option value="outsourcing">Outsourcing</option>
                  </select>
                </div>

                {/* Product selector - Show only for reselling/outsourcing projects */}
                {(formData.project_type === "reselling" || formData.project_type === "outsourcing") && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {formData.project_type === "reselling" ? "Product" : "Outsourcing Company"}
                    </label>
                    <select
                      value={formData.product_id}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          product_id: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select {formData.project_type === "reselling" ? "Product" : "Company"}</option>
                      {products
                        .filter(p => p.type === formData.project_type)
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as typeof formData.status,
                      })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                  >
                    {showCreateModal ? "Create" : "Update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                      setEditingProject(null);
                      setClientSearchTerm("");
                      setShowClientDropdown(false);
                      setFormData({
                        client_id: "",
                        name: "",
                        pricing_model: "TnM",
                        start_date: "",
                        end_date: "",
                        status: "draft",
                      });
                    }}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
