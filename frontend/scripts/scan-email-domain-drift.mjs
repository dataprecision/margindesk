#!/usr/bin/env node
// Reports email-domain drift between User/Person tables, surfaces orphaned
// timesheet auto-creates, and validates User ↔ Person consistency by both
// email and microsoft_user_id. Read-only.
//
// Run from frontend/:  node scripts/scan-email-domain-drift.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const inUser = await prisma.user.count({ where: { email: { endsWith: "@dwao.in" } } });
  const comUser = await prisma.user.count({ where: { email: { endsWith: "@dwao.com" } } });
  const inPerson = await prisma.person.count({ where: { email: { endsWith: "@dwao.in" } } });
  const comPerson = await prisma.person.count({ where: { email: { endsWith: "@dwao.com" } } });
  const aliasTotal = await prisma.personEmailAlias.count();

  console.log("=== Domain counts ===");
  console.log({ inUser, comUser, inPerson, comPerson, aliasTotal });

  // Person rows missing both stable IDs — likely auto-created by ingest paths
  const orphans = await prisma.person.findMany({
    where: { zoho_employee_id: null, microsoft_user_id: null, end_date: null },
    select: {
      id: true, email: true, name: true, employee_code: true, created_at: true,
      _count: { select: { timesheet_entries: true, salary_records: true, leaves: true, allocations: true } },
    },
    orderBy: { created_at: "desc" },
  });
  console.log("\n=== Persons with no zoho_employee_id AND no microsoft_user_id (active) ===");
  console.log("Count:", orphans.length);
  for (const o of orphans) {
    const c = o._count;
    console.log(`  ${o.email.padEnd(40)}  ${o.name.padEnd(30)}  ts=${c.timesheet_entries} sal=${c.salary_records} lv=${c.leaves} alloc=${c.allocations}`);
  }

  // .in ↔ .com twins where both rows exist as primary
  const inPersons = await prisma.person.findMany({
    where: { email: { endsWith: "@dwao.in" } },
    select: { id: true, email: true, name: true, end_date: true, zoho_employee_id: true, _count: { select: { timesheet_entries: true } } },
  });
  const comByEmail = new Map(
    (await prisma.person.findMany({
      where: { email: { endsWith: "@dwao.com" } },
      select: { id: true, email: true, name: true, end_date: true, zoho_employee_id: true, _count: { select: { timesheet_entries: true } } },
    })).map((p) => [p.email.toLowerCase(), p])
  );
  const twinPairs = [];
  for (const p of inPersons) {
    const predicted = p.email.toLowerCase().replace(/@dwao\.in$/, "@dwao.com");
    const com = comByEmail.get(predicted);
    if (com) twinPairs.push({ name: p.name, in: p, com });
  }
  console.log("\n=== .in/.com twin pairs (both rows present as primary) ===");
  console.log("Count:", twinPairs.length);
  for (const pair of twinPairs) {
    console.log(`  ${pair.name}`);
    console.log(`    .in : ${pair.in.email}  ts=${pair.in._count.timesheet_entries}  zoho=${pair.in.zoho_employee_id ?? "—"}  end=${pair.in.end_date ?? "—"}`);
    console.log(`    .com: ${pair.com.email}  ts=${pair.com._count.timesheet_entries}  zoho=${pair.com.zoho_employee_id ?? "—"}  end=${pair.com.end_date ?? "—"}`);
  }

  // User ↔ Person consistency check
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, microsoft_user_id: true } });
  console.log("\n=== User ↔ Person consistency ===");
  for (const u of users) {
    const byEmail = await prisma.person.findUnique({ where: { email: u.email }, select: { id: true } });
    const byMsid = u.microsoft_user_id
      ? await prisma.person.findUnique({ where: { microsoft_user_id: u.microsoft_user_id }, select: { id: true, email: true } })
      : null;
    const ok = byEmail && byMsid ? byEmail.id === byMsid.id : true;
    console.log(`  ${ok ? "OK" : "MISMATCH"}  ${u.email.padEnd(35)}  byEmail=${byEmail?.id ?? "—"}  byMsid=${byMsid?.id ?? "—"}${byMsid?.email && byMsid.email !== u.email ? ` (Person email=${byMsid.email})` : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
