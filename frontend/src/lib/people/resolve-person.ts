import type { Prisma, PrismaClient, PersonIdentifierKind } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

// Company mail moved from @dwao.in to @dwao.com. The same human can appear
// under either domain (and sometimes a different local part) depending on
// the source, so exact-email lookups create duplicate Person rows. The
// PersonIdentifier table (built from Microsoft 365 + Zoho snapshots by
// scripts/identity/build-person-identifiers.mjs) is the authoritative map.
const DOMAIN_TWINS: Record<string, string> = {
  "dwao.in": "dwao.com",
  "dwao.com": "dwao.in",
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "DEL - 532" / "del-532 " -> "DEL-532" */
export function normalizeEmployeeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "");
}

/** Same local part on the other company domain, or null for external emails. */
export function domainTwin(email: string): string | null {
  const [local, domain] = normalizeEmail(email).split("@");
  const twin = domain ? DOMAIN_TWINS[domain] : undefined;
  return local && twin ? `${local}@${twin}` : null;
}

/**
 * Look up the identifier map. When several employments share the identifier
 * (a rehire reusing their mailbox), pick the one whose validity covers
 * `onDate`, else the latest that started before it.
 */
async function resolveIdentifier(
  db: Db,
  kind: PersonIdentifierKind,
  value: string,
  onDate?: Date
): Promise<string | null> {
  const rows = await db.personIdentifier.findMany({
    where: { kind, value },
    select: { person_id: true, valid_from: true, valid_to: true },
    orderBy: { valid_from: "desc" },
  });
  if (rows.length <= 1 || !onDate) return rows[0]?.person_id ?? null;

  const t = onDate.getTime();
  const covering = rows.find(
    (r) => (!r.valid_from || r.valid_from.getTime() <= t) && (!r.valid_to || r.valid_to.getTime() >= t)
  );
  if (covering) return covering.person_id;
  const started = rows.find((r) => !r.valid_from || r.valid_from.getTime() <= t);
  return (started ?? rows[0]).person_id;
}

/**
 * Resolve an email to a Person id, tolerating the .in/.com migration.
 * Order: identifier map → exact Person.email → PersonEmailAlias → the same
 * on the twin domain. `onDate` picks the right employment for rehires.
 * Returns null when nobody matches (caller decides whether to create).
 */
export async function resolvePersonIdByEmail(
  email: string,
  db: Db = defaultPrisma,
  onDate?: Date
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const twin = domainTwin(normalized);

  const mapped = await resolveIdentifier(db, "email", normalized, onDate);
  if (mapped) return mapped;

  for (const candidate of twin ? [normalized, twin] : [normalized]) {
    const person = await db.person.findFirst({
      where: { email: { equals: candidate, mode: "insensitive" } },
      select: { id: true },
    });
    if (person) return person.id;

    const alias = await db.personEmailAlias.findFirst({
      where: { email: { equals: candidate, mode: "insensitive" } },
      select: { person_id: true },
    });
    if (alias) return alias.person_id;

    if (candidate === twin) {
      const twinMapped = await resolveIdentifier(db, "email", twin, onDate);
      if (twinMapped) return twinMapped;
    }
  }

  return null;
}

/** Resolve an employee code (any spacing/case) to a Person id. */
export async function resolvePersonIdByEmployeeCode(
  code: string,
  db: Db = defaultPrisma,
  onDate?: Date
): Promise<string | null> {
  const normalized = normalizeEmployeeCode(code);
  if (!normalized) return null;
  const mapped = await resolveIdentifier(db, "employee_code", normalized, onDate);
  if (mapped) return mapped;
  const person = await db.person.findFirst({
    where: { employee_code: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  return person?.id ?? null;
}

/**
 * Best-effort resolution from whatever a source row carries. Stable ids win
 * over emails: Zoho id → employee code → email.
 */
export async function resolvePerson(
  ids: { zohoId?: string | null; employeeCode?: string | null; email?: string | null; onDate?: Date },
  db: Db = defaultPrisma
): Promise<string | null> {
  if (ids.zohoId) {
    const byZoho =
      (await resolveIdentifier(db, "zoho_id", ids.zohoId, ids.onDate)) ??
      (await db.person.findUnique({ where: { zoho_employee_id: ids.zohoId }, select: { id: true } }))?.id;
    if (byZoho) return byZoho;
  }
  if (ids.employeeCode) {
    const byCode = await resolvePersonIdByEmployeeCode(ids.employeeCode, db, ids.onDate);
    if (byCode) return byCode;
  }
  if (ids.email) return resolvePersonIdByEmail(ids.email, db, ids.onDate);
  return null;
}
