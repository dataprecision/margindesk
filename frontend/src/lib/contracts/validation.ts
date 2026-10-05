// What each team must have in place before it can mark a contract checked.
// Used by the API (to refuse a premature sign-off) and by the pages (to show
// the queue). Pure functions over the contract row and its relations.

export interface ValidationInput {
  basis: string;
  bill_to: string | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
  spoc_person_id: string | null;
  po_status: string | null;
  review_bucket: string | null;
  documents: unknown;
  client: { placeholder: boolean; zoho_contact_id: string | null; gstin: string | null; billing_currency: string; payment_terms: number | null } | null;
  lines_with_shape: { rule_status: string; shape: string | null }[];
  purchase_orders: { status: string | null; value: unknown; valid_to: Date | string | null }[];
  paper_checked_at: Date | string | null;
  commercial_checked_at: Date | string | null;
  billing_checked_at: Date | string | null;
}

export type Team = "paper" | "commercial" | "billing";
export const TEAM_LABEL: Record<Team, string> = { paper: "Contracting (legal)", commercial: "Billing rules (invoicing)", billing: "Zoho and tax (invoicing)" };

export interface TeamCheck { team: Team; done: boolean; checked_at: Date | string | null; missing: string[]; items: { text: string; ok: boolean }[] }

const isWebLink = (d: any) => typeof d?.uri === "string" && /^https?:\/\//i.test(d.uri);

export function validationChecks(c: ValidationInput): TeamCheck[] {
  const docs = Array.isArray(c.documents) ? (c.documents as any[]) : [];
  const linked = docs.filter(isWebLink);
  // Invoicing confirms the billing shape on every term that has one.
  const live = c.lines_with_shape.filter((r) => r.shape && r.rule_status !== "retired");
  const confirmed = live.filter((r) => r.rule_status === "confirmed");
  const unshaped = c.lines_with_shape.filter((r) => !r.shape && r.rule_status !== "retired").length;
  const usesPo = /required|practice|issued|yes/i.test(c.po_status ?? "");
  const today = new Date();
  const validPo = c.purchase_orders.some((p) => p.value != null && (!p.valid_to || new Date(p.valid_to) >= today));

  const paper = [
    { text: linked.length ? `${linked.length} document link${linked.length > 1 ? "s" : ""} attached (SharePoint)` : "Attach the signed agreement and current PO as SharePoint links", ok: linked.length > 0 },
    { text: c.review_bucket === "document_awaited" ? `No contract in effect: ${c.basis}` : `Basis: ${c.basis}`, ok: c.review_bucket !== "document_awaited" },
    { text: c.start_date ? "Start date recorded" : "Start date missing", ok: !!c.start_date },
    { text: c.end_date ? "End date recorded" : "End date missing (leave only if the agreement truly has none)", ok: !!c.end_date },
    { text: c.bill_to ? `Invoiced to: ${c.bill_to}` : "Invoiced-to entity missing", ok: !!c.bill_to },
  ];
  const commercial = [
    { text: live.length ? `${confirmed.length} of ${live.length} billing terms confirmed` : "No billable term with a shape on this contract", ok: live.length > 0 && confirmed.length === live.length },
    { text: unshaped ? `${unshaped} term${unshaped > 1 ? "s" : ""} still without a billing shape` : "Every term has a billing shape", ok: unshaped === 0 },
    { text: c.spoc_person_id ? "SPOC set from People" : "SPOC not linked to a person", ok: !!c.spoc_person_id },
  ];
  const billing = [
    { text: !c.client ? "No company linked" : c.client.placeholder || !c.client.zoho_contact_id ? "Company not in Zoho Books yet" : "Company linked to Zoho Books", ok: !!c.client && !c.client.placeholder && !!c.client.zoho_contact_id },
    { text: c.client?.gstin ? `GSTIN ${c.client.gstin}` : c.client?.billing_currency && c.client.billing_currency !== "INR" ? `Overseas customer (${c.client.billing_currency}), no GSTIN needed` : "GSTIN missing on the company", ok: !!c.client?.gstin || (!!c.client?.billing_currency && c.client.billing_currency !== "INR") },
    { text: c.client?.payment_terms != null ? `Payment terms ${c.client.payment_terms} days` : "Payment terms not on the Zoho record", ok: c.client?.payment_terms != null },
    { text: usesPo ? (validPo ? "A valid PO with a value is on file" : "Customer uses POs: none valid with a value on file") : "Purchase orders not used", ok: !usesPo || validPo },
  ];
  const mk = (team: Team, items: typeof paper, at: Date | string | null): TeamCheck => ({ team, done: !!at, checked_at: at, missing: items.filter((i) => !i.ok).map((i) => i.text), items });
  return [mk("paper", paper, c.paper_checked_at), mk("commercial", commercial, c.commercial_checked_at), mk("billing", billing, c.billing_checked_at)];
}

/** The items a team must have before it may sign off; empty means it may. */
export function blockersFor(team: Team, c: ValidationInput): string[] {
  const check = validationChecks(c).find((t) => t.team === team)!;
  // Legal may sign off without an end date (some agreements have none); everything else is required.
  return check.items.filter((i) => !i.ok && !(team === "paper" && /End date missing/.test(i.text))).map((i) => i.text);
}
