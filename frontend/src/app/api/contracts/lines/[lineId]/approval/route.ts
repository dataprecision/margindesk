import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";
import { runApproval } from "@/lib/contracts/approval-actions";

/** POST { action: "submit" | "approve" | "send_back" | "withdraw", note? } — maker-checker approval of a line. */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { lineId } = await params;
    const body = await (req as NextRequest).json();
    const r = await runApproval("line", lineId, body.action, typeof body.note === "string" ? body.note.trim() || null : null, user as any);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ record: r.record });
  } catch (error: any) {
    console.error("Error on line approval:", error);
    return NextResponse.json({ error: error?.message || "Approval failed" }, { status: 400 });
  }
});
