"use client";

import { useState } from "react";
import { PERIODS, SHAPES, SHAPE_BY_KEY, computeRule, missingParams, summariseRule, type Band, type ShapeField } from "@/lib/billing/shapes";

// How a term is billed: the shape editor the invoicing team uses on a term,
// and the one-line summary everyone else sees.

export interface TermShape {
  id: string;
  service: string;
  currency: string;
  shape: string | null;
  params: Record<string, any>;
  period: string | null;
  fx_rate: string | null;
  input_needed: string | null;
  advance_or_arrears: string | null;
  rule_status: "proposed" | "confirmed" | "retired";
  confirmed_by: string | null;
  confirmed_at: string | null;
  rule_evidence: { from_invoices?: { last_invoice?: string; last_amount?: number; last_wording?: string; months_billed?: string[]; contract_verdict?: string } } | null;
  // What the document says, shown beside the shape so it can be checked against it.
  billing_type?: string;
  amount_text?: string;
  unit?: string | null;
  quote?: string | null;
  source_document?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const money = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const RULE_STATUS_STYLE: Record<string, string> = { proposed: "bg-amber-100 text-amber-800", confirmed: "bg-green-100 text-green-700", retired: "bg-gray-100 text-gray-500" };
export const RULE_STATUS_LABEL: Record<string, string> = { proposed: "To confirm", confirmed: "Confirmed", retired: "Retired" };

function BandsEditor({ value, onChange }: { value: Band[]; onChange: (b: Band[]) => void }) {
  const bands = value.length ? value : [{ up_to: null, rate: 0 }];
  const set = (i: number, patch: Partial<Band>) => onChange(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-2">
      {bands.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="number" className={inputClass} placeholder="Up to (empty for the last band)" value={b.up_to ?? ""} onChange={(e) => set(i, { up_to: e.target.value === "" ? null : Number(e.target.value) })} />
          <input type="number" className={inputClass} placeholder="Rate or %" value={b.rate} onChange={(e) => set(i, { rate: Number(e.target.value) })} />
          <button type="button" onClick={() => onChange(bands.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline whitespace-nowrap">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...bands, { up_to: null, rate: 0 }])} className="text-xs text-blue-700 hover:underline">Add band</button>
    </div>
  );
}

export function Field({ field, value, onChange }: { field: ShapeField; value: any; onChange: (v: any) => void }) {
  const label = <span className="text-xs text-gray-600">{field.label}{field.required ? " *" : ""}</span>;
  if (field.type === "bands") {
    return (
      <div className="md:col-span-2">
        {label}
        {field.help && <div className="text-xs text-gray-500 mb-1">{field.help}</div>}
        <BandsEditor value={Array.isArray(value) ? value : []} onChange={onChange} />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        {label}
        <select className={inputClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {!field.options?.includes("") && <option value="">Choose…</option>}
          {field.options?.map((o) => <option key={o} value={o}>{o || "No breakdown"}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "text") {
    return (
      <label className="block md:col-span-4">
        {label}
        <textarea rows={2} className={inputClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        {field.help && <span className="text-xs text-gray-500">{field.help}</span>}
      </label>
    );
  }
  return (
    <label className="block">
      {label}
      <input type="number" step="any" className={inputClass} value={value ?? ""} placeholder={field.required ? "" : "none"} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      {field.help && <span className="text-xs text-gray-500">{field.help}</span>}
    </label>
  );
}

export function ShapeSummary({ term }: { term: TermShape }) {
  if (!term.shape) return <span className="text-xs text-amber-700">How it's billed not set</span>;
  const gaps = missingParams(term.shape, term.params ?? {});
  return (
    <div className="text-xs text-gray-700">
      <div><span className="font-medium text-gray-900">{SHAPE_BY_KEY[term.shape]?.label ?? term.shape}</span>{term.period ? ` · ${term.period}` : ""}</div>
      <div>{summariseRule(term.shape, term.params ?? {})}</div>
      {term.input_needed && <div className="text-gray-500">Each period: {term.input_needed}</div>}
      {gaps.length > 0 && <div className="text-amber-700">Still needed: {gaps.join(", ")}</div>}
    </div>
  );
}

export function TryIt({ term }: { term: { shape: string; params: Record<string, any>; currency: string } }) {
  const shape = SHAPE_BY_KEY[term.shape];
  const [inputs, setInputs] = useState<Record<string, any>>({});
  if (!shape) return null;
  const result = computeRule(term.shape, term.params, inputs);
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs font-medium text-gray-700 mb-2">Try a period</div>
      {shape.inputs.length > 0 && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">{shape.inputs.map((f) => <Field key={f.key} field={f} value={inputs[f.key]} onChange={(v) => setInputs({ ...inputs, [f.key]: v })} />)}</div>}
      {result.missing.length > 0 && !result.amount ? (
        <div className="text-xs text-gray-500">Enter {result.missing.map((k) => (shape.inputs.find((f) => f.key === k)?.label ?? k).toLowerCase()).join(", ")} to see what would be billed.</div>
      ) : (
        <div className="text-sm"><span className="font-semibold tabular-nums">{term.currency} {money(result.amount)}</span><span className="text-gray-600"> · {result.explanation}</span></div>
      )}
    </div>
  );
}

/** Panel over the page: set or change how one term is billed. */
export default function TermShapePanel({ term, saving, onSave, onClose }: {
  term: TermShape;
  saving: boolean;
  onSave: (patch: Partial<TermShape> & { params: Record<string, any> }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ shape: term.shape ?? "fixed", params: term.params ?? {}, period: term.period ?? "monthly", fx_rate: term.fx_rate ?? "", input_needed: term.input_needed ?? "", advance_or_arrears: term.advance_or_arrears ?? "" });
  const shape = SHAPE_BY_KEY[draft.shape];
  const setParam = (k: string, v: any) => setDraft({ ...draft, params: { ...draft.params, [k]: v } });
  const gaps = shape ? missingParams(draft.shape, draft.params) : ["shape"];
  const ev = term.rule_evidence?.from_invoices;
  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-start justify-center bg-gray-900/40 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl p-6 space-y-4 mt-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">How is this billed?</h2>
            <p className="text-sm text-gray-700 mt-1">{term.service}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">Close</button>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">What the document says</div>
          <div className="mt-1 text-gray-900">{term.billing_type ? <span className="text-gray-500">{term.billing_type}: </span> : null}{term.currency} {term.amount_text ?? ""}{term.unit ? <span className="text-gray-500"> {term.unit}</span> : null}</div>
          {term.quote && <div className="mt-1 text-xs text-gray-700">“{term.quote}”</div>}
          {term.source_document && <div className="mt-1 text-xs text-gray-500">{term.source_document}</div>}
        </div>
        {!term.shape && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No billing shape has been set for this term yet. Pick the shape that matches the wording above and fill in its numbers.</div>}
        {ev && (
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
            Past invoices: {ev.last_wording ? `“${ev.last_wording}”` : "billed"}{ev.last_amount != null ? ` · ${term.currency} ${money(Number(ev.last_amount))}` : ""}{ev.last_invoice ? ` (${ev.last_invoice})` : ""}{ev.months_billed?.length ? ` · ${ev.months_billed.length} month${ev.months_billed.length > 1 ? "s" : ""} this year` : ""}{ev.contract_verdict ? ` · ${ev.contract_verdict}` : ""}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-2">
            <span className="text-xs text-gray-600">Shape *</span>
            <select className={inputClass} value={draft.shape} onChange={(e) => setDraft({ ...draft, shape: e.target.value, params: {} })}>{SHAPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            {shape && <span className="text-xs text-gray-500">{shape.description}</span>}
          </label>
          <label className="block"><span className="text-xs text-gray-600">Billed</span><select className={inputClass} value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })}>{PERIODS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="block"><span className="text-xs text-gray-600">Timing</span>
            <select className={inputClass} value={/^adv/i.test(draft.advance_or_arrears) ? "advance" : /^arr/i.test(draft.advance_or_arrears) ? "arrears" : ""} onChange={(e) => setDraft({ ...draft, advance_or_arrears: e.target.value ? `${e.target.value}${draft.advance_or_arrears.replace(/^(advance|arrears)/i, "")}` : draft.advance_or_arrears })}>
              <option value="">Not stated</option><option value="arrears">In arrears</option><option value="advance">In advance</option>
            </select>
          </label>
        </div>
        <label className="block"><span className="text-xs text-gray-600">Timing, as the document puts it</span><textarea rows={2} className={inputClass} value={draft.advance_or_arrears} onChange={(e) => setDraft({ ...draft, advance_or_arrears: e.target.value })} placeholder="e.g. arrears, invoiced by the 5th working day of the following month" /></label>
        {shape && <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{shape.fields.map((f) => <Field key={f.key} field={f} value={draft.params?.[f.key]} onChange={(v) => setParam(f.key, v)} />)}</div>}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-3"><span className="text-xs text-gray-600">The number someone must supply each period</span><textarea rows={2} className={inputClass} value={draft.input_needed} onChange={(e) => setDraft({ ...draft, input_needed: e.target.value })} placeholder="e.g. approved hours from the timesheet; none for a fixed fee" /></label>
          {term.currency !== "INR" && <label className="block"><span className="text-xs text-gray-600">Fixed exchange rate</span><input className={inputClass} value={draft.fx_rate} onChange={(e) => setDraft({ ...draft, fx_rate: e.target.value })} placeholder="if the contract fixes one" /></label>}
        </div>
        {shape && <TryIt term={{ shape: draft.shape, params: draft.params, currency: term.currency }} />}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
          <button disabled={saving || !shape} onClick={async () => { if (await onSave({ shape: draft.shape, params: draft.params, period: draft.period, fx_rate: draft.fx_rate as any, input_needed: draft.input_needed, advance_or_arrears: draft.advance_or_arrears })) onClose(); }} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Save</button>
          <button disabled={saving || !shape || gaps.length > 0} title={gaps.length ? `Still needed: ${gaps.join(", ")}` : undefined} onClick={async () => { if (await onSave({ shape: draft.shape, params: draft.params, period: draft.period, fx_rate: draft.fx_rate as any, input_needed: draft.input_needed, advance_or_arrears: draft.advance_or_arrears, rule_status: "confirmed" })) onClose(); }} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-40">Save and confirm</button>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
