import { NextRequest, NextResponse } from "next/server";
import { editResets } from "@/lib/contracts/approval";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseAmount, parseDate } from "@/lib/contracts/api";

/**
 * POST /api/contracts/[id]/lines
 * Add a billing line to a contract.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    if (!body.service?.trim() || !body.billing_type?.trim() || !String(body.amount_text ?? "").trim()) {
      return NextResponse.json({ error: "Service, billing type and amount are required" }, { status: 400 });
    }
    const contract = await prisma.contract.findUnique({ where: { id }, select: { id: true, _count: { select: { lines: true } } } });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const line = await prisma.contractLine.create({
      data: {
        contract_id: id,
        service: body.service.trim(),
        billing_type: body.billing_type,
        amount_text: String(body.amount_text).trim(),
        amount: parseAmount(body.amount_text),
        unit: body.unit || null,
        currency: body.currency || "INR",
        start_date: parseDate(body.start_date),
        end_date: parseDate(body.end_date),
        read_from: body.read_from || "Contract",
        source_document: body.source_document || null,
        quote: body.quote || null,
        ...(user.role === "legal" ? {} : {
          shape: body.shape || null,
          params: typeof body.params === "object" && body.params ? body.params : {},
          period: body.period || null,
          input_needed: body.input_needed || null,
          advance_or_arrears: body.advance_or_arrears || null,
          fx_rate: body.fx_rate === "" || body.fx_rate == null ? null : Number(body.fx_rate),
        }),
        approval_note: body.approval_note || null,
        last_edited_by: editResets(user).last_edited_by, last_edited_at: new Date(),
        project_id: body.project_id || null,
        sort_order: contract._count.lines,
      },
    });
    await prisma.contract.update({ where: { id }, data: { commercial_checked_by: null, commercial_checked_at: null } });
    await prisma.contract.updateMany({ where: { id, approval_status: { in: ["approved", "submitted"] } }, data: editResets(user) });
    await audit(user, "ContractLine", line.id, "create", undefined, line);
    return NextResponse.json({ line }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating contract line:", error);
    return NextResponse.json({ error: error?.message || "Failed to create line" }, { status: 400 });
  }
});
