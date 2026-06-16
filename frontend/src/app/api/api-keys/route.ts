import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRole } from "@/lib/auth/protect-route";
import { generateApiKey } from "@/lib/auth/api-key";

const VALID_SCOPES = ["pods:read"];

/**
 * GET /api/api-keys
 * List API keys (owner/finance only). Never returns secrets — only metadata.
 */
export const GET = withAdminRole(async () => {
  try {
    const keys = await prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        active: true,
        last_used_at: true,
        expires_at: true,
        created_by: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
  }
});

/**
 * POST /api/api-keys
 * Mint a new API key (owner/finance only). The plaintext key is returned exactly
 * once in this response and is never retrievable again.
 */
export const POST = withAdminRole(async (req: Request, { user }: { user: any }) => {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const scopes: string[] =
      Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ["pods:read"];
    const invalid = scopes.filter((s) => !VALID_SCOPES.includes(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid scope(s): ${invalid.join(", ")}`, valid: VALID_SCOPES },
        { status: 400 }
      );
    }

    let expires_at: Date | null = null;
    if (body.expires_at) {
      const d = new Date(body.expires_at);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "expires_at is not a valid date" }, { status: 400 });
      }
      expires_at = d;
    }

    const { plaintext, prefix, hash } = generateApiKey();

    const key = await prisma.apiKey.create({
      data: {
        name,
        prefix,
        key_hash: hash,
        scopes,
        expires_at,
        created_by: user.email ?? null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        active: true,
        expires_at: true,
        created_by: true,
        created_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ApiKey",
        entity_id: key.id,
        action: "create",
        after_json: key,
      },
    });

    // `key` (the plaintext) is returned only here, never persisted or returned again.
    return NextResponse.json({
      success: true,
      apiKey: key,
      key: plaintext,
      message: "Copy this key now — it will not be shown again.",
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
});
