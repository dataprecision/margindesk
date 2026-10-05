"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { BUCKET_LABEL, BUCKET_STYLE, POINTER_LABEL, BILLING_TYPES, STAGES, STATUS_STYLE, formatDate, toDateInput, type ContractStatus, type ReviewBucket } from "@/lib/contracts/status";
import type { BillingRule } from "./billing-rules";
import TermShapePanel, { ShapeSummary, RULE_STATUS_LABEL, RULE_STATUS_STYLE, type TermShape } from "@/components/contracts/term-shape";
import ContractForm, { type ContractDocument, type ContractFormValues } from "@/components/contracts/contract-form";
import PurchaseOrders, { type PurchaseOrder } from "./purchase-orders";
import ValidationChecklist from "./validation-checklist";
import SharePointPicker from "@/components/contracts/sharepoint-picker";
import type { TeamCheck } from "@/lib/contracts/validation";

interface Line {
  id: string;
  service: string;
  billing_type: string;
  amount_text: string;
  unit: string | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  date_note: string | null;
  read_from: string;
  source_document: string | null;
  quote: string | null;
  extra_rule: string | null;
  verified: boolean;
  status: ContractStatus;
  days_left: number | null;
  shape: string | null;
  params: Record<string, any>;
  period: string | null;
  fx_rate: string | null;
  input_needed: string | null;
  advance_or_arrears: string | null;
  rule_status: "proposed" | "confirmed" | "retired";
  confirmed_by: string | null;
  confirmed_at: string | null;
  rule_evidence: TermShape["rule_evidence"];
}

interface Task {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  due_date: string;
  owner: string | null;
  status: "open" | "done" | "dismissed";
}

interface Question {
  text: string;
  resolved?: boolean;
}

interface Pointer { kind: string; text: string; big?: boolean; resolved?: boolean }

interface Contract {
  id: string;
  counterparty: string;
  direction: string;
  basis: string;
  bill_to: string | null;
  start_date: string | null;
  end_date: string | null;
  spoc: string | null;
  stage: string;
  po_status: string | null;
  notes: string | null;
  open_questions: Question[];
  client: { id: string; name: string } | null;
  client_id: string | null;
  spoc_person: { id: string; name: string; email: string } | null;
  spoc_person_id: string | null;
  agreement: { id: string; title: string; kind: string; start_date: string | null; end_date: string | null; notice_days: number | null; auto_renewal: boolean | null } | null;
  agreement_id: string | null;
  documents: ContractDocument[] | null;
  validation: TeamCheck[];
  review_bucket: ReviewBucket | null;
  review_pointers: Pointer[];
  read_file: string | null;
  read_at: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  loaded_at: string | null;
  status: ContractStatus;
  days_left: number | null;
  lines: Line[];
  purchase_orders: PurchaseOrder[];
  tasks: Task[];
  billing_rules: BillingRule[];
}

const emptyLine = { service: "", billing_type: "Fixed monthly fee", amount_text: "", unit: "per month", currency: "INR", start_date: "", end_date: "", source_document: "", quote: "", read_from: "Contract" };
const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function ContractDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const isLegal = session?.user?.role === "legal";
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [header, setHeader] = useState<ContractFormValues | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<Record<string, string>>({});
  const [newLine, setNewLine] = useState<typeof emptyLine | null>(null);
  const [pickingForTerm, setPickingForTerm] = useState(false);
  const [shapeFor, setShapeFor] = useState<Line | null>(null);
  const [newTask, setNewTask] = useState<{ title: string; due_date: string; owner: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/contracts/${id}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load contract");
      setContract(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const call = async (url: string, method: string, body?: unknown) => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      await load();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (!contract) {
    return <div className="container mx-auto px-4 py-8 text-gray-600">{error || "Loading contract…"}</div>;
  }

  const startHeaderEdit = () => {
    setHeader({
      counterparty: contract.counterparty,
      client_id: contract.client_id ?? "",
      agreement_id: contract.agreement_id ?? "",
      basis: contract.basis,
      direction: contract.direction,
      bill_to: contract.bill_to ?? "",
      start_date: toDateInput(contract.start_date),
      end_date: toDateInput(contract.end_date),
      spoc: contract.spoc ?? "",
      spoc_person_id: contract.spoc_person_id ?? "",
      stage: contract.stage,
      po_status: contract.po_status ?? "",
      notes: contract.notes ?? "",
      documents: Array.isArray(contract.documents) ? contract.documents : [],
    });
    setEditingHeader(true);
  };
  const documents = Array.isArray(contract.documents) ? contract.documents : [];

  // Terms grouped by the document they were read from. A term names its source
  // document in free text; the match is on the document's file name.
  const docFor = (l: Line) => {
    const src = (l.source_document ?? "").toLowerCase();
    if (!src) return null;
    return documents.find((d) => d.name && src.includes(d.name.toLowerCase())) ?? documents.find((d) => d.name && d.name.toLowerCase().includes(src.split(" (")[0].slice(0, 40))) ?? null;
  };
  const groups: { key: string; doc: ContractDocument | null; title: string; lines: Line[] }[] = [];
  for (const l of contract.lines) {
    const d = docFor(l);
    const key = d ? `doc:${d.name}` : l.source_document ? `src:${l.source_document.split(" (")[0]}` : "none";
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, doc: d, title: d ? d.name : l.source_document ? l.source_document.split(" (")[0] : "Source document not recorded", lines: [] }; groups.push(g); }
    g.lines.push(l);
  }
  const questions = contract.open_questions || [];
  const pointers = contract.review_pointers || [];
  const openPointers = pointers.filter((p) => !p.resolved && p.kind !== "uninvoiced");
  const togglePointer = (index: number) =>
    call(`/api/contracts/${id}`, "PATCH", { review_pointers: pointers.map((p, i) => (i === index ? { ...p, resolved: !p.resolved } : p)) });
  const toggleQuestion = (index: number) =>
    call(`/api/contracts/${id}`, "PATCH", { open_questions: questions.map((q, i) => (i === index ? { ...q, resolved: !q.resolved } : q)) });

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/contracts" className="text-sm text-gray-600 hover:text-gray-900">← Contracts</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">{contract.counterparty}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[contract.status]}`}>{contract.status}</span>
            {contract.review_bucket && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${BUCKET_STYLE[contract.review_bucket]}`}>
                {BUCKET_LABEL[contract.review_bucket]}{contract.review_bucket === "open" ? ` (${openPointers.length})` : ""}
              </span>
            )}
            {contract.agreement && (() => {
              const agEnd = contract.agreement.end_date ? new Date(contract.agreement.end_date) : null;
              const beyond = !!(agEnd && contract.end_date && new Date(contract.end_date) > agEnd);
              const expired = !!(agEnd && agEnd < new Date());
              return (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${beyond || expired ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                  Governed by {contract.agreement.kind} {contract.agreement.title.length > 40 ? contract.agreement.title.slice(0, 40) + "…" : contract.agreement.title}{agEnd ? ` (ends ${formatDate(agEnd)})` : ""}{beyond ? " · this contract runs beyond it" : expired ? " · expired" : ""}
                </span>
              );
            })()}
            {contract.verified ? (
              <span className="text-sm text-green-700">Checked by {contract.verified_by} on {formatDate(contract.verified_at)}</span>
            ) : (
              <span className="text-sm text-amber-700">Read from documents on {formatDate(contract.loaded_at)}. Not yet validated by all three teams.</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => call(`/api/contracts/${id}`, "PATCH", { verified: !contract.verified })}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {contract.verified ? "Mark as not checked" : "Mark as checked"}
          </button>
          {!editingHeader && (
            <button onClick={startHeaderEdit} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Edit details</button>
          )}
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {contract.direction !== "vendor" && contract.validation && (
        <ValidationChecklist contractId={id} clientId={contract.client?.id ?? contract.client_id} checks={contract.validation} documents={documents} saving={saving} call={call} role={session?.user?.role} />
      )}

      <section className="bg-white rounded-lg shadow p-6">
        {editingHeader && header ? (
          <ContractForm
            initial={header}
            mode="edit"
            saving={saving}
            onSave={async (values) => { const ok = await call(`/api/contracts/${id}`, "PATCH", values); if (ok) setEditingHeader(false); return ok; }}
            onCancel={() => setEditingHeader(false)}
          />
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            {field("Contract start", formatDate(contract.start_date))}
            {field("Contract end", <>{formatDate(contract.end_date)}{contract.days_left !== null && <span className="text-gray-500"> · {contract.days_left < 0 ? `${-contract.days_left} days ago` : `${contract.days_left} days left`}</span>}</>)}
            {field("Based on", contract.basis)}
            {field("Stage", STAGES.find((s) => s.value === contract.stage)?.label ?? contract.stage)}
            {field("Type", { customer: "Customer (we bill)", vendor: "Vendor (we pay)", both: "Customer and vendor", nda: "NDA only" }[contract.direction] ?? contract.direction)}
            {field("SPOC", contract.spoc_person ? contract.spoc_person.name : contract.spoc ? <>{contract.spoc} <span className="text-xs text-amber-700">(not linked to People)</span></> : "—")}
            {field("Purchase orders", contract.po_status || "—")}
            {field("Invoiced to", contract.bill_to || "—")}
            {field("Client in MarginDesk", contract.client ? contract.client.name : <span className="text-gray-400">Not linked</span>)}
            {documents.length > 0 && (
              <div className="col-span-2 md:col-span-4">
                {field("Documents", (
                  <ul className="space-y-0.5">
                    {documents.map((d, i) => (
                      <li key={i}>
                        {d.uri && /^https?:/.test(d.uri) ? <a href={d.uri} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{d.name}</a> : d.name}
                        {(d.type || d.date || d.signed != null) && <span className="text-xs text-gray-500"> · {[d.type, d.date, d.signed === true ? "signed" : d.signed === false ? "unsigned" : null].filter(Boolean).join(", ")}</span>}
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            )}
            {contract.notes && <div className="col-span-2 md:col-span-4">{field("Notes", contract.notes)}</div>}
          </dl>
        )}
      </section>


      <section className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Terms and how they are billed ({contract.lines.length} term{contract.lines.length === 1 ? "" : "s"} from {groups.filter((g) => g.key !== "none").length || "no"} document{groups.filter((g) => g.key !== "none").length === 1 ? "" : "s"})</h2>
            <p className="text-xs text-gray-500 mt-1">Left: what the document says, with the clause it comes from (contracting checks this). Right: how the amount is worked out each period (invoicing sets and confirms this). Draft estimates are built from confirmed terms.</p>
          </div>
          {!newLine && <button onClick={() => setNewLine({ ...emptyLine })} className="text-sm font-medium text-blue-700 hover:underline">Add term</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Service", "As written", "Start", "End", "Status", "How it's billed", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {groups.map((g) => [
                <tr key={g.key} className="bg-gray-50">
                  <td colSpan={7} className="px-4 py-2 text-sm">
                    <span className="font-medium text-gray-900">
                      {g.doc?.uri && /^https?:/.test(g.doc.uri) ? <a href={g.doc.uri} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{g.title}</a> : g.title}
                    </span>
                    {g.doc && (g.doc.type || g.doc.date || g.doc.signed != null) && <span className="ml-2 text-xs text-gray-500">{[g.doc.type, g.doc.date, g.doc.signed === true ? "signed" : g.doc.signed === false ? "unsigned" : null].filter(Boolean).join(", ")}</span>}
                    <span className="ml-2 text-xs text-gray-500">· {g.lines.length} term{g.lines.length === 1 ? "" : "s"}</span>
                    {g.doc && !(g.doc.uri && /^https?:/.test(g.doc.uri)) && <span className="ml-2 text-xs text-amber-700">no web link yet</span>}
                  </td>
                </tr>,
                ...g.lines.map((l) =>
                editingLine === l.id ? (
                  <tr key={l.id} className="bg-blue-50">
                    <td className="px-4 py-3"><input className={inputClass} value={lineDraft.service} onChange={(e) => setLineDraft({ ...lineDraft, service: e.target.value })} /></td>
                    <td className="px-4 py-3">
                      <select className={inputClass} value={lineDraft.billing_type} onChange={(e) => setLineDraft({ ...lineDraft, billing_type: e.target.value })}>
                        {BILLING_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      <input className={inputClass} value={lineDraft.amount_text} onChange={(e) => setLineDraft({ ...lineDraft, amount_text: e.target.value })} placeholder="Amount" />
                      <input className={inputClass} value={lineDraft.unit} onChange={(e) => setLineDraft({ ...lineDraft, unit: e.target.value })} placeholder="per month" />
                    </td>
                    <td className="px-4 py-3"><input type="date" className={inputClass} value={lineDraft.start_date} onChange={(e) => setLineDraft({ ...lineDraft, start_date: e.target.value })} /></td>
                    <td className="px-4 py-3"><input type="date" className={inputClass} value={lineDraft.end_date} onChange={(e) => setLineDraft({ ...lineDraft, end_date: e.target.value })} /></td>
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="flex gap-2">
                        <button disabled={saving} onClick={async () => { if (await call(`/api/contracts/lines/${l.id}`, "PATCH", lineDraft)) setEditingLine(null); }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium disabled:opacity-50">Save</button>
                        <button onClick={() => setEditingLine(null)} className="px-3 py-1 border border-gray-300 rounded text-xs">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-3 max-w-md">
                      <div className="font-medium text-gray-900">{l.service}</div>
                      <div className={`text-xs ${l.read_from === "Contract" ? "text-gray-500" : "text-amber-700 font-medium"}`}>Read from: {l.read_from}</div>
                      {(l.source_document || l.quote || l.extra_rule) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-blue-700">Clause and document</summary>
                          <div className="mt-1 border-l-2 border-gray-200 pl-3 text-xs text-gray-600 space-y-1">
                            {l.source_document && <div>{(() => { const d = docFor(l); return d?.uri && /^https?:/.test(d.uri) ? <><a href={d.uri} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{d.name}</a>{l.source_document.replace(d.name, "")}</> : l.source_document; })()}</div>}
                            {l.quote && <div className="text-gray-900">“{l.quote}”</div>}
                            {l.extra_rule && <div>Extra rule: {l.extra_rule}</div>}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums max-w-xs"><div className="text-xs text-gray-500">{l.billing_type}</div>{l.currency} {l.amount_text}{l.unit && <div className="text-xs text-gray-500">{l.unit}</div>}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(l.start_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(l.end_date)}{l.date_note && <div className="text-xs text-gray-500 whitespace-normal max-w-[12rem]">{l.date_note}</div>}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLE[l.status]}`}>{l.status}</span></td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-start gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${RULE_STATUS_STYLE[l.rule_status]}`}>{RULE_STATUS_LABEL[l.rule_status]}</span>
                        <ShapeSummary term={l} />
                      </div>
                      {!isLegal && l.rule_status !== "retired" && (
                        <div className="mt-1 text-xs whitespace-nowrap">
                          <button onClick={() => setShapeFor(l)} className="text-blue-700 hover:underline">{l.shape ? "Edit" : "Set how it's billed"}</button>
                          {l.shape && l.rule_status !== "confirmed" && <button disabled={saving} onClick={() => call(`/api/contracts/lines/${l.id}`, "PATCH", { rule_status: "confirmed" })} className="ml-3 text-green-700 hover:underline">Confirm</button>}
                          {l.rule_status === "confirmed" && <button disabled={saving} onClick={() => call(`/api/contracts/lines/${l.id}`, "PATCH", { rule_status: "proposed" })} className="ml-3 text-gray-600 hover:underline">Unconfirm</button>}
                          <button disabled={saving} onClick={() => call(`/api/contracts/lines/${l.id}`, "PATCH", { rule_status: "retired" })} className="ml-3 text-gray-500 hover:underline">Retire</button>
                        </div>
                      )}
                      {!isLegal && l.rule_status === "retired" && <button disabled={saving} onClick={() => call(`/api/contracts/lines/${l.id}`, "PATCH", { rule_status: "proposed" })} className="mt-1 text-xs text-blue-700 hover:underline">Restore</button>}
                      {l.confirmed_by && l.rule_status === "confirmed" && <div className="text-xs text-gray-500 mt-1">by {l.confirmed_by} on {formatDate(l.confirmed_at)}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <button
                        onClick={() => {
                          setLineDraft({ service: l.service, billing_type: l.billing_type, amount_text: l.amount_text, unit: l.unit ?? "", start_date: toDateInput(l.start_date), end_date: toDateInput(l.end_date) });
                          setEditingLine(l.id);
                        }}
                        className="text-blue-700 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button onClick={() => { if (window.confirm(`Delete the billing line "${l.service}"?`)) call(`/api/contracts/lines/${l.id}`, "DELETE"); }} className="text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                )
                ),
              ])}
              {contract.lines.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No terms recorded. The agreement for this counterparty has not been read yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg shadow">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Follow-ups</h2>
            {!newTask && <button onClick={() => setNewTask({ title: "", due_date: toDateInput(new Date()), owner: contract.spoc ?? "" })} className="text-sm font-medium text-blue-700 hover:underline">Add follow-up</button>}
          </div>
          <ul className="divide-y divide-gray-200">
            {newTask && (
              <li className="px-6 py-4 bg-blue-50 space-y-2">
                <input className={inputClass} placeholder="What needs doing?" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <input type="date" className={`${inputClass} w-44`} value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                  <input className={`${inputClass} w-44`} placeholder="Owner" value={newTask.owner} onChange={(e) => setNewTask({ ...newTask, owner: e.target.value })} />
                  <button disabled={saving} onClick={async () => { if (await call("/api/contracts/tasks", "POST", { ...newTask, contract_id: id })) setNewTask(null); }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium disabled:opacity-50">Add</button>
                  <button onClick={() => setNewTask(null)} className="px-3 py-1 border border-gray-300 rounded text-xs">Cancel</button>
                </div>
              </li>
            )}
            {contract.tasks.map((t) => (
              <li key={t.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className={t.status === "open" ? "" : "opacity-60"}>
                  <div className={`text-sm text-gray-900 ${t.status === "done" ? "line-through" : ""}`}>{t.title}</div>
                  <div className="text-xs text-gray-500">Due {formatDate(t.due_date)}{t.owner ? ` · ${t.owner}` : ""}{t.status !== "open" ? ` · ${t.status}` : ""}</div>
                  {t.detail && <div className="mt-1 text-xs text-gray-600 whitespace-pre-line">{t.detail}</div>}
                </div>
                <div className="flex gap-2 text-xs whitespace-nowrap">
                  {t.status === "open" ? (
                    <>
                      <button onClick={() => call(`/api/contracts/tasks/${t.id}`, "PATCH", { status: "done" })} className="text-green-700 hover:underline">Done</button>
                      <button onClick={() => call(`/api/contracts/tasks/${t.id}`, "PATCH", { status: "dismissed" })} className="text-gray-500 hover:underline">Dismiss</button>
                    </>
                  ) : (
                    <button onClick={() => call(`/api/contracts/tasks/${t.id}`, "PATCH", { status: "open" })} className="text-blue-700 hover:underline">Reopen</button>
                  )}
                </div>
              </li>
            ))}
            {contract.tasks.length === 0 && !newTask && <li className="px-6 py-8 text-center text-sm text-gray-500">No follow-ups for this contract.</li>}
          </ul>
        </section>

        {pointers.length > 0 && (
          <section className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Open pointers ({openPointers.length})</h2>
              <p className="text-xs text-gray-500 mt-1">
                Where the contract and our invoicing disagree, a number is missing, or the paper is not in effect. Tick a pointer once it is settled; the entry is clean when none are left.
                {contract.read_at && ` Read from the documents on ${formatDate(contract.read_at)}.`}
              </p>
            </div>
            <ul className="divide-y divide-gray-200">
              {pointers.map((p, i) => (
                <li key={i} className="px-6 py-3">
                  <label className="flex items-start gap-3 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={!!p.resolved} disabled={saving} onChange={() => togglePointer(i)} />
                    <span className={p.resolved ? "text-gray-400 line-through" : "text-gray-800"}>
                      <span className={`mr-2 px-1.5 py-0.5 rounded text-xs font-medium ${p.kind === "uninvoiced" ? "bg-blue-50 text-blue-700" : p.big ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                        {POINTER_LABEL[p.kind] ?? p.kind}{p.big ? " · large account" : ""}
                      </span>
                      {p.text}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Open questions ({questions.filter((q) => !q.resolved).length})</h2>
            <p className="text-xs text-gray-500 mt-1">What the documents leave unclear. Tick a question once it is settled.</p>
          </div>
          <ul className="divide-y divide-gray-200">
            {questions.map((q, i) => (
              <li key={i} className="px-6 py-3">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={!!q.resolved} disabled={saving} onChange={() => toggleQuestion(i)} />
                  <span className={q.resolved ? "text-gray-400 line-through" : "text-gray-800"}>{q.text}</span>
                </label>
              </li>
            ))}
            {questions.length === 0 && <li className="px-6 py-8 text-center text-sm text-gray-500">No open questions.</li>}
          </ul>
        </section>
      </div>

      <PurchaseOrders contractId={id} purchaseOrders={contract.purchase_orders} onChange={load} />

      {shapeFor && (
        <TermShapePanel
          term={shapeFor}
          saving={saving}
          onClose={() => setShapeFor(null)}
          onSave={(patch) => call(`/api/contracts/lines/${shapeFor.id}`, "PATCH", patch)}
        />
      )}

      {newLine && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/40 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setNewLine(null); }}>
          <form
            className="w-full max-w-2xl rounded-lg bg-white shadow-xl p-6 space-y-4 mt-8"
            onSubmit={async (e) => { e.preventDefault(); if (await call(`/api/contracts/${id}/lines`, "POST", newLine)) { setNewLine(null); setPickingForTerm(false); } }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add a term</h2>
                <p className="text-xs text-gray-500 mt-1">A term is one thing the paper says about billing: a fee, a rate, an hours bundle, a milestone. Say which document it comes from.</p>
              </div>
              <button type="button" onClick={() => setNewLine(null)} className="text-sm text-gray-500 hover:text-gray-900">Close</button>
            </div>

            <div>
              <label className="block text-sm text-gray-700">Document the term comes from
                <select className={inputClass} value={pickingForTerm ? "__pick" : newLine.source_document} onChange={(e) => { if (e.target.value === "__pick") setPickingForTerm(true); else { setPickingForTerm(false); setNewLine({ ...newLine, source_document: e.target.value }); } }}>
                  <option value="">Not recorded</option>
                  {documents.map((d, i) => <option key={i} value={d.name}>{d.name}{d.type ? ` (${d.type})` : ""}</option>)}
                  {contract.client_id && <option value="__pick">Pick a new document from SharePoint…</option>}
                </select>
              </label>
              {pickingForTerm && contract.client_id && (
                <div className="mt-2">
                  <SharePointPicker
                    clientId={contract.client_id}
                    alreadyAttached={documents.map((d) => d.uri ?? "").filter(Boolean)}
                    saving={saving}
                    onClose={() => setPickingForTerm(false)}
                    onAttach={async (files) => {
                      const ok = await call(`/api/contracts/${id}`, "PATCH", { documents: [...documents, ...files.map((f) => ({ ...f, type: "Link" }))] });
                      if (ok && files[0]) setNewLine((n) => (n ? { ...n, source_document: files[0].name } : n));
                      return ok;
                    }}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block text-sm text-gray-700 md:col-span-2">Service<input className={inputClass} value={newLine.service} onChange={(e) => setNewLine({ ...newLine, service: e.target.value })} placeholder="e.g. Adobe Analytics consulting retainer" required /></label>
              <label className="block text-sm text-gray-700">Billing type
                <select className={inputClass} value={newLine.billing_type} onChange={(e) => setNewLine({ ...newLine, billing_type: e.target.value })}>{BILLING_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
              <label className="block text-sm text-gray-700">Read from
                <select className={inputClass} value={newLine.read_from} onChange={(e) => setNewLine({ ...newLine, read_from: e.target.value })}><option>Contract</option><option>Purchase order</option><option>Unsigned draft</option></select>
              </label>
              <label className="block text-sm text-gray-700">Amount as written<input className={inputClass} value={newLine.amount_text} onChange={(e) => setNewLine({ ...newLine, amount_text: e.target.value })} placeholder="e.g. 2,50,000 per month for 100 hours" required /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm text-gray-700">Unit<input className={inputClass} value={newLine.unit} onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })} placeholder="per month" /></label>
                <label className="block text-sm text-gray-700">Currency<input className={inputClass} value={newLine.currency} onChange={(e) => setNewLine({ ...newLine, currency: e.target.value.toUpperCase() })} /></label>
              </div>
              <label className="block text-sm text-gray-700">Start<input type="date" className={inputClass} value={newLine.start_date} onChange={(e) => setNewLine({ ...newLine, start_date: e.target.value })} /></label>
              <label className="block text-sm text-gray-700">End<input type="date" className={inputClass} value={newLine.end_date} onChange={(e) => setNewLine({ ...newLine, end_date: e.target.value })} /></label>
              <label className="block text-sm text-gray-700 md:col-span-2">Clause, as written (and where: page or clause number)
                <textarea className={inputClass} rows={3} value={newLine.quote} onChange={(e) => setNewLine({ ...newLine, quote: e.target.value })} placeholder="Paste the sentence from the document, e.g. “The Client shall pay a monthly retainer of INR 2,50,000…” (Annexure 1, cl. 3, p. 8)" />
              </label>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Add term</button>
              <button type="button" onClick={() => setNewLine(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
