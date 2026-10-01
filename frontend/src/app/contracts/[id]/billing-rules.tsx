"use client";

import { useState } from "react";
import { PERIODS, SHAPES, SHAPE_BY_KEY, computeRule, missingParams, summariseRule, type Band, type ShapeField } from "@/lib/billing/shapes";

export interface BillingRule {
  id: string;
  service: string;
  label: string | null;
  family: string | null;
  shape: string;
  params: Record<string, any>;
  period: string;
  currency: string;
  fx_rate: string | null;
  source: string;
  status: "proposed" | "confirmed" | "retired";
  confidence: string | null;
  evidence: { form?: string; months_billed?: string[]; last_invoice?: string; last_month?: string; last_amount?: number; last_wording?: string; notes?: string[] } | null;
  notes: string | null;
  confirmed_by: string | null;
}

const STATUS_STYLE: Record<BillingRule["status"], string> = {
  proposed: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-700",
  retired: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<BillingRule["status"], string> = { proposed: "To confirm", confirmed: "Confirmed", retired: "Retired" };
const SOURCE_LABEL: Record<string, string> = { invoices: "From invoices", contract: "From the contract", manual: "Entered by hand" };
const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const money = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2 });

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

function Field({ field, value, onChange }: { field: ShapeField; value: any; onChange: (v: any) => void }) {
  const label = (
    <span className="text-xs text-gray-600">
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );
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
  return (
    <label className="block">
      {label}
      <input
        type={field.type === "text" ? "text" : "number"}
        step="any"
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(field.type === "text" ? e.target.value : e.target.value === "" ? "" : Number(e.target.value))}
      />
      {field.help && <span className="text-xs text-gray-500">{field.help}</span>}
    </label>
  );
}

function RuleEditor({ rule, onSave, onCancel, saving }: { rule: Partial<BillingRule>; onSave: (r: Partial<BillingRule>) => void; onCancel: () => void; saving: boolean }) {
  const [draft, setDraft] = useState<Partial<BillingRule>>({ shape: "fixed", period: "monthly", currency: "INR", params: {}, ...rule });
  const shape = SHAPE_BY_KEY[draft.shape ?? ""];
  const setParam = (k: string, v: any) => setDraft({ ...draft, params: { ...(draft.params ?? {}), [k]: v } });
  return (
    <div className="bg-blue-50 px-6 py-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="block md:col-span-2"><span className="text-xs text-gray-600">Service *</span><input className={inputClass} value={draft.service ?? ""} onChange={(e) => setDraft({ ...draft, service: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className="text-xs text-gray-600">Project, person or role</span><input className={inputClass} value={draft.label ?? ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
        <label className="block md:col-span-2">
          <span className="text-xs text-gray-600">How the amount is worked out *</span>
          <select className={inputClass} value={shape ? draft.shape : ""} onChange={(e) => setDraft({ ...draft, shape: e.target.value })}>
            {!shape && <option value="">Choose a shape…</option>}
            {SHAPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {shape && <span className="text-xs text-gray-500">{shape.description}</span>}
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Billed</span>
          <select className={inputClass} value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value })}>{PERIODS.map((p) => <option key={p}>{p}</option>)}</select>
        </label>
        <label className="block"><span className="text-xs text-gray-600">Currency</span><input className={inputClass} value={draft.currency ?? "INR"} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></label>
      </div>
      {shape && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {shape.fields.map((f) => <Field key={f.key} field={f} value={draft.params?.[f.key]} onChange={(v) => setParam(f.key, v)} />)}
        </div>
      )}
      <label className="block"><span className="text-xs text-gray-600">Notes</span><input className={inputClass} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <div className="flex gap-2">
        <button disabled={saving || !draft.service?.trim() || !shape} onClick={() => onSave(draft)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Save rule</button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm">Cancel</button>
      </div>
    </div>
  );
}

function TryIt({ rule }: { rule: BillingRule }) {
  const shape = SHAPE_BY_KEY[rule.shape];
  const [inputs, setInputs] = useState<Record<string, any>>({});
  if (!shape) return null;
  const result = computeRule(rule.shape, rule.params, inputs);
  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="text-xs font-medium text-gray-700 mb-2">Try a period</div>
      {shape.inputs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
          {shape.inputs.map((f) => <Field key={f.key} field={f} value={inputs[f.key]} onChange={(v) => setInputs({ ...inputs, [f.key]: v })} />)}
        </div>
      )}
      {result.missing.length > 0 && !result.amount ? (
        <div className="text-xs text-gray-500">Enter {result.missing.join(", ")} to see the amount.</div>
      ) : (
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{rule.currency} {money(result.amount)}</span>
          <span className="text-gray-600"> · {result.explanation}</span>
          {result.missing.length > 0 && <div className="text-xs text-amber-700">Missing on the rule: {result.missing.join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

export default function BillingRules({ contractId, rules, reload }: { contractId: string; rules: BillingRule[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const call = async (url: string, method: string, body?: unknown) => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      await reload();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const live = rules.filter((r) => r.status !== "retired");
  const confirmed = live.filter((r) => r.status === "confirmed").length;

  return (
    <section className="bg-white rounded-lg shadow">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Billing rules ({live.length})</h2>
          <p className="text-xs text-gray-500 mt-1">
            How each amount is worked out every period. {confirmed} of {live.length} confirmed. Only confirmed rules can be used for billing.
          </p>
        </div>
        {!adding && <button onClick={() => setAdding(true)} className="text-sm font-medium text-blue-700 hover:underline">Add rule</button>}
      </div>
      {error && <div className="mx-6 mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {adding && (
        <RuleEditor rule={{}} saving={saving} onCancel={() => setAdding(false)} onSave={async (d) => { if (await call(`/api/contracts/${contractId}/rules`, "POST", d)) setAdding(false); }} />
      )}
      <ul className="divide-y divide-gray-200">
        {rules.map((r) => {
          const gaps = missingParams(r.shape, r.params);
          return editing === r.id ? (
            <li key={r.id}>
              <RuleEditor rule={r} saving={saving} onCancel={() => setEditing(null)} onSave={async (d) => { if (await call(`/api/contracts/rules/${r.id}`, "PATCH", { service: d.service, label: d.label, shape: d.shape, params: d.params, period: d.period, currency: d.currency, notes: d.notes })) setEditing(null); }} />
            </li>
          ) : (
            <li key={r.id} className={`px-6 py-4 ${r.status === "retired" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{r.service}</span>
                    {r.label && <span className="text-sm text-gray-600">· {r.label}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-800">
                    <span className="font-medium">{SHAPE_BY_KEY[r.shape]?.label ?? "Shape not set"}</span>
                    <span className="text-gray-600"> · {r.currency} {summariseRule(r.shape, r.params)} · billed {r.period}</span>
                  </div>
                  {gaps.length > 0 && <div className="mt-1 text-xs text-amber-700">Still needed: {gaps.join(", ")}</div>}
                  <div className="mt-1 text-xs text-gray-500">
                    {SOURCE_LABEL[r.source] ?? r.source}
                    {r.confidence && r.status === "proposed" ? ` · ${r.confidence} confidence` : ""}
                    {r.confirmed_by ? ` · confirmed by ${r.confirmed_by}` : ""}
                    {r.evidence?.months_billed?.length ? ` · billed in ${r.evidence.months_billed.length} month${r.evidence.months_billed.length > 1 ? "s" : ""} this year` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs whitespace-nowrap">
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-blue-700 hover:underline">{open === r.id ? "Hide" : "Details"}</button>
                  <button onClick={() => setEditing(r.id)} className="text-blue-700 hover:underline">Edit</button>
                  {r.status === "proposed" && <button disabled={saving || gaps.length > 0} onClick={() => call(`/api/contracts/rules/${r.id}`, "PATCH", { status: "confirmed" })} className="text-green-700 font-medium hover:underline disabled:opacity-40 disabled:no-underline">Confirm</button>}
                  {r.status === "confirmed" && <button disabled={saving} onClick={() => call(`/api/contracts/rules/${r.id}`, "PATCH", { status: "proposed" })} className="text-gray-600 hover:underline">Unconfirm</button>}
                  {r.status !== "retired" ? (
                    <button disabled={saving} onClick={() => call(`/api/contracts/rules/${r.id}`, "PATCH", { status: "retired" })} className="text-gray-500 hover:underline">Retire</button>
                  ) : (
                    <button disabled={saving} onClick={() => call(`/api/contracts/rules/${r.id}`, "PATCH", { status: "proposed" })} className="text-blue-700 hover:underline">Restore</button>
                  )}
                </div>
              </div>
              {open === r.id && (
                <div className="mt-3">
                  {r.evidence?.last_wording && (
                    <div className="border-l-2 border-gray-200 pl-3 text-xs text-gray-600 space-y-1">
                      <div>
                        Last invoice {r.evidence.last_invoice} for {r.evidence.last_month}: {r.currency} {money(r.evidence.last_amount ?? 0)}
                      </div>
                      <div className="text-gray-900">“{r.evidence.last_wording}”</div>
                      {r.evidence.notes?.map((n, i) => <div key={i}>{n}</div>)}
                    </div>
                  )}
                  {r.params?.notes_from_invoice && <div className="mt-2 text-xs text-gray-600">From the invoice: {r.params.notes_from_invoice}</div>}
                  {r.notes && <div className="mt-2 text-xs text-gray-600">Notes: {r.notes}</div>}
                  <TryIt rule={r} />
                </div>
              )}
            </li>
          );
        })}
        {rules.length === 0 && !adding && <li className="px-6 py-8 text-center text-sm text-gray-500">No billing rules yet. Add one to record how this contract is billed each period.</li>}
      </ul>
    </section>
  );
}
