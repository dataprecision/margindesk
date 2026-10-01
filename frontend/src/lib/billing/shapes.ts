// Billing shapes: the small set of ways an invoice amount is worked out.
// A billing rule is one shape plus its parameters. Each month the rule is
// given that month's inputs (hours, spend, hits ...) and returns an amount
// with a plain-language explanation of how it got there.
//
// To add a shape: add an entry to SHAPES with its fields, inputs and compute
// function. Nothing else needs to change; existing rules are unaffected.

export type FieldType = "number" | "text" | "percent" | "bands" | "select";

export interface ShapeField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  help?: string;
}

export interface Band {
  /** Upper limit of the band, in the rule's unit. Leave empty for the last band. */
  up_to: number | null;
  /** Rate per unit within the band, or a percentage when the shape says so. */
  rate: number;
}

export interface ComputeResult {
  amount: number;
  explanation: string;
  /** Inputs the shape needed but did not get. A result with missing inputs is not billable. */
  missing: string[];
}

export interface ShapeDefinition {
  key: string;
  label: string;
  description: string;
  fields: ShapeField[];
  /** Monthly inputs, e.g. approved hours. */
  inputs: ShapeField[];
  compute: (params: Record<string, any>, inputs: Record<string, any>) => ComputeResult;
  summarise: (params: Record<string, any>) => string;
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
};
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const fmt = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function need(inputs: Record<string, any>, keys: string[]): string[] {
  return keys.filter((k) => n(inputs[k]) === null);
}

/** Price a quantity through bands: each slice of the quantity is charged at its band's rate. */
export function priceInBands(quantity: number, bands: Band[], asPercent = false): { amount: number; parts: string[] } {
  let remaining = quantity;
  let floor = 0;
  let amount = 0;
  const parts: string[] = [];
  for (const band of bands) {
    if (remaining <= 0) break;
    const width = band.up_to === null ? remaining : Math.max(0, Math.min(remaining, band.up_to - floor));
    if (width > 0) {
      const part = asPercent ? (width * band.rate) / 100 : width * band.rate;
      amount += part;
      parts.push(`${fmt(width)} × ${fmt(band.rate)}${asPercent ? "%" : ""} = ${fmt(round2(part))}`);
      remaining -= width;
    }
    if (band.up_to !== null) floor = band.up_to;
  }
  return { amount: round2(amount), parts };
}

export const SHAPES: ShapeDefinition[] = [
  {
    key: "fixed",
    label: "Fixed amount",
    description: "An agreed amount per period.",
    fields: [
      { key: "amount", label: "Amount per period", type: "number", required: true },
      { key: "person", label: "Person or role", type: "text" },
      { key: "allocation_pct", label: "Share of time", type: "percent" },
    ],
    inputs: [],
    compute: (p) => {
      const amount = n(p.amount);
      if (amount === null) return { amount: 0, explanation: "No amount set on the rule.", missing: ["amount"] };
      return { amount: round2(amount), explanation: `Fixed amount of ${fmt(amount)}.`, missing: [] };
    },
    summarise: (p) => `${fmt(n(p.amount) ?? 0)} per period${p.person ? `, ${p.person}` : ""}${p.allocation_pct ? ` at ${p.allocation_pct}%` : ""}`,
  },
  {
    key: "quantity_rate",
    label: "Quantity × rate",
    description: "A count multiplied by a rate: hours, weeks, people, impressions or units.",
    fields: [
      { key: "rate", label: "Rate", type: "number", required: true },
      { key: "unit", label: "Unit", type: "select", required: true, options: ["hour", "week", "person per month", "thousand impressions", "creative", "unit"] },
      { key: "cap", label: "Most that can be billed (quantity)", type: "number" },
      { key: "allocation_pct", label: "Share of time", type: "percent" },
    ],
    inputs: [{ key: "quantity", label: "Quantity for the period", type: "number", required: true }],
    compute: (p, i) => {
      const missing = need(i, ["quantity"]);
      const rate = n(p.rate);
      if (rate === null) missing.push("rate");
      if (missing.length) return { amount: 0, explanation: "", missing };
      const cap = n(p.cap);
      const asked = n(i.quantity)!;
      const quantity = cap !== null ? Math.min(asked, cap) : asked;
      const capped = cap !== null && asked > cap ? ` (capped from ${fmt(asked)})` : "";
      return { amount: round2(quantity * rate!), explanation: `${fmt(quantity)} ${p.unit ?? "units"}${capped} × ${fmt(rate!)} = ${fmt(round2(quantity * rate!))}.`, missing: [] };
    },
    summarise: (p) => `${fmt(n(p.rate) ?? 0)} per ${p.unit ?? "unit"}${p.cap ? `, up to ${fmt(n(p.cap)!)}` : ""}`,
  },
  {
    key: "bundle",
    label: "Bundle with overage",
    description: "A fixed fee that includes a set quantity, with a rate for anything above it.",
    fields: [
      { key: "fee", label: "Fee per period", type: "number", required: true },
      { key: "included", label: "Quantity included", type: "number", required: true },
      { key: "unit", label: "Unit", type: "select", required: true, options: ["hours", "million hits", "units"] },
      { key: "overage_rate", label: "Rate above the included quantity", type: "number" },
      { key: "carry_forward", label: "Unused quantity carries forward", type: "select", options: ["no", "yes"] },
    ],
    inputs: [
      { key: "quantity", label: "Quantity used in the period", type: "number", required: true },
      { key: "carried_in", label: "Unused quantity brought forward", type: "number" },
    ],
    compute: (p, i) => {
      const missing = need(i, ["quantity"]);
      const fee = n(p.fee);
      const included = n(p.included);
      if (fee === null) missing.push("fee");
      if (included === null) missing.push("included");
      if (missing.length) return { amount: 0, explanation: "", missing };
      const allowance = included! + (p.carry_forward === "yes" ? n(i.carried_in) ?? 0 : 0);
      const over = Math.max(0, n(i.quantity)! - allowance);
      const overageRate = n(p.overage_rate);
      if (over > 0 && overageRate === null) {
        return { amount: round2(fee!), explanation: `Fee ${fmt(fee!)}. ${fmt(over)} ${p.unit ?? "units"} above the allowance, but the rule has no overage rate.`, missing: ["overage_rate"] };
      }
      const extra = over > 0 ? round2(over * overageRate!) : 0;
      return {
        amount: round2(fee! + extra),
        explanation: over > 0 ? `Fee ${fmt(fee!)} + ${fmt(over)} ${p.unit ?? "units"} over × ${fmt(overageRate!)} = ${fmt(round2(fee! + extra))}.` : `Fee ${fmt(fee!)}; usage is within the ${fmt(allowance)} ${p.unit ?? "units"} allowed.`,
        missing: [],
      };
    },
    summarise: (p) => `${fmt(n(p.fee) ?? 0)} for ${fmt(n(p.included) ?? 0)} ${p.unit ?? "units"}${p.overage_rate ? `, then ${fmt(n(p.overage_rate)!)} each` : ""}${p.carry_forward === "yes" ? ", unused carries forward" : ""}`,
  },
  {
    key: "bands",
    label: "Bands",
    description: "The quantity or spend is split into bands, each with its own rate or percentage.",
    fields: [
      { key: "bands", label: "Bands", type: "bands", required: true, help: "Upper limit and rate for each band. Leave the last limit empty." },
      { key: "band_type", label: "Each band is charged as", type: "select", required: true, options: ["rate per unit", "percent of amount"] },
      { key: "unit", label: "Unit", type: "select", options: ["million hits", "amount of spend", "units"] },
      { key: "free_up_to", label: "Quantity already covered elsewhere", type: "number", help: "For overage on top of a bundle: the quantity the bundle includes." },
    ],
    inputs: [{ key: "quantity", label: "Quantity or spend for the period", type: "number", required: true }],
    compute: (p, i) => {
      const missing = need(i, ["quantity"]);
      const bands: Band[] = Array.isArray(p.bands) ? p.bands : [];
      if (!bands.length) missing.push("bands");
      if (missing.length) return { amount: 0, explanation: "", missing };
      const billable = Math.max(0, n(i.quantity)! - (n(p.free_up_to) ?? 0));
      const { amount, parts } = priceInBands(billable, bands, p.band_type === "percent of amount");
      return { amount, explanation: parts.length ? `${parts.join("; ")}. Total ${fmt(amount)}.` : "Nothing above the covered quantity.", missing: [] };
    },
    summarise: (p) => {
      const bands: Band[] = Array.isArray(p.bands) ? p.bands : [];
      if (!bands.length) return "Bands not set";
      const pct = p.band_type === "percent of amount";
      return bands.map((b) => `${b.up_to === null ? "above" : `to ${fmt(b.up_to)}`}: ${fmt(b.rate)}${pct ? "%" : ""}`).join("; ");
    },
  },
  {
    key: "percent_of_base",
    label: "Percentage of a base",
    description: "A percentage of spend or of another invoice, with an optional minimum or cap.",
    fields: [
      { key: "percent", label: "Percentage", type: "percent", required: true },
      { key: "base", label: "Percentage of", type: "select", required: true, options: ["monthly spend", "combined spend across platforms", "partner invoice", "other amount"] },
      { key: "minimum", label: "Minimum fee", type: "number" },
      { key: "cap", label: "Maximum fee", type: "number" },
    ],
    inputs: [{ key: "base_amount", label: "Base amount for the period", type: "number", required: true }],
    compute: (p, i) => {
      const missing = need(i, ["base_amount"]);
      const percent = n(p.percent);
      if (percent === null) missing.push("percent");
      if (missing.length) return { amount: 0, explanation: "", missing };
      const raw = round2((n(i.base_amount)! * percent!) / 100);
      const min = n(p.minimum);
      const cap = n(p.cap);
      let amount = raw;
      let why = `${fmt(percent!)}% of ${fmt(n(i.base_amount)!)} = ${fmt(raw)}`;
      if (min !== null && raw < min) { amount = min; why += `; below the minimum, so ${fmt(min)}`; }
      if (cap !== null && amount > cap) { amount = cap; why += `; above the maximum, so ${fmt(cap)}`; }
      return { amount: round2(amount), explanation: `${why}.`, missing: [] };
    },
    summarise: (p) => `${fmt(n(p.percent) ?? 0)}% of ${p.base ?? "the base"}${p.minimum ? `, minimum ${fmt(n(p.minimum)!)}` : ""}${p.cap ? `, maximum ${fmt(n(p.cap)!)}` : ""}`,
  },
  {
    key: "pass_through",
    label: "Pass-through",
    description: "An actual cost billed on to the client, with an optional mark-up.",
    fields: [
      { key: "base", label: "Cost passed through", type: "select", required: true, options: ["platform spend", "cloud bill", "publisher bills", "other cost"] },
      { key: "markup_pct", label: "Mark-up", type: "percent" },
      { key: "breakdown", label: "One invoice line per", type: "select", options: ["", "advertiser", "publisher", "account"] },
    ],
    inputs: [{ key: "cost", label: "Actual cost for the period", type: "number", required: true }],
    compute: (p, i) => {
      const missing = need(i, ["cost"]);
      if (missing.length) return { amount: 0, explanation: "", missing };
      const cost = n(i.cost)!;
      const markup = n(p.markup_pct) ?? 0;
      const amount = round2(cost * (1 + markup / 100));
      return { amount, explanation: markup ? `${fmt(cost)} + ${fmt(markup)}% mark-up = ${fmt(amount)}.` : `Actual cost of ${fmt(cost)}, billed as it is.`, missing: [] };
    },
    summarise: (p) => `${p.base ?? "cost"} billed on${n(p.markup_pct) ? ` with ${fmt(n(p.markup_pct)!)}% mark-up` : ""}${p.breakdown ? `, one line per ${p.breakdown}` : ""}`,
  },
  {
    key: "milestone",
    label: "Milestone",
    description: "A fixed amount billed when a stage is reached.",
    fields: [
      { key: "amount", label: "Amount", type: "number", required: true },
      { key: "milestone", label: "Billed when", type: "text", required: true },
    ],
    inputs: [{ key: "reached", label: "Stage reached in this period", type: "select", options: ["no", "yes"], required: true }],
    compute: (p, i) => {
      const amount = n(p.amount);
      if (amount === null) return { amount: 0, explanation: "", missing: ["amount"] };
      if (i.reached !== "yes") return { amount: 0, explanation: "Stage not reached, so nothing to bill.", missing: [] };
      return { amount: round2(amount), explanation: `Stage reached: ${fmt(amount)}.`, missing: [] };
    },
    summarise: (p) => `${fmt(n(p.amount) ?? 0)} when ${p.milestone || "the stage is reached"}`,
  },
  {
    key: "manual",
    label: "Manual line",
    description: "Entered by a person each time, with a reason. For penalties, incentives and anything unusual.",
    fields: [{ key: "reason", label: "What this line is for", type: "text", required: true }],
    inputs: [{ key: "amount", label: "Amount for the period", type: "number", required: true }],
    compute: (_p, i) => {
      const missing = need(i, ["amount"]);
      if (missing.length) return { amount: 0, explanation: "", missing };
      return { amount: round2(n(i.amount)!), explanation: `Entered by hand: ${fmt(n(i.amount)!)}.`, missing: [] };
    },
    summarise: (p) => p.reason || "Entered by hand",
  },
];

export const SHAPE_BY_KEY: Record<string, ShapeDefinition> = Object.fromEntries(SHAPES.map((s) => [s.key, s]));

export const PERIODS = ["weekly", "monthly", "quarterly", "yearly", "one-time"] as const;

/** Compute a rule for one period. Unknown shapes return a clear, non-billable result. */
export function computeRule(shape: string, params: Record<string, any>, inputs: Record<string, any>): ComputeResult {
  const def = SHAPE_BY_KEY[shape];
  if (!def) return { amount: 0, explanation: `This rule has no shape yet, so it cannot be computed.`, missing: ["shape"] };
  return def.compute(params ?? {}, inputs ?? {});
}

/** One-line description of a rule's parameters, for tables. */
export function summariseRule(shape: string, params: Record<string, any>): string {
  const def = SHAPE_BY_KEY[shape];
  return def ? def.summarise(params ?? {}) : "Needs the agreement: the invoice does not say how the amount is worked out";
}

/** Required parameters that are not filled in. A rule with gaps cannot be confirmed. */
export function missingParams(shape: string, params: Record<string, any>): string[] {
  const def = SHAPE_BY_KEY[shape];
  if (!def) return ["shape"];
  return def.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = (params ?? {})[f.key];
      return f.type === "bands" ? !Array.isArray(v) || v.length === 0 : v === null || v === undefined || v === "";
    })
    .map((f) => f.label);
}
