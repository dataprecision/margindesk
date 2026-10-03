// Shared between API routes and pages: how a contract or billing line is
// classified from its dates.

export type ContractStatus = "Expired" | "Ending within 90 days" | "No end date" | "Starts later" | "In force";

export const STATUS_ORDER: ContractStatus[] = ["Expired", "Ending within 90 days", "No end date", "Starts later", "In force"];

const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function daysLeft(end: Date | string | null | undefined, today: Date = new Date()): number | null {
  if (!end) return null;
  return Math.round((startOfDay(new Date(end)) - startOfDay(today)) / DAY);
}

export function contractStatus(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  today: Date = new Date()
): ContractStatus {
  if (start && startOfDay(new Date(start)) > startOfDay(today)) return "Starts later";
  const left = daysLeft(end, today);
  if (left === null) return "No end date";
  if (left < 0) return "Expired";
  if (left <= 90) return "Ending within 90 days";
  return "In force";
}

export const CONTRACT_ROLES = ["owner", "finance", "legal"] as const;

export const BILLING_TYPES = [
  "Hourly rate",
  "Hours bundle",
  "Per person / FTE",
  "Fixed monthly fee",
  "Milestone",
  "Rate card",
  "Usage tiers",
  "Percent of spend",
  "One-time fee",
  "Other",
];

export const STAGES = [
  { value: "active", label: "Active" },
  { value: "renewal_in_progress", label: "Renewal in progress" },
  { value: "awaiting_signature", label: "Awaiting signature" },
  { value: "awaiting_po", label: "Awaiting PO" },
  { value: "closed", label: "Closed" },
];

/** 03 Oct 2026, or an em dash when there is no date. */
export const formatDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/** yyyy-mm-dd for <input type="date">. */
export const toDateInput = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const STATUS_STYLE: Record<ContractStatus, string> = {
  Expired: "bg-red-100 text-red-700",
  "Ending within 90 days": "bg-amber-100 text-amber-800",
  "No end date": "bg-indigo-100 text-indigo-700",
  "Starts later": "bg-indigo-100 text-indigo-700",
  "In force": "bg-green-100 text-green-700",
};

// Review buckets set when the contract reads were loaded: what a person must do
// before the contract can drive estimates.
export type ReviewBucket = "clean" | "open" | "document_awaited";
export const BUCKET_ORDER: ReviewBucket[] = ["clean", "open", "document_awaited"];
export const BUCKET_LABEL: Record<ReviewBucket, string> = {
  clean: "Clean: ready to confirm",
  open: "Open pointers to close",
  document_awaited: "Document awaited",
};
export const BUCKET_STYLE: Record<ReviewBucket, string> = {
  clean: "bg-green-100 text-green-700",
  open: "bg-amber-100 text-amber-800",
  document_awaited: "bg-red-100 text-red-700",
};
export const POINTER_LABEL: Record<string, string> = {
  paper: "No contract in effect",
  difference: "Invoice differs from the contract",
  contract_silent: "Invoiced, contract silent",
  incomplete: "Number missing",
  unreadable: "Signed copy unreadable",
  register: "Two readings disagree",
  uninvoiced: "In the contract, not invoiced",
};
