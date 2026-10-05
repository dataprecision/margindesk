"use client";

import { useState } from "react";
import { PERIODS, SHAPES, SHAPE_BY_KEY, missingParams } from "@/lib/billing/shapes";
import { BILLING_TYPES, formatDate } from "@/lib/contracts/status";
import { Field, ShapeSummary, TryIt, type TermShape } from "./term-shape";
import SharePointPicker from "./sharepoint-picker";

// One panel for a billing line: what the document says (contracting's half)
// and how it is billed (invoicing's half). Used to add a line, edit it, or
// record a change from a date, which starts a new dated version rather than
// overwriting the old one.

export interface PanelLine extends TermShape {
  billing_type: string;
  amount_text: string;
  unit: string | null;
  quote: string | null;
  source_document: string | null;
  start_date: string | null;
  end_date: string | null;
  read_from: string;
}
export interface PanelDoc { name: string; uri?: string | null; type?: string | null }
export type PanelMode = "add" | "edit" | "revise";

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const day = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function LinePanel({ mode, line, presetDocument, contractId, clientId, documents, role, saving, call, onAttach, onClose }: {
  mode: PanelMode;
  line?: PanelLine;
  presetDocument?: string;
  contractId: string;
  clientId?: string | null;
  documents: PanelDoc[];
  role?: string;
  saving: boolean;
  call: (url: string, method: string, body?: unknown) => Promise<boolean>;
  onAttach: (files: { name: string; uri: string }[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const canWording = role !== "billing";
  const canBilling = role !== "legal";
  const docName = line ? documents.find((d) => d.name && (line.source_document ?? "").toLowerCase().includes(d.name.toLowerCase()))?.name ?? line.source_document ?? "" : presetDocument ?? "";
  const [w, setW] = useState({
    service: line?.service ?? "", billing_type: line?.billing_type ?? "Fixed monthly fee", amount_text: line?.amount_text ?? "", unit: line?.unit ?? "per month",
    currency: line?.currency ?? "INR", start_date: mode === "revise" ? "" : day(line?.start_date), end_date: day(line?.end_date),
    source_document: docName, quote: line?.quote ?? "", read_from: line?.read_from ?? (/po|purchase/i.test(documents.find((d) => d.name === docName)?.type ?? "") ? "Purchase order" : "Contract"),
  });
  const [b, setB] = useState({ shape: line?.shape ?? "", params: (line?.params ?? {}) as Record<string, any>, period: line?.period ?? "monthly", advance_or_arrears: line?.advance_or_arrears ?? "", input_needed: line?.input_needed ?? "", fx_rate: line?.fx_rate ?? "" });
  const [effective, setEffective] = useState("");
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState("");
  const shape = SHAPE_BY_KEY[b.shape];
  const gaps = shape ? missingParams(b.shape, b.params) : [];
  const ev = line?.rule_evidence?.from_invoices;

  const submit = async (confirm: boolean) => {
    setProblem("");
    if (canWording && (!w.service.trim() || !w.amount_text.trim())) { setProblem("Service and the amount as written are required."); return; }
    if (mode === "revise" && !effective) { setProblem("Say the date the change takes effect."); return; }
    const body: Record<string, unknown> = {
      ...(canWording ? w : {}),
      ...(canBilling ? { shape: b.shape || null, params: b.params, period: b.period, advance_or_arrears: b.advance_or_arrears, input_needed: b.input_needed, fx_rate: b.fx_rate } : {}),
      ...(confirm ? { rule_status: "confirmed" } : {}),
    };
    let ok: boolean;
    if (mode === "add") ok = await call(`/api/contracts/${contractId}/lines`, "POST", body);
    else if (mode === "edit") ok = await call(`/api/contracts/lines/${line!.id}`, "PATCH", body);
    else {
      delete body.start_date;
      ok = await call(`/api/contracts/lines/${line!.id}/revise`, "POST", { ...body, effective_from: effective });
      if (ok && confirm) { /* the new version starts as "to confirm"; confirming is one click on the row */ }
    }
    if (ok) onClose();
  };

  const title = mode === "add" ? "Add a billing line" : mode === "edit" ? "Edit billing line" : "Change from a date";
  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-start justify-center bg-gray-900/40 p-3 sm:p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl p-4 sm:p-6 space-y-5 my-4 sm:my-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {mode === "revise"
                ? "Use this when a price or the wording changes from a date (an addendum, a renewal, an escalation). The current line is kept and closed the day before; a new version starts on the date you give."
                : "A billing line is one chargeable thing in the contract: a fee, a rate, an hours bundle, a milestone. The top half is what the document says; the bottom half is how the amount is worked out each period."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">Close</button>
        </div>

        {mode === "revise" && line && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="text-xs text-blue-900">Current version: {line.currency} {line.amount_text}, in force {formatDate(line.start_date)} → {formatDate(line.end_date)}.</div>
            <label className="mt-2 block text-sm text-gray-800 max-w-xs">Change takes effect on<input type="date" className={inputClass} value={effective} onChange={(e) => setEffective(e.target.value)} required /></label>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">What the document says <span className="font-normal text-gray-500">· contracting</span></h3>
          {canWording ? (
            <>
              <div>
                <label className="block text-sm text-gray-700">Document
                  <select className={inputClass} value={picking ? "__pick" : w.source_document} onChange={(e) => { if (e.target.value === "__pick") setPicking(true); else { setPicking(false); setW({ ...w, source_document: e.target.value }); } }}>
                    <option value="">Not recorded</option>
                    {documents.map((d, i) => <option key={i} value={d.name}>{d.name}{d.type ? ` (${d.type})` : ""}</option>)}
                    {w.source_document && !documents.some((d) => d.name === w.source_document) && <option value={w.source_document}>{w.source_document} (not attached)</option>}
                    {clientId && <option value="__pick">Pick a new document from SharePoint…</option>}
                  </select>
                </label>
                {picking && clientId && (
                  <div className="mt-2">
                    <SharePointPicker clientId={clientId} alreadyAttached={documents.map((d) => d.uri ?? "").filter(Boolean)} saving={saving} onClose={() => setPicking(false)}
                      onAttach={async (files) => { const ok = await onAttach(files); if (ok && files[0]) setW((x) => ({ ...x, source_document: files[0].name })); return ok; }} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block text-sm text-gray-700 md:col-span-2">Service<input className={inputClass} value={w.service} onChange={(e) => setW({ ...w, service: e.target.value })} placeholder="e.g. Adobe Analytics consulting retainer" /></label>
                <label className="block text-sm text-gray-700 md:col-span-2">Amount as written<input className={inputClass} value={w.amount_text} onChange={(e) => setW({ ...w, amount_text: e.target.value })} placeholder="e.g. 2,50,000 per month for 100 hours" /></label>
                <label className="block text-sm text-gray-700">Kind<select className={inputClass} value={w.billing_type} onChange={(e) => setW({ ...w, billing_type: e.target.value })}>{BILLING_TYPES.map((t) => <option key={t}>{t}</option>)}{!BILLING_TYPES.includes(w.billing_type) && <option>{w.billing_type}</option>}</select></label>
                <label className="block text-sm text-gray-700">Read from<select className={inputClass} value={w.read_from} onChange={(e) => setW({ ...w, read_from: e.target.value })}>{["Contract", "Purchase order", "Unsigned draft", ...(["Contract", "Purchase order", "Unsigned draft"].includes(w.read_from) ? [] : [w.read_from])].map((t) => <option key={t}>{t}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm text-gray-700">Unit<input className={inputClass} value={w.unit} onChange={(e) => setW({ ...w, unit: e.target.value })} placeholder="per month" /></label>
                  <label className="block text-sm text-gray-700">Currency<input className={inputClass} value={w.currency} onChange={(e) => setW({ ...w, currency: e.target.value.toUpperCase() })} /></label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {mode !== "revise" && <label className="block text-sm text-gray-700">In force from<input type="date" className={inputClass} value={w.start_date} onChange={(e) => setW({ ...w, start_date: e.target.value })} /></label>}
                  <label className="block text-sm text-gray-700">Until<input type="date" className={inputClass} value={w.end_date} onChange={(e) => setW({ ...w, end_date: e.target.value })} /></label>
                </div>
                <label className="block text-sm text-gray-700 md:col-span-2">Clause as written, and where (page or clause number)
                  <textarea className={inputClass} rows={3} value={w.quote} onChange={(e) => setW({ ...w, quote: e.target.value })} placeholder="Paste the sentence from the document, e.g. “The Client shall pay a monthly retainer of INR 2,50,000…” (Annexure 1, cl. 3, p. 8)" />
                </label>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="text-gray-900"><span className="font-medium">{w.service}</span></div>
              <div className="mt-1 text-gray-900"><span className="text-gray-500">{w.billing_type}: </span>{w.currency} {w.amount_text}{w.unit ? <span className="text-gray-500"> {w.unit}</span> : null}</div>
              <div className="mt-1 text-xs text-gray-600">In force {formatDate(line?.start_date)} → {formatDate(line?.end_date)}</div>
              {w.quote && <div className="mt-1 text-xs text-gray-700">“{w.quote}”</div>}
              {w.source_document && <div className="mt-1 text-xs text-gray-500">{w.source_document}</div>}
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">How it is billed <span className="font-normal text-gray-500">· invoicing</span></h3>
          {ev && (
            <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
              Past invoices: {ev.last_wording ? `“${ev.last_wording}”` : "billed"}{ev.last_amount != null ? ` · ${w.currency} ${Number(ev.last_amount).toLocaleString("en-IN")}` : ""}{ev.last_invoice ? ` (${ev.last_invoice})` : ""}{ev.months_billed?.length ? ` · ${ev.months_billed.length} month${ev.months_billed.length > 1 ? "s" : ""} this year` : ""}{ev.contract_verdict ? ` · ${ev.contract_verdict}` : ""}
            </div>
          )}
          {canBilling ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="block md:col-span-2">
                  <span className="text-xs text-gray-600">Shape</span>
                  <select className={inputClass} value={b.shape} onChange={(e) => setB({ ...b, shape: e.target.value, params: e.target.value === (line?.shape ?? "") ? (line?.params ?? {}) : {} })}>
                    <option value="">Not set yet</option>
                    {SHAPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  {shape && <span className="text-xs text-gray-500">{shape.description}</span>}
                </label>
                <label className="block"><span className="text-xs text-gray-600">Billed</span><select className={inputClass} value={b.period} onChange={(e) => setB({ ...b, period: e.target.value })}>{PERIODS.map((p) => <option key={p}>{p}</option>)}</select></label>
                <label className="block"><span className="text-xs text-gray-600">Timing</span>
                  <select className={inputClass} value={/^adv/i.test(b.advance_or_arrears) ? "advance" : /^arr/i.test(b.advance_or_arrears) ? "arrears" : ""} onChange={(e) => setB({ ...b, advance_or_arrears: e.target.value ? `${e.target.value}${b.advance_or_arrears.replace(/^(advance|arrears)/i, "")}` : b.advance_or_arrears })}>
                    <option value="">Not stated</option><option value="arrears">In arrears</option><option value="advance">In advance</option>
                  </select>
                </label>
              </div>
              {shape && <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{shape.fields.map((f) => <Field key={f.key} field={f} value={b.params?.[f.key]} onChange={(v) => setB({ ...b, params: { ...b.params, [f.key]: v } })} />)}</div>}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="block md:col-span-2"><span className="text-xs text-gray-600">Timing, as the document puts it</span><textarea rows={2} className={inputClass} value={b.advance_or_arrears} onChange={(e) => setB({ ...b, advance_or_arrears: e.target.value })} placeholder="e.g. arrears, invoiced by the 5th working day" /></label>
                <label className="block md:col-span-2"><span className="text-xs text-gray-600">The number someone must supply each period</span><textarea rows={2} className={inputClass} value={b.input_needed} onChange={(e) => setB({ ...b, input_needed: e.target.value })} placeholder="e.g. approved hours; none for a fixed fee" /></label>
                {w.currency !== "INR" && <label className="block"><span className="text-xs text-gray-600">Fixed exchange rate</span><input className={inputClass} value={b.fx_rate} onChange={(e) => setB({ ...b, fx_rate: e.target.value })} placeholder="if the contract fixes one" /></label>}
              </div>
              {shape && gaps.length > 0 && <div className="text-xs text-amber-700">Still needed before it can be confirmed: {gaps.join(", ")}</div>}
              {shape && <TryIt term={{ shape: b.shape, params: b.params, currency: w.currency }} />}
            </>
          ) : line ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3"><ShapeSummary term={line} /></div>
          ) : (
            <div className="text-xs text-gray-500">Invoicing sets how the line is billed after you add it.</div>
          )}
        </section>

        {problem && <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">{problem}</div>}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
          <button disabled={saving} onClick={() => submit(false)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{mode === "add" ? "Add billing line" : mode === "edit" ? "Save" : "Record the change"}</button>
          {canBilling && mode !== "revise" && <button disabled={saving || !shape || gaps.length > 0} title={!shape ? "Set the shape first" : gaps.length ? `Still needed: ${gaps.join(", ")}` : undefined} onClick={() => submit(true)} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-40">Save and confirm billing</button>}
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
