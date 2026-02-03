import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * POST /api/sync/microsoft-users
 * On-demand sync of licensed users from Microsoft 365 Graph API
 * Only owner/finance can trigger this sync
 */
export const POST = withAdminRole(async (req, { user }) => {
  try {
    const syncLogStart = new Date();
    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Get Microsoft Graph access token
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.AZURE_AD_CLIENT_ID!,
          client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const { access_token } = await tokenResponse.json();

    // Fetch licensed users from Microsoft Graph
    // Filter for users with assigned licenses (licensed users only)
    const usersResponse = await fetch(
      "https://graph.microsoft.com/v1.0/users?$filter=assignedLicenses/$count ne 0&$select=id,displayName,mail,department,jobTitle,accountEnabled&$count=true",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          ConsistencyLevel: "eventual",
        },
      }
    );

    if (!usersResponse.ok) {
      const error = await usersResponse.text();
      throw new Error(`Failed to fetch users from Microsoft Graph: ${error}`);
    }

    const { value: m365Users } = await usersResponse.json();

    // Process each user
    for (const m365User of m365Users) {
      try {
        if (!m365User.mail) {
          skippedCount++;
          continue; // Skip users without email
        }

        // Check if person exists
        const existingPerson = await prisma.person.findUnique({
          where: { email: m365User.mail },
        });

        if (existingPerson) {
          // Only update if not manually overridden
          if (!existingPerson.manual_ctc_override) {
            await prisma.person.update({
              where: { email: m365User.mail },
              data: {
                name: m365User.displayName,
                microsoft_user_id: m365User.id,
                department: m365User.department || existingPerson.department,
                role: m365User.jobTitle || existingPerson.role,
              },
            });
            syncedCount++;
          } else {
            skippedCount++; // Skip because of manual override
          }
        } else {
          // Create new person
          await prisma.person.create({
            data: {
              email: m365User.mail,
              name: m365User.displayName,
              microsoft_user_id: m365User.id,
              department: m365User.department,
              role: m365User.jobTitle || "Employee",
              billable: true,
              ctc_monthly: 0,
              utilization_target: 0.80,
              start_date: new Date(),
            },
          });
          syncedCount++;
        }
      } catch (error: any) {
        errorCount++;
        errors.push(`${m365User.mail}: ${error.message}`);
      }
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        entity: "Person",
        source: "Microsoft365",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_processed: m365Users.length,
        records_synced: syncedCount,
        errors: errors.length > 0 ? errors : undefined,
        triggered_by: user.id,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "SyncLog",
        entity_id: syncLog.id,
        action: "create",
        after_json: syncLog,
      },
    });

    return NextResponse.json({
      success: true,
      syncLog: {
        id: syncLog.id,
        status: syncLog.status,
        processed: m365Users.length,
        synced: syncedCount,
        skipped: skippedCount,
        errors: errorCount,
        duration: new Date().getTime() - syncLogStart.getTime(),
      },
      details: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error syncing Microsoft users:", error);

    // Log failed sync
    await prisma.syncLog.create({
      data: {
        entity: "Person",
        source: "Microsoft365",
        status: "failed",
        records_processed: 0,
        records_synced: 0,
        errors: [error.message],
        triggered_by: user.id,
      },
    });

    return NextResponse.json(
      { error: "Failed to sync Microsoft users", details: error.message },
      { status: 500 }
    );
  }
});
