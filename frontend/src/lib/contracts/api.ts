import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export const CONTRACT_API_ROLES: UserRole[] = ["owner", "finance", "legal"];

/** "" / undefined -> null, otherwise a Date; throws on an unparseable value. */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d;
}

/** A single clean figure ("1,65,000", "2500.50") -> number, anything else -> null. */
export function parseAmount(text: unknown): number | null {
  const s = String(text ?? "").trim();
  if (!/^[\d,]+(\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

export async function audit(user: { id: string }, entity: string, entityId: string, action: string, before: unknown, after: unknown) {
  await prisma.auditLog.create({
    data: {
      actor_id: user.id,
      entity,
      entity_id: entityId,
      action,
      before_json: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
      after_json: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
    },
  });
}
