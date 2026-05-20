import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRole, withAuth } from "@/lib/auth/protect-route";
import { buildTree, getDescendantOwnerIds } from "@/lib/pod-owner-tree";


/**
 * GET /api/pod-owners
 * List pod owners. Query params: active_only (default true), format (flat/tree)
 * PM role: scoped to owner nodes they're attached to and all descendants.
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active_only") !== "false";
    const format = searchParams.get("format") || "flat";

    const where: any = activeOnly ? { end_date: null } : {};

    // PM scoping: limit to their own subtree
    if (user.role !== "owner" && user.role !== "finance") {
      const person = await prisma.person.findUnique({
        where: { email: user.email },
        select: { id: true },
      });

      if (!person) {
        return NextResponse.json({ owners: [] });
      }

      const allOwners = await prisma.podOwner.findMany({
        select: { id: true, person_id: true, parent_id: true, end_date: true },
      });

      const myOwnerNodes = allOwners.filter(
        (o) => o.person_id === person.id && (!activeOnly || o.end_date === null)
      );

      if (myOwnerNodes.length === 0) {
        return NextResponse.json({ owners: [] });
      }

      const rootIds = myOwnerNodes.map((o) => o.id);
      const allowedIds = getDescendantOwnerIds(rootIds, allOwners, activeOnly);
      where.id = { in: allowedIds };
    }

    const owners = await prisma.podOwner.findMany({
      where,
      include: {
        person: { select: { id: true, name: true, employee_code: true } },
        pods: { select: { id: true, name: true, status: true } },
      },
      orderBy: { name: "asc" },
    });

    if (format === "tree") {
      return NextResponse.json({ owners: buildTree(owners) });
    }

    return NextResponse.json({ owners });
  } catch (error) {
    console.error("Error fetching pod owners:", error);
    return NextResponse.json(
      { error: "Failed to fetch pod owners" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pod-owners
 * Create a new pod owner node. Admin only.
 */
export const POST = withAdminRole(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const body = await req.json();
    const { person_id, parent_id, name, start_date } = body;

    if (!person_id || !name || !start_date) {
      return NextResponse.json(
        { error: "person_id, name, and start_date are required" },
        { status: 400 }
      );
    }

    // Validate person exists
    const person = await prisma.person.findUnique({ where: { id: person_id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Validate parent exists if provided
    if (parent_id) {
      const parent = await prisma.podOwner.findUnique({ where: { id: parent_id } });
      if (!parent) {
        return NextResponse.json({ error: "Parent owner not found" }, { status: 404 });
      }
    }

    const owner = await prisma.podOwner.create({
      data: {
        person_id,
        parent_id: parent_id || null,
        name,
        start_date: new Date(start_date + "T00:00:00.000Z"),
        end_date: body.end_date ? new Date(body.end_date + "T00:00:00.000Z") : null,
      },
      include: {
        person: { select: { id: true, name: true, employee_code: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodOwner",
        entity_id: owner.id,
        action: "create",
        before_json: null,
        after_json: owner,
      },
    });

    return NextResponse.json({ success: true, owner }, { status: 201 });
  } catch (error) {
    console.error("Error creating pod owner:", error);
    return NextResponse.json(
      { error: "Failed to create pod owner", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
});
