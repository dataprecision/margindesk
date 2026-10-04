"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Company {
  id: string;
  name: string;
  contact_type: string | null;
  placeholder: boolean;
  zoho_contact_id: string | null;
  suggested_zoho_contact_id: string | null;
  gstin: string | null;
  billing_currency: string;
  owner_person: { id: string; name: string } | null;
  legal_person: { id: string; name: string } | null;
  finance_person: { id: string; name: string } | null;
  contract_count: number;
  project_count: number;
  contact_count: number;
  open_contracts: number;
  document_awaited: number;
}

const TYPE_LABEL: Record<string, string> = { customer: "Customer", vendor: "Vendor" };

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/companies${showAll ? "?all=true" : ""}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed to load companies"); setCompanies(d.companies || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [showAll]);

  const counts = useMemo(() => ({
    customers: companies.filter((c) => c.contact_type === "customer").length,
    vendors: companies.filter((c) => c.contact_type === "vendor").length,
    placeholders: companies.filter((c) => c.placeholder).length,
    matches: companies.filter((c) => c.placeholder && c.suggested_zoho_contact_id).length,
    noOwner: companies.filter((c) => !c.owner_person && c.contract_count > 0).length,
  }), [companies]);

  const visible = companies.filter((c) =>
    (!type || (type === "placeholder" ? c.placeholder : type === "no_owner" ? !c.owner_person && c.contract_count > 0 : c.contact_type === type)) &&
    (!search || `${c.name} ${c.gstin ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  );

  const chip = (key: string, label: string, n: number, tone = "bg-gray-100 text-gray-700") => (
    <button onClick={() => setType(type === key ? "" : key)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${tone} ${type === key ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}>
      {label}: {n}
    </button>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-600 mt-1">Every customer and vendor we deal with. Zoho Books is the master for the company itself; owners, contacts and escalation live here.</p>
        </div>
        <label className="text-sm text-gray-600 flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Show every Zoho contact, not only those with contracts or projects</label>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {chip("customer", "Customers", counts.customers)}
        {chip("vendor", "Vendors", counts.vendors)}
        {chip("placeholder", "Not in Zoho yet", counts.placeholders, "bg-amber-100 text-amber-800")}
        {counts.matches > 0 && chip("placeholder", "Zoho match to confirm", counts.matches, "bg-blue-100 text-blue-800")}
        {chip("no_owner", "No owner on our side", counts.noOwner, "bg-red-100 text-red-700")}
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or GSTIN" className="ml-auto px-3 py-2 border border-gray-300 rounded-md text-sm w-64 max-w-full" />
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Company", "Type", "Zoho", "Our owners", "Contacts", "Contracts", "Projects"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Loading companies…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No companies match.</td></tr>
            ) : (
              visible.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.name}</Link>
                    {c.gstin && <div className="text-xs text-gray-500">{c.gstin}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.contact_type ? TYPE_LABEL[c.contact_type] ?? c.contact_type : "—"}</td>
                  <td className="px-4 py-3">
                    {c.placeholder ? (
                      c.suggested_zoho_contact_id ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Match to confirm</span> : <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Not in Zoho yet</span>
                    ) : <span className="text-green-700 text-xs">Linked</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {[c.owner_person && `Business: ${c.owner_person.name}`, c.legal_person && `Legal: ${c.legal_person.name}`, c.finance_person && `Finance: ${c.finance_person.name}`].filter(Boolean).join(" · ") || <span className="text-gray-400">None set</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.contact_count || "—"}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    {c.contract_count || "—"}
                    {c.open_contracts > 0 && <span className="ml-1 text-xs text-amber-700">({c.open_contracts} open)</span>}
                    {c.document_awaited > 0 && <span className="ml-1 text-xs text-red-700">({c.document_awaited} awaiting paper)</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.project_count || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
