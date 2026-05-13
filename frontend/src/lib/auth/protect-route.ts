import { NextResponse } from "next/server";
import { getCurrentUser, hasRole } from "./session";
import { UserRole } from "@prisma/client";

/**
 * If the request carries a valid `Authorization: Bearer <CRON_SECRET>`, return a
 * synthetic owner-role user so scheduled jobs can call admin endpoints without a
 * session. CRON_SECRET must be set in env; an unset or empty secret disables the
 * bypass entirely.
 */
function getCronUser(req: Request): { id: string; email: string; name: string; role: UserRole } | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  if (auth.slice(7) !== secret) return null;
  return {
    id: "system-cron",
    email: "cron@margindesk.local",
    name: "Nightly Cron",
    role: "owner" as UserRole,
  };
}

/**
 * Middleware to protect API routes
 * Use this to wrap your API route handlers
 */
export function withAuth(
  handler: (req: Request, context: { user: any; params?: any }) => Promise<Response>
) {
  return async (req: Request, routeContext?: any) => {
    try {
      const user = getCronUser(req) ?? (await getCurrentUser());

      // Pass user to handler
      return await handler(req, { user, ...routeContext });
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }
  };
}

/**
 * Middleware to protect API routes with role check
 * Only allows users with specified roles
 */
export function withRole(
  allowedRoles: UserRole[],
  handler: (req: Request, context: { user: any; params?: any }) => Promise<Response>
) {
  return async (req: Request, routeContext?: any) => {
    try {
      const user = getCronUser(req) ?? (await getCurrentUser());

      if (!hasRole(user.role, allowedRoles)) {
        return NextResponse.json(
          {
            error: "Forbidden - Insufficient permissions",
            required: allowedRoles,
            current: user.role,
          },
          { status: 403 }
        );
      }

      return await handler(req, { user, ...routeContext });
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }
  };
}

/**
 * Shorthand for owner/finance only routes
 */
export function withAdminRole(
  handler: (req: Request, context: { user: any; params?: any }) => Promise<Response>
) {
  return withRole(["owner", "finance"], handler);
}

/**
 * Shorthand for routes that PMs can access
 */
export function withPMRole(
  handler: (req: Request, context: { user: any; params?: any }) => Promise<Response>
) {
  return withRole(["owner", "finance", "pm"], handler);
}
