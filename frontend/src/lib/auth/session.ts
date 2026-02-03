import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import { UserRole } from "@prisma/client";

/**
 * Get the current session on the server side
 * Use this in API routes and Server Components
 */
export async function getCurrentSession() {
  return await getServerSession(authOptions);
}

/**
 * Get the current user or throw an error if not authenticated
 */
export async function getCurrentUser() {
  const session = await getCurrentSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session.user;
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * Check if user is owner or finance (admin roles)
 */
export function isAdmin(userRole: UserRole): boolean {
  return hasRole(userRole, ["owner", "finance"]);
}

/**
 * Check if user can edit allocations
 */
export function canEditAllocations(userRole: UserRole): boolean {
  return hasRole(userRole, ["owner", "finance", "pm"]);
}

/**
 * Check if user can manage overhead policies
 */
export function canManageOverheads(userRole: UserRole): boolean {
  return hasRole(userRole, ["owner", "finance"]);
}

/**
 * Check if user can freeze/unfreeze accruals
 */
export function canManageAccruals(userRole: UserRole): boolean {
  return hasRole(userRole, ["owner", "finance"]);
}
