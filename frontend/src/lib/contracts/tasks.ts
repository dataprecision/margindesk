import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

const DAY = 86_400_000;
const LOOK_BACK_DAYS = 120; // lapsed paper older than this is treated as closed business
const LOOK_AHEAD_DAYS = 90;
const LEAD_DAYS = 30; // renewals are due this long before the end date

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Create follow-up tasks from contract dates. Idempotent: each task carries an
 * auto_key, so re-running never duplicates a task and never reopens one a
 * person has completed or dismissed.
 */
export async function generateContractTasks(db: Db = defaultPrisma, today: Date = new Date()) {
  // Organisation-level agreements (MSA / NDA) ending within 90 days, or whose
  // notice deadline falls within 90 days: one follow-up per agreement, listing
  // the contracts it governs.
  const agreements = await db.agreement.findMany({ where: { end_date: { not: null } }, include: { client: { select: { name: true, legal_person: { select: { name: true } }, owner_person: { select: { name: true } } } }, contracts: { select: { counterparty: true, spoc: true } } } });
  for (const a of agreements) {
    const noticeDays = a.notice_days ?? 0;
    const deadline = new Date(a.end_date!.getTime() - noticeDays * 86_400_000);
    const daysLeft = Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
    if (daysLeft > 90 || daysLeft < -365) continue;
    const auto_key = `agreement-renewal:${a.id}:${a.end_date!.toISOString().slice(0, 10)}`;
    const existing = await db.contractTask.findUnique({ where: { auto_key } });
    if (existing) continue;
    const owner = a.client.legal_person?.name ?? a.client.owner_person?.name ?? a.contracts[0]?.spoc ?? null;
    await db.contractTask.create({ data: {
      auto_key, kind: "renewal", contract_id: null, owner, due_date: deadline < today ? today : deadline, created_by: "system",
      title: `${a.kind} ${daysLeft < 0 ? "expired" : "ends"} ${a.end_date!.toISOString().slice(0, 10)}: ${a.client.name}${noticeDays ? ` (notice ${noticeDays} days, deadline ${deadline.toISOString().slice(0, 10)})` : ""}`,
      detail: `${a.title}. Governs: ${a.contracts.map((c) => c.counterparty).join("; ") || "no contract linked"}.${a.auto_renewal ? " Auto-renews unless notice is given." : ""}`,
    } });
  }
  const from = new Date(today.getTime() - LOOK_BACK_DAYS * DAY);
  const to = new Date(today.getTime() + LOOK_AHEAD_DAYS * DAY);

  const contracts = await db.contract.findMany({
    where: { stage: { not: "closed" } },
    include: { lines: true, purchase_orders: true },
  });

  let created = 0;
  const ensure = async (data: {
    auto_key: string;
    contract_id: string;
    kind: string;
    title: string;
    detail?: string;
    due_date: Date;
    owner: string | null;
  }) => {
    const existing = await db.contractTask.findUnique({ where: { auto_key: data.auto_key } });
    if (existing) return;
    await db.contractTask.create({ data: { ...data, created_by: "system" } });
    created++;
  };

  for (const c of contracts) {
    // Billing lines grouped by the date they end. A line that has a successor
    // (same service, starting on or after the end date) is already renewed.
    const groups = new Map<string, typeof c.lines>();
    for (const line of c.lines) {
      if (!line.end_date || line.end_date < from || line.end_date > to) continue;
      const renewed = c.lines.some(
        (other) =>
          other.id !== line.id &&
          other.service === line.service &&
          other.start_date &&
          other.start_date >= line.end_date! &&
          (!other.end_date || other.end_date > line.end_date!)
      );
      if (renewed) continue;
      const key = iso(line.end_date);
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }

    for (const [key, lines] of groups) {
      const end = new Date(key);
      const lapsed = end < today;
      await ensure({
        auto_key: `renewal:${c.id}:${key}`,
        contract_id: c.id,
        kind: "renewal",
        title: lapsed
          ? `${c.counterparty}: ${lines.length} billing line${lines.length > 1 ? "s" : ""} ended on ${fmt(end)}. Confirm the renewal or stop billing.`
          : `${c.counterparty}: ${lines.length} billing line${lines.length > 1 ? "s" : ""} end${lines.length > 1 ? "" : "s"} on ${fmt(end)}. Start the renewal.`,
        detail: lines.map((l) => `${l.service} (${l.currency} ${l.amount_text}${l.unit ? " " + l.unit : ""})`).join("\n"),
        due_date: lapsed ? end : new Date(Math.max(end.getTime() - LEAD_DAYS * DAY, today.getTime())),
        owner: c.spoc,
      });
    }

    // The agreement itself, when it ends on a date no billing line already covers.
    // An expired agreement stays on the list however long ago it lapsed: work
    // may be continuing without paper.
    if (c.end_date && c.end_date <= to && !groups.has(iso(c.end_date))) {
      const lapsed = c.end_date < today;
      await ensure({
        auto_key: `contract:${c.id}:${iso(c.end_date)}`,
        contract_id: c.id,
        kind: "renewal",
        title: lapsed
          ? `${c.counterparty}: the agreement ended on ${fmt(c.end_date)}. Confirm whether work continues and get it renewed.`
          : `${c.counterparty}: the agreement ends on ${fmt(c.end_date)}. Start the renewal.`,
        due_date: lapsed ? c.end_date : new Date(Math.max(c.end_date.getTime() - LEAD_DAYS * DAY, today.getTime())),
        owner: c.spoc,
      });
    }

    // A customer agreement that is still in force but has no billing line in
    // force (every SOW or work order has lapsed) has nothing to bill against.
    const billable = c.direction === "customer" || c.direction === "both";
    const agreementLive = !c.end_date || c.end_date >= today;
    const anyLineLive = c.lines.some((l) => !l.end_date || l.end_date >= today);
    if (billable && agreementLive && c.lines.length > 0 && !anyLineLive) {
      const lastEnd = c.lines.reduce((max, l) => (l.end_date && l.end_date > max ? l.end_date : max), new Date(0));
      await ensure({
        auto_key: `no-live-line:${c.id}:${iso(lastEnd)}`,
        contract_id: c.id,
        kind: "renewal",
        title: `${c.counterparty}: no billing line is in force. The last one ended on ${fmt(lastEnd)}. Get a current SOW or work order.`,
        due_date: lastEnd,
        owner: c.spoc,
      });
    }

    // Purchase orders: chase the next one when the latest has run out.
    if (c.direction !== "vendor" && c.direction !== "nda") {
      const dated = c.purchase_orders.filter((p) => p.valid_to).sort((a, b) => b.valid_to!.getTime() - a.valid_to!.getTime());
      const latest = dated[0];
      if (latest && latest.valid_to! < today && latest.valid_to! >= from) {
        await ensure({
          auto_key: `po:${c.id}:${iso(latest.valid_to!)}`,
          contract_id: c.id,
          kind: "purchase_order",
          title: `${c.counterparty}: the latest PO (${latest.po_number}) ended on ${fmt(latest.valid_to!)}. Get the next PO.`,
          detail: latest.covers ?? undefined,
          due_date: latest.valid_to!,
          owner: c.spoc,
        });
      }
    }
  }

  return { created, contracts: contracts.length };
}
