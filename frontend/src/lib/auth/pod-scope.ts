import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Get pod IDs that a PM user can access.
 * Returns pods where the user (matched by email) is the leader,
 * or where their direct reports are leaders.
 * Returns null for owner/finance (meaning "all pods").
 */
export async function getPodIdsForUser(
  userEmail: string,
  userRole: string
): Promise<string[] | null> {
  // owner/finance see everything
  if (userRole === "owner" || userRole === "finance") {
    return null;
  }

  // Find the Person record for this user
  const person = await prisma.person.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      direct_reports: {
        select: { id: true },
        where: { end_date: null },
      },
    },
  });

  if (!person) {
    return [];
  }

  // Collect person IDs: self + direct reports
  const leaderIds = [person.id, ...person.direct_reports.map((r) => r.id)];

  // Find pods led by any of these people
  const pods = await prisma.financialPod.findMany({
    where: {
      leader_id: { in: leaderIds },
    },
    select: { id: true },
  });

  return pods.map((p) => p.id);
}

/**
 * Get project IDs that belong to a PM user's pods.
 * Returns null for owner/finance (meaning "all projects").
 */
export async function getProjectIdsForUser(
  userEmail: string,
  userRole: string
): Promise<string[] | null> {
  const podIds = await getPodIdsForUser(userEmail, userRole);
  if (podIds === null) return null;
  if (podIds.length === 0) return [];

  const mappings = await prisma.podProjectMapping.findMany({
    where: {
      pod_id: { in: podIds },
    },
    select: { project_id: true },
    distinct: ["project_id"],
  });

  return mappings.map((m) => m.project_id);
}

/**
 * Get person IDs (members) in a PM user's pods.
 * Returns null for owner/finance (meaning "all people").
 */
export async function getPersonIdsForUser(
  userEmail: string,
  userRole: string
): Promise<string[] | null> {
  const podIds = await getPodIdsForUser(userEmail, userRole);
  if (podIds === null) return null;
  if (podIds.length === 0) return [];

  const memberships = await prisma.podMembership.findMany({
    where: {
      pod_id: { in: podIds },
    },
    select: { person_id: true },
    distinct: ["person_id"],
  });

  return memberships.map((m) => m.person_id);
}
