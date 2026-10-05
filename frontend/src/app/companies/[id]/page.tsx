"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BUCKET_STYLE, STATUS_STYLE, formatDate, type ContractStatus, type ReviewBucket } from "@/lib/contracts/status";

interface PersonRef { id: string; name: string; email?: string }
interface Contact {
  id: string; name: string; designation: string | null; department: string | null; email: string | null; phone: string | null; mobile: string | null;
  is_primary: boolean; roles: string[]; notes: string | null; source: string; active: boolean;
}
interface Agreement {
  id: string; kind: string; title: string; start_date: string | null; end_date: string | null; auto_renewal: boolean | null; renewal_note: string | null; notice_days: number | null; signed: boolean | null;
  documents: { name: string; uri?: string | null; type?: string | null }[]; notes: string | null; paper_checked_by: string | null; paper_checked_at: string | null; status: ContractStatus;
  contracts: { id: string; counterparty: string; basis: string; start_date: string | null; end_date: string | null; review_bucket: ReviewBucket | null; beyond_agreement: boolean }[];
}

interface Company {
  id: string; name: string; contact_type: string | null; placeholder: boolean; zoho_contact_id: string | null; zoho_status: string | null;
  sharepoint_folders: { label: string; drive_id: string; path: string; web_url?: string | null }[];
  gstin: string | null; pan: string | null; billing_currency: string; payment_terms: number | null; primary_email: string | null; primary_phone: string | null; website: string | null; notes: string | null;
  owner_person: PersonRef | null; legal_person: PersonRef | null; finance_person: PersonRef | null;
  suggested_match: { id: string; name: string; gstin: string | null; pan: string | null; contact_type: string | null } | null;
  people: Contact[];
  contracts: { id: string; counterparty: string; basis: string; direction: string; start_date: string | null; end_date: string | null; review_bucket: ReviewBucket | null; spoc: string | null; status: ContractStatus }[];
  projects: { id: string; name: string; status: string }[];
}

const ROLE_LABEL: Record<string, string> = {
  business: "Business owner", legal: "Legal owner", accounts_billing: "Accounts & billing", escalation_1: "Escalation 1", escalation_2: "Escalation 2", escalation_3: "Escalation 3",
};
const ROLES = Object.keys(ROLE_LABEL);
const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const emptyContact = { name: "", designation: "", email: "", phone: "", mobile: "", roles: [] as string[], notes: "" };

export default function CompanyPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newContact, setNewContact] = useState<typeof emptyContact | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [agDraft, setAgDraft] = useState<{ id?: string; kind: string; title: string; start_date: string; end_date: string; auto_renewal: string; notice_days: string; signed: string; renewal_note: string; notes: string } | null>(null);
  const loadAgreements = useCallback(() => fetch(`/api/companies/${id}/agreements`).then((r) => r.json()).then((d) => setAgreements(d.agreements || [])).catch(() => {}), [id]);
  useEffect(() => { loadAgreements(); }, [loadAgreements]);
  const [folderLink, setFolderLink] = useState("");
  const [folderLabel, setFolderLabel] = useState("");
  const [sp, setSp] = useState<{ connected: boolean; message?: string } | null>(null);
  useEffect(() => { fetch("/api/sharepoint/status").then((r) => r.json()).then(setSp).catch(() => setSp({ connected: false })); }, []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/companies/${id}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed to load company");
    setCompany(d);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    fetch("/api/people").then((r) => r.json()).then((d) => setPeople((Array.isArray(d) ? d : d.people || []).filter((p: any) => !p.end_date).map((p: any) => ({ id: p.id, name: p.name })).sort((a: PersonRef, b: PersonRef) => a.name.localeCompare(b.name)))).catch(() => {});
  }, [load]);

  const call = async (url: string, method: string, body?: unknown) => {
    setSaving(true); setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      await load();
      await loadAgreements();
      return d;
    } catch (e: any) { setError(e.message); return null; } finally { setSaving(false); }
  };

  if (!company) return <div className="container mx-auto px-4 py-8 text-gray-600">{error || "Loading company…"}</div>;

  const ownerPicker = (label: string, field: "owner_person_id" | "legal_person_id" | "finance_person_id", current: PersonRef | null) => (
    <label className="text-sm text-gray-700">{label}
      <select className={inputClass} value={current?.id ?? ""} disabled={saving} onChange={(e) => call(`/api/companies/${id}`, "PATCH", { [field]: e.target.value || null })}>
        <option value="">Not set</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );

  const toggleRole = (c: Contact, role: string) =>
    call(`/api/companies/contacts/${c.id}`, "PATCH", { roles: c.roles.includes(role) ? c.roles.filter((r) => r !== role) : [...c.roles, role] });

  const fact = (label: string, value: React.ReactNode) => (
    <div><dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt><dd className="mt-1 text-sm text-gray-900">{value ?? "—"}</dd></div>
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/companies" className="text-sm text-gray-600 hover:text-gray-900">← Companies</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">{company.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {company.contact_type && <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{company.contact_type === "vendor" ? "Vendor" : "Customer"}</span>}
            {company.placeholder ? (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Not in Zoho Books yet</span>
            ) : (
              <span className="text-green-700">Linked to Zoho Books{company.zoho_status ? ` (${company.zoho_status})` : ""}</span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {company.placeholder && company.suggested_match && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <div className="font-medium text-blue-900">Zoho Books now has a record that looks like this company: {company.suggested_match.name}{company.suggested_match.gstin ? ` (GSTIN ${company.suggested_match.gstin})` : ""}.</div>
          <div className="text-blue-800 mt-1">Confirming moves this company's contracts, contacts and projects to the Zoho-backed record and removes the placeholder.</div>
          <button disabled={saving} onClick={async () => { const d = await call(`/api/companies/${id}`, "PATCH", { merge_into: company.suggested_match!.id }); if (d?.merged) router.push(`/companies/${d.company.id}`); }} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            Yes, it is the same company
          </button>
        </section>
      )}

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Company</h2>
        <p className="text-xs text-gray-500 mb-4">{company.placeholder ? "Typed in here until finance creates the Zoho Books record." : "From Zoho Books, refreshed nightly. Change these in Zoho."}</p>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          {fact("GSTIN", company.gstin)}
          {fact("PAN", company.pan)}
          {fact("Currency", company.billing_currency)}
          {fact("Payment terms", company.payment_terms != null ? `${company.payment_terms} days` : null)}
          {fact("Email", company.primary_email)}
          {fact("Phone", company.primary_phone)}
          {fact("Website", company.website)}
        </dl>
      </section>

      <section className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Agreements ({agreements.length})</h2>
            <p className="text-xs text-gray-500 mt-1">The organisation-level paper: MSA, NDA, framework. Their dates govern every contract (SOW) beneath them; a contract that runs beyond its MSA is flagged.</p>
          </div>
          {!agDraft && <button onClick={() => setAgDraft({ kind: "MSA", title: "", start_date: "", end_date: "", auto_renewal: "", notice_days: "", signed: "", renewal_note: "", notes: "" })} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Add agreement</button>}
        </div>
        {agDraft && (
          <form className="px-6 py-4 border-b border-gray-200 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3" onSubmit={async (e) => { e.preventDefault(); const ok = agDraft.id ? await call(`/api/agreements/${agDraft.id}`, "PATCH", agDraft) : await call(`/api/companies/${id}/agreements`, "POST", agDraft); if (ok) setAgDraft(null); }}>
            <label className="text-xs text-gray-600">Kind<select className={inputClass} value={agDraft.kind} onChange={(e) => setAgDraft({ ...agDraft, kind: e.target.value })}>{["MSA", "NDA", "Framework", "Other"].map((k) => <option key={k}>{k}</option>)}</select></label>
            <label className="text-xs text-gray-600 col-span-2 md:col-span-3">Title<input className={inputClass} value={agDraft.title} onChange={(e) => setAgDraft({ ...agDraft, title: e.target.value })} placeholder="e.g. Master Services Agreement 2026" required /></label>
            <label className="text-xs text-gray-600">Start<input type="date" className={inputClass} value={agDraft.start_date} onChange={(e) => setAgDraft({ ...agDraft, start_date: e.target.value })} /></label>
            <label className="text-xs text-gray-600">End<input type="date" className={inputClass} value={agDraft.end_date} onChange={(e) => setAgDraft({ ...agDraft, end_date: e.target.value })} /></label>
            <label className="text-xs text-gray-600">Notice period (days)<input className={inputClass} inputMode="numeric" value={agDraft.notice_days} onChange={(e) => setAgDraft({ ...agDraft, notice_days: e.target.value })} /></label>
            <label className="text-xs text-gray-600">Auto-renews?<select className={inputClass} value={agDraft.auto_renewal} onChange={(e) => setAgDraft({ ...agDraft, auto_renewal: e.target.value })}><option value="">Not stated</option><option value="true">Yes</option><option value="false">No</option></select></label>
            <label className="text-xs text-gray-600">Signed?<select className={inputClass} value={agDraft.signed} onChange={(e) => setAgDraft({ ...agDraft, signed: e.target.value })}><option value="">Not known</option><option value="true">Yes</option><option value="false">No</option></select></label>
            <label className="text-xs text-gray-600 col-span-2 md:col-span-3">Renewal wording<input className={inputClass} value={agDraft.renewal_note} onChange={(e) => setAgDraft({ ...agDraft, renewal_note: e.target.value })} placeholder="e.g. renews for 12 months unless 30 days' notice" /></label>
            <label className="text-xs text-gray-600 col-span-2 md:col-span-4">Notes<input className={inputClass} value={agDraft.notes} onChange={(e) => setAgDraft({ ...agDraft, notes: e.target.value })} /></label>
            <div className="col-span-2 md:col-span-4 flex gap-2">
              <button type="submit" disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm">{agDraft.id ? "Save" : "Add agreement"}</button>
              <button type="button" onClick={() => setAgDraft(null)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">Cancel</button>
            </div>
          </form>
        )}
        <ul className="divide-y divide-gray-200">
          {agreements.map((a) => (
            <li key={a.id} className="px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-xs mr-2">{a.kind}</span>{a.title}</div>
                  <div className="text-xs text-gray-600 mt-1 tabular-nums">{formatDate(a.start_date)} → {formatDate(a.end_date)} <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[a.status]}`}>{a.status}</span>{a.notice_days ? ` · ${a.notice_days} days' notice` : ""}{a.auto_renewal === true ? " · auto-renews" : a.auto_renewal === false ? " · no auto-renewal" : ""}{a.signed === true ? " · signed" : a.signed === false ? " · unsigned" : ""}</div>
                  {a.documents?.length > 0 && <div className="text-xs text-gray-500 mt-1">{a.documents.map((d, i) => <span key={i}>{i > 0 ? "; " : ""}{d.uri && /^https?:/.test(d.uri) ? <a href={d.uri} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{d.name}</a> : d.name}</span>)}</div>}
                  {a.notes && <div className="text-xs text-gray-500 mt-1">{a.notes}</div>}
                  {a.paper_checked_by && <div className="text-xs text-green-700 mt-1">Paper checked by {a.paper_checked_by} on {formatDate(a.paper_checked_at)}</div>}
                </div>
                <div className="text-xs whitespace-nowrap">
                  <button onClick={() => setAgDraft({ id: a.id, kind: a.kind, title: a.title, start_date: a.start_date?.slice(0, 10) ?? "", end_date: a.end_date?.slice(0, 10) ?? "", auto_renewal: a.auto_renewal == null ? "" : String(a.auto_renewal), notice_days: a.notice_days == null ? "" : String(a.notice_days), signed: a.signed == null ? "" : String(a.signed), renewal_note: a.renewal_note ?? "", notes: a.notes ?? "" })} className="text-blue-700 hover:underline">Edit</button>
                  {!a.paper_checked_by ? <button disabled={saving} onClick={() => call(`/api/agreements/${a.id}`, "PATCH", { paper_checked: true })} className="ml-3 text-green-700 hover:underline">Paper checked</button> : <button disabled={saving} onClick={() => call(`/api/agreements/${a.id}`, "PATCH", { paper_checked: false })} className="ml-3 text-gray-600 hover:underline">Undo check</button>}
                  <button disabled={saving} onClick={() => { if (window.confirm(`Remove ${a.kind} "${a.title}"? Contracts under it are kept.`)) call(`/api/agreements/${a.id}`, "DELETE"); }} className="ml-3 text-red-600 hover:underline">Remove</button>
                </div>
              </div>
              {a.contracts.length > 0 && (
                <ul className="mt-2 ml-4 border-l-2 border-gray-200 pl-3 space-y-1">
                  {a.contracts.map((c) => (
                    <li key={c.id} className="text-sm flex flex-wrap items-center gap-2">
                      <Link href={`/contracts/${c.id}`} className="text-blue-700 hover:underline">{c.counterparty}</Link>
                      <span className="text-xs text-gray-500 tabular-nums">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
                      {c.beyond_agreement && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">runs beyond the {a.kind}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {agreements.length === 0 && <li className="px-6 py-6 text-center text-sm text-gray-500">No MSA or NDA recorded for this company yet.</li>}
        </ul>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">SharePoint folders</h2>
        <p className="text-xs text-gray-500 mb-3">The folders whose files belong to this company. Contracts pick their documents from these folders and see nothing outside them. {sp && !sp.connected && <span className="text-amber-700">MarginDesk cannot read SharePoint yet: the Microsoft 365 admin has to grant it read access. Mapped folders are kept and used once that is done.</span>}</p>
        <ul className="space-y-1 text-sm mb-3">
          {(company.sharepoint_folders ?? []).map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-gray-900">{f.web_url ? <a href={f.web_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{f.label}</a> : f.label}</span>
              <span className="text-xs text-gray-500 truncate">{f.path}</span>
              <button disabled={saving} onClick={() => call(`/api/companies/${id}/documents`, "POST", { remove: i })} className="ml-auto text-xs text-red-600 hover:underline">unmap</button>
            </li>
          ))}
          {(company.sharepoint_folders ?? []).length === 0 && <li className="text-gray-400">No folder mapped yet.</li>}
        </ul>
        <form className="grid grid-cols-1 md:grid-cols-5 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await call(`/api/companies/${id}/documents`, "POST", { folder_link: folderLink, label: folderLabel })) { setFolderLink(""); setFolderLabel(""); } }}>
          <input className={`${inputClass} md:col-span-3`} value={folderLink} onChange={(e) => setFolderLink(e.target.value)} placeholder="Paste the folder's SharePoint link (https://…)" />
          <input className={inputClass} value={folderLabel} onChange={(e) => setFolderLabel(e.target.value)} placeholder="Label, e.g. Agreements" />
          <button type="submit" disabled={saving || !folderLink} className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-50">Map folder</button>
        </form>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Our side</h2>
        <p className="text-xs text-gray-500 mb-4">Who at DWAO owns this relationship. Follow-ups and escalations go to these people.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ownerPicker("Business owner", "owner_person_id", company.owner_person)}
          {ownerPicker("Legal owner", "legal_person_id", company.legal_person)}
          {ownerPicker("Finance / billing owner", "finance_person_id", company.finance_person)}
        </div>
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Notes</div>
          {editingNotes === null ? (
            <div className="text-sm text-gray-800 whitespace-pre-line">{company.notes || <span className="text-gray-400">None</span>} <button onClick={() => setEditingNotes(company.notes ?? "")} className="ml-2 text-xs text-blue-700 hover:underline">edit</button></div>
          ) : (
            <div className="space-y-2">
              <textarea className={inputClass} rows={3} value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} />
              <div className="flex gap-2">
                <button disabled={saving} onClick={async () => { if (await call(`/api/companies/${id}`, "PATCH", { notes: editingNotes })) setEditingNotes(null); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm">Save</button>
                <button onClick={() => setEditingNotes(null)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Their people ({company.people.filter((p) => p.active).length})</h2>
            <p className="text-xs text-gray-500 mt-1">Contact persons from Zoho Books plus anyone added here. Tick the roles each person holds; escalation goes level 1, then 2, then 3.</p>
          </div>
          {!newContact && <button onClick={() => setNewContact(emptyContact)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Add person</button>}
        </div>
        {newContact && (
          <form className="px-6 py-4 border-b border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3" onSubmit={async (e) => { e.preventDefault(); if (await call(`/api/companies/${id}/contacts`, "POST", newContact)) setNewContact(null); }}>
            <input className={inputClass} placeholder="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} required />
            <input className={inputClass} placeholder="Designation" value={newContact.designation} onChange={(e) => setNewContact({ ...newContact, designation: e.target.value })} />
            <input className={inputClass} placeholder="Email" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
            <input className={inputClass} placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
            <input className={inputClass} placeholder="Mobile" value={newContact.mobile} onChange={(e) => setNewContact({ ...newContact, mobile: e.target.value })} />
            <input className={inputClass} placeholder="Notes (e.g. only responds to the CEO)" value={newContact.notes} onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })} />
            <div className="md:col-span-3 flex flex-wrap gap-3 text-sm">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={newContact.roles.includes(r)} onChange={() => setNewContact({ ...newContact, roles: newContact.roles.includes(r) ? newContact.roles.filter((x) => x !== r) : [...newContact.roles, r] })} />{ROLE_LABEL[r]}</label>
              ))}
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button type="submit" disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm">Add</button>
              <button type="button" onClick={() => setNewContact(null)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">Cancel</button>
            </div>
          </form>
        )}
        <ul className="divide-y divide-gray-200">
          {company.people.map((p) => (
            <li key={p.id} className={`px-6 py-4 ${p.active ? "" : "opacity-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{p.name}{p.is_primary && <span className="ml-2 text-xs text-gray-500">primary in Zoho</span>}{!p.active && <span className="ml-2 text-xs text-gray-500">no longer in Zoho</span>}</div>
                  <div className="text-xs text-gray-600">{[p.designation, p.department].filter(Boolean).join(", ")}</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {p.email && <a href={`mailto:${p.email}`} className="text-blue-700 hover:underline">{p.email}</a>}
                    {(p.phone || p.mobile) && <span className="ml-2">{[p.phone, p.mobile].filter(Boolean).join(" / ")}</span>}
                  </div>
                  {p.notes && <div className="text-xs text-gray-500 mt-1">{p.notes}</div>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {ROLES.map((r) => (
                    <button key={r} disabled={saving} onClick={() => toggleRole(p, r)} className={`px-2 py-1 rounded-full border ${p.roles.includes(r) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{ROLE_LABEL[r]}</button>
                  ))}
                  {p.source === "manual" && <button disabled={saving} onClick={() => { if (window.confirm(`Remove ${p.name}?`)) call(`/api/companies/contacts/${p.id}`, "DELETE"); }} className="px-2 py-1 text-red-600 hover:underline">remove</button>}
                </div>
              </div>
            </li>
          ))}
          {company.people.length === 0 && <li className="px-6 py-8 text-center text-sm text-gray-500">No contacts yet. Zoho's contact persons arrive with the nightly sync; add anyone else above.</li>}
        </ul>
      </section>

      <section className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Contracts ({company.contracts.length})</h2></div>
        <ul className="divide-y divide-gray-200">
          {company.contracts.map((c) => (
            <li key={c.id} className="px-6 py-3 flex flex-wrap items-center gap-3 text-sm">
              <Link href={`/contracts/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.counterparty}</Link>
              <span className="text-gray-600">{c.basis}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[c.status]}`}>{c.status}</span>
              {c.review_bucket && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BUCKET_STYLE[c.review_bucket]}`}>{c.review_bucket === "clean" ? "Clean" : c.review_bucket === "open" ? "Open pointers" : "Document awaited"}</span>}
              <span className="ml-auto text-xs text-gray-500 tabular-nums">{formatDate(c.start_date)} → {formatDate(c.end_date)}</span>
            </li>
          ))}
          {company.contracts.length === 0 && <li className="px-6 py-8 text-center text-sm text-gray-500">No contracts linked.</li>}
        </ul>
      </section>

      {company.projects.length > 0 && (
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Projects ({company.projects.length})</h2></div>
          <ul className="divide-y divide-gray-200">
            {company.projects.map((p) => <li key={p.id} className="px-6 py-2 text-sm text-gray-800">{p.name} <span className="text-xs text-gray-500">{p.status}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
