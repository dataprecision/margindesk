import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRole } from "@/lib/auth/protect-route";
import { detectCycle } from "@/lib/pod-owner-tree";


/**
 * GET /api/pod-owners/[id]
 */
export const GET = withAdminRole(async (req: NextRequest, { params }: { user: any; params: any }) => {
  try {
    const { id } = await params;

    const owner = await prisma.podOwner.findUnique({
      where: { id },
      include: {
        person: { select: { id: true, name: true, employee_code: true } },
        parent: { include: { person: { select: { id: true, name: true } } } },
        children: { include: { person: { select: { id: true, name: true } } } },
        pods: { select: { id: true, name: true, status: true } },
      },
    });

    if (!owner) {
      return NextResponse.json({ error: "Pod owner not found" }, { status: 404 });
    }

    return NextResponse.json(owner);
  } catch (error) {
    console.error("Error fetching pod owner:", error);
    return NextResponse.json({ error: "Failed to fetch pod owner" }, { status: 500 });
  }
});

/**
 * PATCH /api/pod-owners/[id]
 */
export const PATCH = withAdminRole(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.podOwner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Pod owner not found" }, { status: 404 });
    }

    // Cycle detection if changing parent
    if (body.parent_id !== undefined && body.parent_id !== existing.parent_id) {
      const allOwners = await prisma.podOwner.findMany({
        select: { id: true, person_id: true, parent_id: true, end_date: true },
      });
      if (detectCycle(id, body.parent_id, allOwners)) {
        return NextResponse.json(
          { error: "Cannot set parent: would create a circular reference" },
          { status: 400 }
        );
      }
    }

    // Validate person if changing
    if (body.person_id && body.person_id !== existing.person_id) {
      const person = await prisma.person.findUnique({ where: { id: body.person_id } });
      if (!person) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
    }

    const data: any = { updated_at: new Date() };
    if (body.name !== undefined) data.name = body.name;
    if (body.person_id !== undefined) data.person_id = body.person_id;
    if (body.parent_id !== undefined) data.parent_id = body.parent_id;
    if (body.start_date !== undefined) data.start_date = new Date(body.start_date + "T00:00:00.000Z");
    if (body.end_date !== undefined) data.end_date = body.end_date ? new Date(body.end_date + "T00:00:00.000Z") : null;

    const updated = await prisma.podOwner.update({
      where: { id },
      data,
      include: {
        person: { select: { id: true, name: true, employee_code: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodOwner",
        entity_id: id,
        action: "update",
        before_json: existing,
        after_json: updated,
      },
    });

    return NextResponse.json({ success: true, owner: updated });
  } catch (error) {
    console.error("Error updating pod owner:", error);
    return NextResponse.json(
      { error: "Failed to update pod owner", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/pod-owners/[id]
 * Only if no children and no assigned pods.
 */
export const DELETE = withAdminRole(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;

    const owner = await prisma.podOwner.findUnique({
      where: { id },
      include: {
        children: { select: { id: true } },
        pods: { select: { id: true } },
      },
    });

    if (!owner) {
      return NextResponse.json({ error: "Pod owner not found" }, { status: 404 });
    }

    if (owner.children.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete: this owner has child nodes. Reassign or delete them first." },
        { status: 400 }
      );
    }

    if (owner.pods.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete: this owner has pods assigned. Reassign them first." },
        { status: 400 }
      );
    }

    await prisma.podOwner.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodOwner",
        entity_id: id,
        action: "delete",
        before_json: owner,
        after_json: null,
      },
    });

    return NextResponse.json({ success: true, message: "Pod owner deleted" });
  } catch (error) {
    console.error("Error deleting pod owner:", error);
    return NextResponse.json(
      { error: "Failed to delete pod owner", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
});
