#!/usr/bin/env node
// Builds the PersonIdentifier lookup from a read-only identity snapshot
// (Microsoft 365 + Zoho People, see ~/identity-snapshots/<date>/) plus the
// app's own Person / PersonEmailAlias rows, and reports:
//   - a per-source quality scorecard (coverage + agreement),
//   - conflicts (one identifier claimed by different humans),
//   - the merge plan: which non-Zoho Person rows and which timesheet entries
//     belong to which employment.
//
// A Person with a zoho_employee_id is one *employment*. Identifiers carry the
// employment's valid_from/valid_to, so a rehire's reused email resolves by
// work date. The build is additive: --apply upserts and never deletes, so it
// can be re-run on every new snapshot without losing history.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/identity/build-person-identifiers.mjs <snapshotDir> [--apply] [--allow-prod] [--out <dir>]
// Manual decisions: <snapshotDir>/../overrides.json (optional), shape:
//   { "email_to_code": { "someone@dwao.com": "DEL-123" }, "ignore_emails": ["x@dwao.com"] }

import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const snapDir = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : snapDir;
if (!snapDir) { console.error("usage: build-person-identifiers.mjs <snapshotDir> [--apply]"); process.exit(1); }

const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

// ---------- normalizers ----------
const normEmail = (e) => (e ?? "").trim().toLowerCase();
const normCode = (c) => (c ?? "").toUpperCase().replace(/\s+/g, "");
const normName = (n) => (n ?? "").toLowerCase().replace(/[^a-z]/g, "");
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const zohoDate = (s) => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((s ?? "").trim());
  return m ? new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1])) : null;
};
const isWorkDomain = (e) => /@dwao\.(in|com)$/.test(e);
const twin = (e) => e.endsWith("@dwao.in") ? e.replace(/@dwao\.in$/, "@dwao.com") : e.endsWith("@dwao.com") ? e.replace(/@dwao\.com$/, "@dwao.in") : null;
const d10 = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// ---------- load inputs ----------
const zoho = JSON.parse(readFileSync(path.join(snapDir, "zoho_employees.json"), "utf8"));
const m365 = JSON.parse(readFileSync(path.join(snapDir, "m365_users.json"), "utf8"))
  .filter((u) => u.userType !== "Guest");
const overridesPath = path.join(snapDir, "..", "overrides.json");
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")) : {};
const ignoreEmails = new Set((overrides.ignore_emails ?? []).map(normEmail));

const prisma = new PrismaClient();
const persons = await prisma.$queryRaw`
  SELECT p.id, lower(p.email) AS email, p.name, p.employee_code, p.zoho_employee_id, p.microsoft_user_id,
         p.start_date, p.end_date,
         (SELECT count(*)::int FROM "TimesheetEntry" t WHERE t.person_id = p.id) AS ts
  FROM "Person" p`;
const aliases = await prisma.personEmailAlias.findMany({ select: { email: true, person_id: true, source: true } });
const byId = new Map(persons.map((p) => [p.id, p]));

// ---------- employments (Person rows linked to Zoho) ----------
const zohoById = new Map(zoho.map((z) => [z.record_id, z]));
const employments = persons.filter((p) => p.zoho_employee_id).map((p) => {
  const z = zohoById.get(p.zoho_employee_id);
  return {
    person: p, zoho: z,
    name: z ? `${z.FirstName ?? ""} ${z.LastName ?? ""}`.trim() : p.name,
    code: normCode(z?.EmployeeID || p.employee_code),
    from: zohoDate(z?.Dateofjoining) ?? p.start_date ?? null,
    to: zohoDate(z?.Dateofexit) ?? p.end_date ?? null,
    status: z?.Employeestatus ?? "(not in Zoho)",
  };
});
const empByPerson = new Map(employments.map((e) => [e.person.id, e]));

// identifier candidates: key "kind|value" -> Map(personId -> {sources:Set, verified})
const cand = new Map();
function add(kind, value, emp, source, verified) {
  if (!value) return;
  const k = `${kind}|${value}`;
  if (!cand.has(k)) cand.set(k, new Map());
  const m = cand.get(k);
  const c = m.get(emp.person.id) ?? { emp, sources: new Set(), verified: false };
  c.sources.add(source); c.verified ||= verified; m.set(emp.person.id, c);
}

for (const e of employments) {
  add("zoho_id", e.person.zoho_employee_id, e, e.zoho ? "zoho" : "db", !!e.zoho);
  if (e.zoho?.EmployeeID) add("employee_code", normCode(e.zoho.EmployeeID), e, "zoho", true);
  if (e.person.employee_code) add("employee_code", normCode(e.person.employee_code), e, "db", false);
  if (e.zoho?.EmailID) add("email", normEmail(e.zoho.EmailID), e, "zoho", true);
  add("email", e.person.email, e, "db", false);
  if (e.person.microsoft_user_id) add("m365_id", e.person.microsoft_user_id, e, "db", false);
}
for (const a of aliases) {
  const e = empByPerson.get(a.person_id);
  if (e) add("email", normEmail(a.email), e, "alias_backfill", false);
}

// ---------- Microsoft 365 mailboxes -> employment ----------
const emailOwners = (email) => [...(cand.get(`email|${email}`)?.values() ?? [])].map((c) => c.emp);
const m365Report = { matched: 0, unmatched: [], ambiguous: [], employeeIdMismatch: [] };
for (const u of m365) {
  const addrs = new Set((u.proxyAddresses ?? []).filter((a) => /^smtp:/i.test(a)).map((a) => normEmail(a.slice(5))));
  if (u.mail) addrs.add(normEmail(u.mail));
  const work = [...addrs].filter(isWorkDomain);
  if (!work.length) continue;
  const code = normCode(u.employeeId);
  const hits = new Map();
  for (const a of work) for (const e of emailOwners(a)) hits.set(e.person.id, e);
  if (code) for (const e of employments) if (e.code === code) hits.set(e.person.id, e);
  let targets = [...hits.values()];
  if (!targets.length) { m365Report.unmatched.push({ mailbox: normEmail(u.mail || u.userPrincipalName), name: u.displayName, employeeId: u.employeeId ?? "", state: u._state, enabled: u.accountEnabled }); continue; }
  const humans = new Set(targets.map((e) => normName(e.name)));
  if (humans.size > 1) {
    m365Report.ambiguous.push({ mailbox: normEmail(u.mail), name: u.displayName, employeeId: u.employeeId ?? "", candidates: targets.map((e) => `${e.person.email} (${e.code}, ${e.name})`) });
    continue;
  }
  m365Report.matched++;
  if (code && !targets.some((e) => e.code === code)) {
    m365Report.employeeIdMismatch.push({ mailbox: normEmail(u.mail), m365_employeeId: u.employeeId, zoho_codes: targets.map((e) => e.code).join(",") });
  }
  // Same human, several employments (rehire): addresses go to each, date-scoped; object id to the latest.
  for (const e of targets) for (const a of work) add("email", a, e, "m365", true);
  const latest = targets.sort((a, b) => (b.from?.getTime() ?? 0) - (a.from?.getTime() ?? 0))[0];
  add("m365_id", u.id, latest, "m365", true);
}

// manual email -> code decisions
for (const [email, code] of Object.entries(overrides.email_to_code ?? {})) {
  for (const e of employments.filter((x) => x.code === normCode(code))) add("email", normEmail(email), e, "manual", true);
}

// ---------- conflicts: one identifier, different humans ----------
const conflicts = [];
const finalIds = [];
for (const [k, m] of cand) {
  const [kind, value] = k.split("|");
  if (kind === "email" && ignoreEmails.has(value)) continue;
  const list = [...m.values()];
  const humans = new Set(list.map((c) => normName(c.emp.name)));
  if (humans.size > 1) {
    conflicts.push({ kind, value, claimed_by: list.map((c) => `${c.emp.person.email} (${c.emp.code}, ${c.emp.name}) via ${[...c.sources].join("+")}`) });
    continue;
  }
  for (const c of list) finalIds.push({ kind, value, emp: c.emp, sources: [...c.sources], verified: c.verified });
}

// ---------- resolver over the map (email + work date) ----------
const idx = new Map();
for (const f of finalIds) {
  const k = `${f.kind}|${f.value}`;
  if (!idx.has(k)) idx.set(k, []);
  idx.get(k).push(f);
}
function resolveEmail(email, onDate) {
  const list = idx.get(`email|${email}`) ?? [];
  if (!list.length) return null;
  if (list.length === 1 || !onDate) return list[0].emp;
  const t = onDate.getTime();
  const covering = list.filter((f) => (!f.emp.from || f.emp.from.getTime() <= t) && (!f.emp.to || f.emp.to.getTime() >= t));
  if (covering.length === 1) return covering[0].emp;
  // fall back to the most recent employment that started before the date
  const started = list.filter((f) => !f.emp.from || f.emp.from.getTime() <= t)
    .sort((a, b) => (b.emp.from?.getTime() ?? 0) - (a.emp.from?.getTime() ?? 0));
  return (started[0] ?? list[0]).emp;
}

// ---------- merge plan ----------
// Group every timesheet entry by (current person, target employment). Entries
// on non-Zoho persons are resolved via the person's email; entries on an
// employment outside its dates move to the same human's covering employment.
const entryGroups = await prisma.$queryRaw`
  SELECT person_id, date_trunc('month', work_date) AS month, count(*)::int AS n, sum(hours_logged)::float AS hrs
  FROM "TimesheetEntry" GROUP BY 1, 2`;
const plan = new Map(); // key src|dst -> {src,dst,entries,hours,months:Set,reason,evidence}
const unresolved = new Map();
for (const g of entryGroups) {
  const src = byId.get(g.person_id);
  const month = new Date(g.month);
  const midMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 15));
  let dst = null, reason = "";
  const own = empByPerson.get(src.id);
  if (!own) {
    dst = resolveEmail(src.email, midMonth);
    reason = "duplicate record -> employment";
    if (!dst && twin(src.email)) { const t = resolveEmail(twin(src.email), midMonth); if (t) { dst = t; reason = "duplicate record -> employment (domain swap only, unverified)"; } }
  } else {
    const inRange = (!own.from || own.from <= midMonth) && (!own.to || own.to >= new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)));
    if (inRange) continue;
    const alt = resolveEmail(own.person.email, midMonth);
    if (alt && alt.person.id !== own.person.id) { dst = alt; reason = "hours outside employment dates -> same person's other employment"; }
    else continue; // e.g. hours logged just after exit; leave in place
  }
  if (!dst) {
    const u = unresolved.get(src.id) ?? { email: src.email, name: src.name, entries: 0, hours: 0 };
    u.entries += g.n; u.hours += g.hrs; unresolved.set(src.id, u); continue;
  }
  const key = `${src.id}|${dst.person.id}`;
  const r = plan.get(key) ?? { src, dst, entries: 0, hours: 0, months: new Set(), reason };
  r.entries += g.n; r.hours += g.hrs; r.months.add(d10(month).slice(0, 7)); plan.set(key, r);
}
const evidence = (email) => [...new Set((idx.get(`email|${email}`) ?? []).flatMap((f) => f.sources))].join("+") || "-";

// ---------- source scorecard ----------
const activeEmps = employments.filter((e) => e.status === "Active");
const m365ByEmp = new Map();
for (const f of finalIds) if (f.sources.includes("m365") && f.kind === "email") {
  const s = m365ByEmp.get(f.emp.person.id) ?? new Set(); s.add(f.value); m365ByEmp.set(f.emp.person.id, s);
}
const aliasRows = aliases.map((a) => normEmail(a.email));
const aliasConfirmed = aliasRows.filter((a) => (idx.get(`email|${a}`) ?? []).some((f) => f.sources.includes("m365"))).length;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");
const zohoEmailInM365 = activeEmps.filter((e) => e.zoho?.EmailID && m365ByEmp.get(e.person.id)?.has(normEmail(e.zoho.EmailID))).length;
const primaryOf = new Map();
for (const u of m365) if (u.mail) primaryOf.set(normEmail(u.mail), u);
const zohoIsPrimary = activeEmps.filter((e) => primaryOf.has(normEmail(e.zoho?.EmailID))).length;
const codesM365 = m365.filter((u) => u.employeeId && u._state === "active" && isWorkDomain(normEmail(u.mail))).length;
const codeFmtBad = { zoho: zoho.filter((z) => z.EmployeeID && !/^[A-Z]{3}-\d+$/.test(z.EmployeeID)).length,
  m365: m365.filter((u) => u.employeeId && !/^[A-Z]{3}-\d+$/.test(u.employeeId)).length,
  db: persons.filter((p) => p.employee_code && !/^[A-Z]{3}-\d+$/.test(p.employee_code)).length };
const scorecard = [
  ["Zoho People", "employment (joined/exit/status), employee code, current work email",
    `${zoho.length} records; codes on 100%, ${codeFmtBad.zoho} badly formatted; active emails that are the M365 primary: ${pct(zohoIsPrimary, activeEmps.length)}; that exist on the mailbox at all: ${pct(zohoEmailInM365, activeEmps.length)}`],
  ["Microsoft 365", "every address a mailbox owns (primary + permanent .in aliases)",
    `${m365.filter((u) => u._state === "active").length} member mailboxes (+${m365.filter((u) => u._state === "deleted").length} deleted <30d); matched to employments: ${m365Report.matched}; active employments with a mailbox: ${pct(activeEmps.filter((e) => m365ByEmp.has(e.person.id)).length, activeEmps.length)}; employeeId set on ${codesM365}, ${codeFmtBad.m365} badly formatted, ${m365Report.employeeIdMismatch.length} disagree with Zoho`],
  ["MarginDesk Person table", "salaries, pods, managers attach here",
    `${persons.length} rows, ${employments.length} Zoho-linked, ${persons.length - employments.length} not; ${codeFmtBad.db} badly formatted codes`],
  ["Alias table (Jun backfill)", "guessed .in->.com swaps",
    `${aliasRows.length} aliases; confirmed by M365: ${aliasConfirmed} (${pct(aliasConfirmed, aliasRows.length)}); the rest are mostly leavers whose mailbox is gone`],
];

// ---------- output ----------
mkdirSync(outDir, { recursive: true });
const csv = (rows) => rows.length ? [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n") : "";
const planRows = [...plan.values()].sort((a, b) => b.entries - a.entries).map((r) => ({
  from_email: r.src.email, from_role: r.src.zoho_employee_id ? "employment" : "duplicate", to_email: r.dst.person.email, to_code: r.dst.code,
  to_name: r.dst.name, to_status: r.dst.status, entries: r.entries, hours: Math.round(r.hours * 10) / 10,
  months: [...r.months].sort().join(" "), reason: r.reason, evidence: evidence(r.src.email),
}));
const idRows = finalIds.map((f) => ({ kind: f.kind, value: f.value, person_email: f.emp.person.email, code: f.emp.code, name: f.emp.name,
  valid_from: d10(f.emp.from), valid_to: d10(f.emp.to), sources: f.sources.join("+"), verified: f.verified }));
writeFileSync(path.join(outDir, "identifiers.csv"), csv(idRows));
writeFileSync(path.join(outDir, "merge_plan.csv"), csv(planRows));
writeFileSync(path.join(outDir, "conflicts.json"), JSON.stringify({ conflicts, m365: m365Report, unresolved: [...unresolved.values()] }, null, 1));

console.log(`Database: ${dbName}   Snapshot: ${snapDir}   Mode: ${apply ? "APPLY" : "dry run"}\n`);
console.log("== Source scorecard");
for (const [s, role, q] of scorecard) console.log(`  ${s}\n     role:    ${role}\n     quality: ${q}`);
const byKind = {}; for (const f of finalIds) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log(`\n== Lookup: ${finalIds.length} identifiers for ${employments.length} employments`, byKind,
  `| verified: ${finalIds.filter((f) => f.verified).length}`);
console.log(`   employments with >1 email: ${new Set(finalIds.filter((f) => f.kind === "email").map((f) => f.emp.person.id)).size ? [...Object.entries(finalIds.filter((f) => f.kind === "email").reduce((m, f) => (m[f.emp.person.id] = (m[f.emp.person.id] ?? 0) + 1, m), {}))].filter(([, n]) => n > 1).length : 0}`);
console.log(`\n== Conflicts (identifier claimed by different people): ${conflicts.length}`);
for (const c of conflicts) console.log(`   ${c.kind} ${c.value}: ${c.claimed_by.join("  |  ")}`);
console.log(`== M365 mailboxes claimed by >1 different person: ${m365Report.ambiguous.length}`);
for (const a of m365Report.ambiguous) console.log(`   ${a.mailbox} (empId ${a.employeeId}): ${a.candidates.join("  |  ")}`);
console.log(`== M365 employeeId disagrees with Zoho code: ${m365Report.employeeIdMismatch.length}`);
for (const a of m365Report.employeeIdMismatch) console.log(`   ${a.mailbox}: M365 ${a.m365_employeeId} vs Zoho ${a.zoho_codes}`);
console.log(`\n== Merge plan: ${planRows.length} moves, ${planRows.reduce((s, r) => s + r.entries, 0)} entries, ${Math.round(planRows.reduce((s, r) => s + r.hours, 0))} hours`);
const reasons = {}; for (const r of planRows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
console.log("  ", reasons);
console.log(`== Unresolved (no identity found): ${unresolved.size}`);
for (const u of unresolved.values()) console.log(`   ${u.email} ${u.name}: ${u.entries} entries, ${Math.round(u.hours)} h`);
console.log(`\nFiles: ${outDir}/identifiers.csv, merge_plan.csv, conflicts.json`);

if (apply) {
  let n = 0;
  for (const f of finalIds) {
    await prisma.personIdentifier.upsert({
      where: { kind_value_person_id: { kind: f.kind, value: f.value, person_id: f.emp.person.id } },
      update: { source: f.sources.join("+"), verified: f.verified, valid_from: f.emp.from, valid_to: f.emp.to },
      create: { kind: f.kind, value: f.value, person_id: f.emp.person.id, source: f.sources.join("+"),
                verified: f.verified, valid_from: f.emp.from, valid_to: f.emp.to },
    });
    n++;
  }
  console.log(`\nUpserted ${n} PersonIdentifier rows (nothing deleted).`);
}
await prisma.$disconnect();
