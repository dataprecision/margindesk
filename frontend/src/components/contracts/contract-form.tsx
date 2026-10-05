"use client";

import { useEffect, useMemo, useState } from "react";
import { STAGES } from "@/lib/contracts/status";

// One form for adding a contract by hand and for editing its details. Lists
// come from what is already in the register (SPOCs, bases) and from the
// client table, so names stay consistent across entries.

export interface ContractDocument {
  name: string;
  uri?: string | null;
  type?: string | null;
  date?: string | null;
  signed?: boolean | null;
}

export interface ContractFormValues {
  counterparty: string;
  client_id: string;
  agreement_id: string;
  bill_to: string;
  direction: string;
  spoc: string;
  spoc_person_id: string;
  basis: string;
  stage: string;
  start_date: string;
  end_date: string;
  po_status: string;
  notes: string;
  documents: ContractDocument[];
}

export const BASES = [
  "Signed agreement",
  "Signed agreement + PO",
  "PO only",
  "Expired agreement, work continuing",
  "Unsigned draft",
  "No paper found",
];
const PO_STATUSES = ["Required by the agreement", "Issued in practice", "Not used", "Awaiting PO"];
const DIRECTIONS = [
  { value: "customer", label: "Customer (we bill)" },
  { value: "vendor", label: "Vendor (we pay)" },
  { value: "both", label: "Customer and vendor" },
  { value: "nda", label: "NDA only" },
];
const OTHER = "__other";

export const emptyContract: ContractFormValues = {
  counterparty: "", client_id: "", agreement_id: "", bill_to: "", direction: "customer", spoc: "", spoc_person_id: "", basis: "Signed agreement", stage: "active",
  start_date: "", end_date: "", po_status: "", notes: "", documents: [],
};

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelClass = "block text-sm text-gray-700";

export default function ContractForm({
  initial,
  mode,
  saving,
  onSave,
  onCancel,
}: {
  initial: ContractFormValues;
  mode: "new" | "edit";
  saving: boolean;
  onSave: (values: ContractFormValues) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ContractFormValues>(initial);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; email: string }[]>([]);
  const [spocText, setSpocText] = useState(initial.spoc);
  const [basisChoice, setBasisChoice] = useState(BASES.includes(initial.basis) ? initial.basis : initial.basis ? OTHER : BASES[0]);
  const [newLinks, setNewLinks] = useState<{ name: string; uri: string }[]>([{ name: "", uri: "" }]);
  const set = (patch: Partial<ContractFormValues>) => setV((x) => ({ ...x, ...patch }));

  useEffect(() => {
    fetch("/api/companies?all=true").then((r) => r.json()).then((d) => setClients((d.companies || []).map((c: any) => ({ id: c.id, name: c.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)))).catch(() => {});
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => setPeople((Array.isArray(d) ? d : d.people || []).filter((p: any) => !p.end_date).map((p: any) => ({ id: p.id, name: p.name, email: p.email })).sort((a: any, b: any) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const clientName = useMemo(() => clients.find((c) => c.id === v.client_id)?.name ?? "", [clients, v.client_id]);
  const [clientText, setClientText] = useState("");
  const [agreements, setAgreements] = useState<{ id: string; kind: string; title: string; end_date: string | null }[]>([]);
  useEffect(() => {
    if (!v.client_id) { setAgreements([]); return; }
    fetch(`/api/companies/${v.client_id}/agreements`).then((r) => r.json()).then((d) => setAgreements((d.agreements || []).map((a: any) => ({ id: a.id, kind: a.kind, title: a.title, end_date: a.end_date })))).catch(() => setAgreements([]));
  }, [v.client_id]);
  useEffect(() => { if (clientName) setClientText(clientName); }, [clientName]);

  const pickClient = (text: string) => {
    setClientText(text);
    const hit = clients.find((c) => c.name === text);
    set({ client_id: hit ? hit.id : "" });
    if (hit && !v.counterparty) set({ counterparty: hit.name, client_id: hit.id });
  };

  const [addingCompany, setAddingCompany] = useState(false);
  const addCompany = async () => {
    setAddingCompany(true);
    try {
      const r = await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: clientText, contact_type: v.direction === "vendor" ? "vendor" : "customer" }) });
      const d = await r.json();
      const company = d.company;
      if (company) {
        setClients((cs) => (cs.some((c) => c.id === company.id) ? cs : [...cs, { id: company.id, name: company.name }].sort((a, b) => a.name.localeCompare(b.name))));
        setClientText(company.name);
        set({ client_id: company.id, counterparty: v.counterparty || company.name });
      }
    } finally { setAddingCompany(false); }
  };

  const parseLinks = (rows: { name: string; uri: string }[]): ContractDocument[] =>
    rows.filter((r) => r.uri.trim()).map((r) => ({ name: r.name.trim() || r.uri.replace(/^https?:\/\//, "").split("?")[0].split("/").pop() || "Document", uri: r.uri.trim(), type: "Link" }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const basis = basisChoice === OTHER ? v.basis : basisChoice;
    if (!basis.trim()) return;
    if (spocText && !v.spoc_person_id) return; // a typed name that matches nobody
    await onSave({ ...v, basis: basis.trim(), documents: [...v.documents, ...parseLinks(newLinks)] });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <legend className="text-sm font-semibold text-gray-900 mb-3">Who</legend>
        <label className={labelClass}>Counterparty (name on the contract)
          <input className={inputClass} value={v.counterparty} onChange={(e) => set({ counterparty: e.target.value })} required />
        </label>
        <label className={labelClass}>Company
          <input className={inputClass} list="contract-form-clients" value={clientText} onChange={(e) => pickClient(e.target.value)} placeholder="Start typing a company name" />
          <datalist id="contract-form-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <span className="text-xs text-gray-500">
            {v.client_id ? "Linked; the company's contacts, projects and invoices belong here." : clientText ? (
              <>No company with exactly this name. <button type="button" disabled={addingCompany} onClick={addCompany} className="text-blue-700 hover:underline">Add “{clientText}” as a new company</button> (not in Zoho Books yet; finance links it when the record exists).</>
            ) : "Pick the customer or vendor this contract is with."}
          </span>
        </label>
        <label className={labelClass}>Governed by (MSA or framework agreement)
          <select className={inputClass} value={v.agreement_id} onChange={(e) => set({ agreement_id: e.target.value })} disabled={!v.client_id}>
            <option value="">{v.client_id ? (agreements.length ? "Standalone (PO only / no MSA)" : "No agreement on the company yet") : "Pick the company first"}</option>
            {agreements.map((a) => <option key={a.id} value={a.id}>{a.kind}: {a.title}{a.end_date ? ` (ends ${a.end_date.slice(0, 10)})` : ""}</option>)}
          </select>
          <span className="text-xs text-gray-500">MSAs and NDAs are recorded on the company page; this contract's own dates may differ from the MSA's.</span>
        </label>
        <label className={labelClass}>Invoiced to (legal entity on the invoice)
          <input className={inputClass} value={v.bill_to} onChange={(e) => set({ bill_to: e.target.value })} placeholder="Same as counterparty if blank" />
        </label>
        <label className={labelClass}>Type
          <select className={inputClass} value={v.direction} onChange={(e) => set({ direction: e.target.value })}>
            {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label className={labelClass}>SPOC (the employee who follows this up)
          <input
            className={inputClass}
            list="contract-form-people"
            value={spocText}
            onChange={(e) => {
              setSpocText(e.target.value);
              const hit = people.find((p) => p.name === e.target.value || `${p.name} (${p.email})` === e.target.value);
              set({ spoc_person_id: hit ? hit.id : "", spoc: hit ? hit.name : v.spoc });
            }}
            placeholder="Start typing a name from People"
          />
          <datalist id="contract-form-people">{people.map((p) => <option key={p.id} value={p.name}>{p.email}</option>)}</datalist>
          <span className="text-xs text-gray-500">
            {v.spoc_person_id ? "Linked to the People list." : spocText ? "Pick a name from the list; typed names are not accepted." : initial.spoc && !initial.spoc_person_id ? `Was “${initial.spoc}”, not linked to a person yet.` : "Optional."}
          </span>
        </label>
      </fieldset>

      <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <legend className="text-sm font-semibold text-gray-900 mb-3">Paper</legend>
        <label className={labelClass}>Based on
          <select className={inputClass} value={basisChoice} onChange={(e) => setBasisChoice(e.target.value)}>
            {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
            {!BASES.includes(initial.basis) && initial.basis && <option value={OTHER}>{initial.basis}</option>}
            {(BASES.includes(initial.basis) || !initial.basis) && <option value={OTHER}>Other…</option>}
          </select>
          {basisChoice === OTHER && <input className={`${inputClass} mt-2`} value={v.basis} onChange={(e) => set({ basis: e.target.value })} placeholder="Describe the paper" required />}
        </label>
        <label className={labelClass}>Stage
          <select className={inputClass} value={v.stage} onChange={(e) => set({ stage: e.target.value })}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className={labelClass}>Contract start
          <input type="date" className={inputClass} value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </label>
        <label className={labelClass}>Contract end
          <input type="date" className={inputClass} value={v.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          <span className="text-xs text-gray-500">Leave blank if the agreement has no end date.</span>
        </label>
        <label className={labelClass}>Purchase orders
          <input className={inputClass} list="contract-form-po" value={v.po_status} onChange={(e) => set({ po_status: e.target.value })} placeholder="Required, issued in practice, not used…" />
          <datalist id="contract-form-po">{PO_STATUSES.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className={`${labelClass} md:col-span-2`}>Notes
          <textarea className={inputClass} rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">Documents</legend>
        {v.documents.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {v.documents.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-gray-800">{d.uri && /^https?:/.test(d.uri) ? <a href={d.uri} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{d.name}</a> : d.name}</span>
                {d.type && <span className="text-xs text-gray-500">{d.type}{d.date ? `, ${d.date}` : ""}{d.signed === true ? ", signed" : d.signed === false ? ", unsigned" : ""}</span>}
                <button type="button" onClick={() => set({ documents: v.documents.filter((_, j) => j !== i) })} className="ml-auto text-xs text-gray-400 hover:text-red-600">remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <div className="text-sm text-gray-700">Add SharePoint links (open the file in SharePoint, Copy link, paste)</div>
          {newLinks.map((r, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input className={`${inputClass} md:col-span-3`} value={r.uri} onChange={(e) => setNewLinks(newLinks.map((x, j) => (j === i ? { ...x, uri: e.target.value } : x)))} placeholder="https://dwao.sharepoint.com/…" pattern="https://.*" title="A web link starting with https://" />
              <input className={`${inputClass} md:col-span-2`} value={r.name} onChange={(e) => setNewLinks(newLinks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Which document" />
            </div>
          ))}
          <button type="button" onClick={() => setNewLinks([...newLinks, { name: "", uri: "" }])} className="text-xs text-blue-700 hover:underline">Add another</button>
        </div>
      </fieldset>

      <div className="flex gap-2 pt-2 border-t border-gray-200">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {mode === "new" ? "Create contract" : "Save details"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-md text-sm">Cancel</button>
      </div>
    </form>
  );
}
