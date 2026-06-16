import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/auth/api-key";

/**
 * GET /api/external/pods-by-email
 *
 * External, API-key-protected endpoint. Returns the current pod structure keyed
 * by person email address, so other applications can resolve "which pod(s) is
 * this email in?".
 *
 * Auth: `Authorization: Bearer <api key>` with the `pods:read` scope.
 *
 * Response shape:
 * {
 *   "generated_at": "<ISO timestamp>",
 *   "pods_by_email": {
 *     "alice@dwao.com": [
 *       { "podId": "...", "pod": "Growth", "role": "leader" | "member", "allocation": 100 }
 *     ]
 *   }
 * }
 *
 * Only active pods and active memberships (no end_date, or end_date in the
 * future) are included. Each person's alias emails (the .in <-> .com migration)
 * are emitted as additional keys pointing to the same pod list.
 */

interface PodEntry {
  podId: string;
  pod: string;
  role: "leader" | "member";
  allocation: number;
}

export const GET = withApiKey("pods:read", async () => {
  try {
    const now = new Date();
    const activeMembershipWindow = {
      OR: [{ end_date: null }, { end_date: { gte: now } }],
    };

    const pods = await prisma.financialPod.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        leader: {
          select: { email: true, email_aliases: { select: { email: true } } },
        },
        members: {
          where: activeMembershipWindow,
          select: {
            allocation_pct: true,
            person: {
              select: { email: true, email_aliases: { select: { email: true } } },
            },
          },
        },
      },
    });

    // email -> list of pod entries
    const map: Record<string, PodEntry[]> = {};

    const addEntry = (emails: string[], entry: PodEntry) => {
      for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        if (!email) continue;
        if (!map[email]) map[email] = [];
        // Avoid duplicate pod entries for the same email (e.g. leader who is
        // also listed as a member).
        if (map[email].some((e) => e.podId === entry.podId)) continue;
        map[email].push(entry);
      }
    };

    for (const pod of pods) {
      // Leader first, so the "leader" role wins if they are also a member.
      if (pod.leader) {
        const emails = [pod.leader.email, ...pod.leader.email_aliases.map((a) => a.email)];
        addEntry(emails, {
          podId: pod.id,
          pod: pod.name,
          role: "leader",
          allocation: 100,
        });
      }

      // Members
      for (const m of pod.members) {
        if (!m.person) continue;
        const emails = [m.person.email, ...m.person.email_aliases.map((a) => a.email)];
        addEntry(emails, {
          podId: pod.id,
          pod: pod.name,
          role: "member",
          allocation: m.allocation_pct,
        });
      }
    }

    return NextResponse.json({
      generated_at: now.toISOString(),
      pods_by_email: map,
    });
  } catch (error) {
    console.error("Error building pods-by-email:", error);
    return NextResponse.json(
      { error: "Failed to build pod structure" },
      { status: 500 }
    );
  }
});
