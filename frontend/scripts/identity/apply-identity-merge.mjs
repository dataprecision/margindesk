#!/usr/bin/env node
// Applies the identity reconciliation using the PersonIdentifier lookup
// (built by build-person-identifiers.mjs):
//   1. every TimesheetEntry on a non-Zoho (duplicate) Person moves to the
//      employment its email resolves to on the entry's work date;
//   2. entries on an employment outside its dates move to the same person's
//      covering employment (rehires, e.g. hours on a closed employment);
//   3. manager links, manager history and pod memberships of fully-drained
//      duplicates are repointed, then the empty duplicates are deleted;
//   4. with --sync-exits <zoho_employees.json>, employments that Zoho marks as
//      exited get their end_date and their open pod memberships closed.
// Duplicates holding salaries/leaves/allocations/pod ownership are never
// deleted (reported instead). Dry run by default; one transaction.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/identity/apply-identity-merge.mjs [--apply] [--allow-prod] [--sync-exits <file>] [--log <dir>]

import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
const argVal = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const exitsFile = argVal("--sync-exits");
const logDir = argVal("--log") ?? ".";
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const zohoDate = (s) => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((s ?? "").trim());
  return m ? new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1])) : null;
};

const prisma = new PrismaClient();

async function plan(db) {
  // Target employment per entry: identifier row for the source person's email
  // (duplicates) that covers the work date, else the latest started before it.
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS _entry_moves`);
  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _entry_moves AS
    WITH emp AS (
      SELECT p.id, (SELECT min(valid_from) FROM "PersonIdentifier" i WHERE i.person_id = p.id) vf,
                   (SELECT max(valid_to)   FROM "PersonIdentifier" i WHERE i.person_id = p.id) vt
      FROM "Person" p WHERE p.zoho_employee_id IS NOT NULL),
    src AS (
      SELECT t.id entry_id, t.person_id src, t.work_date, lower(p.email) email,
             (p.zoho_employee_id IS NULL) is_dup, e.vf, e.vt
      FROM "TimesheetEntry" t JOIN "Person" p ON p.id = t.person_id LEFT JOIN emp e ON e.id = p.id),
    cand AS (
      SELECT s.*, (SELECT i.person_id FROM "PersonIdentifier" i
                   WHERE i.kind = 'email' AND i.value = s.email
                   ORDER BY ((i.valid_from IS NULL OR i.valid_from <= s.work_date) AND (i.valid_to IS NULL OR i.valid_to >= s.work_date)) DESC,
                            (i.valid_from IS NULL OR i.valid_from <= s.work_date) DESC,
                            i.valid_from DESC NULLS LAST
                   LIMIT 1) dst
      FROM src s
      WHERE s.is_dup
         OR (s.vf IS NOT NULL AND s.work_date < s.vf)
         OR (s.vt IS NOT NULL AND s.work_date > s.vt))
    SELECT c.entry_id, c.src, c.dst, c.is_dup, c.work_date
    FROM cand c
    WHERE c.dst IS NOT NULL AND c.dst <> c.src
      -- an employment's own out-of-range hours only move if the target actually covers the date
      AND (c.is_dup OR EXISTS (SELECT 1 FROM "PersonIdentifier" i WHERE i.person_id = c.dst AND i.kind = 'email' AND i.value = (SELECT lower(email) FROM "Person" WHERE id = c.src)
                                 AND (i.valid_from IS NULL OR i.valid_from <= c.work_date) AND (i.valid_to IS NULL OR i.valid_to >= c.work_date)))`);

  const summary = await db.$queryRawUnsafe(`
    SELECT sp.email src_email, dp.email dst_email, dp.employee_code dst_code, bool_or(m.is_dup) is_dup,
           count(*)::int entries, round(sum(t.hours_logged)::numeric, 1)::float hours,
           to_char(min(m.work_date), 'YYYY-MM') first_month, to_char(max(m.work_date), 'YYYY-MM') last_month
    FROM _entry_moves m JOIN "Person" sp ON sp.id = m.src JOIN "Person" dp ON dp.id = m.dst JOIN "TimesheetEntry" t ON t.id = m.entry_id
    GROUP BY 1, 2, 3 ORDER BY entries DESC`);

  // Unique (person_id, project_id, work_date, source_row_hash) must hold after the move.
  const [{ n: collisions }] = await db.$queryRawUnsafe(`
    SELECT count(*)::int n FROM _entry_moves m JOIN "TimesheetEntry" a ON a.id = m.entry_id
    WHERE EXISTS (SELECT 1 FROM "TimesheetEntry" b WHERE b.person_id = m.dst AND b.project_id = a.project_id
                  AND b.work_date = a.work_date AND b.source_row_hash = a.source_row_hash)`);

  // Duplicates that will be empty afterwards: repoint links, then delete (unless they own other data).
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS _dup_targets`);
  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE _dup_targets AS
    SELECT p.id dup, (SELECT i.person_id FROM "PersonIdentifier" i WHERE i.kind = 'email' AND i.value = lower(p.email)
                      ORDER BY (i.valid_to IS NULL) DESC, i.valid_from DESC NULLS LAST LIMIT 1) dst,
      (SELECT count(*) FROM "PersonSalary" x WHERE x.person_id = p.id) + (SELECT count(*) FROM "Leave" x WHERE x.person_id = p.id)
      + (SELECT count(*) FROM "Allocation" x WHERE x.person_id = p.id) + (SELECT count(*) FROM "PodOwner" x WHERE x.person_id = p.id)
      + (SELECT count(*) FROM "FinancialPod" x WHERE x.leader_id = p.id) blocking,
      (SELECT count(*) FROM "TimesheetEntry" t WHERE t.person_id = p.id AND t.id NOT IN (SELECT entry_id FROM _entry_moves)) remaining_entries
    FROM "Person" p WHERE p.zoho_employee_id IS NULL`);
  const dups = await db.$queryRawUnsafe(`
    SELECT d.dup, d.dst, lower(p.email) email, d.blocking::int, d.remaining_entries::int FROM _dup_targets d JOIN "Person" p ON p.id = d.dup WHERE d.dst IS NOT NULL`);
  const deletable = dups.filter((d) => d.blocking === 0 && d.remaining_entries === 0);
  const kept = dups.filter((d) => !(d.blocking === 0 && d.remaining_entries === 0));
  return { summary, collisions, deletable, kept };
}

async function exitsPlan(db) {
  if (!exitsFile) return [];
  const zoho = JSON.parse(readFileSync(exitsFile, "utf8"));
  const out = [];
  for (const z of zoho) {
    const exit = zohoDate(z.Dateofexit);
    if (!exit || z.Employeestatus === "Active") continue;
    const p = await db.person.findUnique({ where: { zoho_employee_id: z.record_id }, select: { id: true, email: true, name: true, end_date: true } });
    if (p && !p.end_date) {
      const openPods = await db.podMembership.count({ where: { person_id: p.id, end_date: null } });
      out.push({ ...p, exit, status: z.Employeestatus, openPods });
    }
  }
  return out;
}

const pl = await plan(prisma);
const exits = await exitsPlan(prisma);
const totals = pl.summary.reduce((a, r) => ({ entries: a.entries + r.entries, hours: a.hours + r.hours }), { entries: 0, hours: 0 });
console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}\n`);
console.log(`Timesheet moves: ${pl.summary.length} source→employment pairs, ${totals.entries} entries, ${Math.round(totals.hours)} hours`);
console.log(`   from duplicate records: ${pl.summary.filter((r) => r.is_dup).length} pairs | between employments (rehire dates): ${pl.summary.filter((r) => !r.is_dup).length}`);
console.log(`Unique-key collisions after move: ${pl.collisions}`);
console.log(`Duplicate Person rows: ${pl.deletable.length} will be emptied and deleted, ${pl.kept.length} kept (own salaries/leaves or unresolved hours)`);
for (const k of pl.kept) console.log(`   kept ${k.email}: blocking refs ${k.blocking}, remaining entries ${k.remaining_entries}`);
console.log(`Missed exits to apply from Zoho: ${exits.length}${exits.length ? "" : exitsFile ? "" : " (pass --sync-exits to include)"}`);
for (const e of exits) console.log(`   ${e.email} ${e.name}: ${e.status} ${e.exit.toISOString().slice(0, 10)}, open pod memberships ${e.openPods}`);

if (pl.collisions > 0) { console.error("\nAborting: moves would violate the TimesheetEntry unique key."); await prisma.$disconnect(); process.exit(1); }
if (!apply) { console.log("\nDry run only. Re-run with --apply."); await prisma.$disconnect(); process.exit(0); }

const result = await prisma.$transaction(async (tx) => {
  await plan(tx); // rebuild temp tables inside the transaction's session
  const moved = await tx.$executeRawUnsafe(`
    UPDATE "TimesheetEntry" t SET person_id = m.dst, updated_at = now() FROM _entry_moves m WHERE t.id = m.entry_id`);
  const del = `(SELECT dup FROM _dup_targets WHERE dst IS NOT NULL AND blocking = 0 AND remaining_entries = 0)`;
  const mgr = await tx.$executeRawUnsafe(`
    UPDATE "Person" p SET manager_id = d.dst, updated_at = now() FROM _dup_targets d WHERE p.manager_id = d.dup AND d.dup IN ${del}`);
  const mhM = await tx.$executeRawUnsafe(`
    UPDATE "ManagerHistory" h SET manager_id = d.dst, updated_at = now() FROM _dup_targets d WHERE h.manager_id = d.dup AND d.dup IN ${del}`);
  const mhE = await tx.$executeRawUnsafe(`
    UPDATE "ManagerHistory" h SET person_id = d.dst, updated_at = now() FROM _dup_targets d WHERE h.person_id = d.dup AND d.dup IN ${del}`);
  const podDrop = await tx.$executeRawUnsafe(`
    DELETE FROM "PodMembership" m USING _dup_targets d WHERE m.person_id = d.dup AND d.dup IN ${del}
      AND EXISTS (SELECT 1 FROM "PodMembership" c WHERE c.person_id = d.dst AND c.pod_id = m.pod_id AND c.start_date = m.start_date)`);
  const pods = await tx.$executeRawUnsafe(`
    UPDATE "PodMembership" m SET person_id = d.dst, updated_at = now() FROM _dup_targets d WHERE m.person_id = d.dup AND d.dup IN ${del}`);
  const deleted = await tx.$executeRawUnsafe(`DELETE FROM "Person" WHERE id IN ${del}`);
  let exitsApplied = 0, podsClosed = 0;
  for (const e of exits) {
    await tx.person.update({ where: { id: e.id }, data: { end_date: e.exit } });
    podsClosed += (await tx.podMembership.updateMany({ where: { person_id: e.id, end_date: null }, data: { end_date: e.exit } })).count;
    exitsApplied++;
  }
  return { moved, direct_reports: mgr, manager_history_as_manager: mhM, manager_history_as_employee: mhE,
           pod_memberships_moved: pods, pod_memberships_dropped: podDrop, duplicates_deleted: deleted, exits_applied: exitsApplied, pods_closed_at_exit: podsClosed };
}, { timeout: 600_000, maxWait: 10_000 });

const file = `${logDir}/identity-merge-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ db: dbName, at: new Date().toISOString(), result, moves: pl.summary, kept: pl.kept, deleted: pl.deletable, exits }, null, 1));
console.log("\nApplied:", result);
console.log(`Log: ${file}`);
await prisma.$disconnect();
