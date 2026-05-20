import { prisma } from "@/lib/prisma";
import { getDescendantOwnerIds } from "@/lib/pod-owner-tree";


/**
 * Get pod IDs that a PM user can access.
 * Returns pods where the user (matched by email) is the leader,
 * or where their direct reports are leaders,
 * or where the user is an active PodOwner (walks the owner hierarchy).
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
  const leaderPods = await prisma.financialPod.findMany({
    where: {
      leader_id: { in: leaderIds },
    },
    select: { id: true },
  });

  // Find pods via PodOwner hierarchy
  const allOwners = await prisma.podOwner.findMany({
    select: { id: true, person_id: true, parent_id: true, end_date: true },
  });

  // Find active owner nodes for this person
  const myOwnerNodes = allOwners.filter(
    (o) => o.person_id === person.id && o.end_date === null
  );

  let ownerPodIds: string[] = [];
  if (myOwnerNodes.length > 0) {
    const rootIds = myOwnerNodes.map((o) => o.id);
    const allDescendantIds = getDescendantOwnerIds(rootIds, allOwners, true);

    const ownerPods = await prisma.financialPod.findMany({
      where: { owner_id: { in: allDescendantIds } },
      select: { id: true },
    });
    ownerPodIds = ownerPods.map((p) => p.id);
  }

  // Merge and deduplicate
  const allPodIds = new Set([
    ...leaderPods.map((p) => p.id),
    ...ownerPodIds,
  ]);

  return Array.from(allPodIds);
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
