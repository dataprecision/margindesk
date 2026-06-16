import { NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ApiKey } from "@prisma/client";

/**
 * DB-backed API keys for external / server-to-server access.
 *
 * The plaintext key is returned exactly once at creation time and never stored;
 * only the sha256 hash is persisted. Callers authenticate with
 * `Authorization: Bearer <key>`.
 */

const KEY_PREFIX = "md_live_";

/** sha256 hex digest of a string. */
export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Mint a new API key. Returns the plaintext (show once, never persisted), the
 * non-secret `prefix` used to identify it in the UI, and the stored `hash`.
 */
export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  // prefix is non-secret and only used for display/identification
  const prefix = plaintext.slice(0, KEY_PREFIX.length + 6);
  return { plaintext, prefix, hash: hashKey(plaintext) };
}

/** Constant-time comparison of two hex digests of equal length. */
function safeHashEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Validate the bearer token on a request against the ApiKey table.
 * Returns the matching, active, unexpired key carrying `requiredScope`, or null.
 * Updates `last_used_at` on success (fire-and-forget).
 */
export async function validateApiKey(
  req: Request,
  requiredScope: string
): Promise<ApiKey | null> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;

  const presented = auth.slice(7).trim();
  if (!presented) return null;

  const hash = hashKey(presented);
  const key = await prisma.apiKey.findUnique({ where: { key_hash: hash } });
  if (!key) return null;

  // Defense-in-depth: confirm the stored hash matches in constant time even
  // though the lookup was already by hash.
  if (!safeHashEqual(key.key_hash, hash)) return null;
  if (!key.active) return null;
  if (key.expires_at && key.expires_at.getTime() <= Date.now()) return null;
  if (!key.scopes.includes(requiredScope)) return null;

  // Best-effort usage tracking; never block the request on this.
  prisma.apiKey
    .update({ where: { id: key.id }, data: { last_used_at: new Date() } })
    .catch(() => {});

  return key;
}

/**
 * Wrap an external API handler so it requires a valid API key bearing
 * `requiredScope`. The validated key record is passed to the handler.
 */
export function withApiKey(
  requiredScope: string,
  handler: (req: Request, context: { apiKey: ApiKey; params?: any }) => Promise<Response>
) {
  return async (req: Request, routeContext?: any) => {
    try {
      const apiKey = await validateApiKey(req, requiredScope);
      if (!apiKey) {
        return NextResponse.json(
          { error: "Unauthorized - missing or invalid API key" },
          { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
        );
      }
      return await handler(req, { apiKey, ...routeContext });
    } catch (error) {
      console.error("API key auth error:", error);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  };
}
