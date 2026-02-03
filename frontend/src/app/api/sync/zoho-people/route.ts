import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";
import { getZohoPeopleAccessToken } from "@/lib/zoho/token-manager";

const prisma = new PrismaClient();

/**
 * POST /api/sync/zoho-people
 * On-demand sync of employees from Zoho People
 * Only owner/finance can trigger this sync
 */
export const POST = withAdminRole(async (req, { user }) => {
  try {
    const body = await req.json();
    const { syncType = "employees" } = body;

    if (syncType === "employees") {
      return await syncEmployees(user);
    } else if (syncType === "leaves") {
      return await syncLeaves(user);
    } else if (syncType === "holidays") {
      return await syncHolidays(user);
    } else if (syncType === "all") {
      // Sync everything in sequence
      const employeeResult = await syncEmployees(user);
      const leavesResult = await syncLeaves(user);
      const holidaysResult = await syncHolidays(user);

      return NextResponse.json({
        success: true,
        results: {
          employees: await employeeResult.json(),
          leaves: await leavesResult.json(),
          holidays: await holidaysResult.json(),
        },
      });
    }

    return NextResponse.json(
      { error: "Invalid sync type. Use 'employees', 'leaves', 'holidays', or 'all'" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error syncing Zoho People data:", error);
    return NextResponse.json(
      { error: "Failed to sync Zoho People data", details: error.message },
      { status: 500 }
    );
  }
});

// Helper function to parse Zoho People date format: "08-Jul-2022"
function parseZohoDate(dateString: string): Date | null {
  if (!dateString) return null;

  try {
    const parts = dateString.split("-");
    if (parts.length === 3) {
      const months: { [key: string]: number } = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
      };
      const day = parseInt(parts[0]);
      const month = months[parts[1]];
      const year = parseInt(parts[2]);

      if (month !== undefined) {
        return new Date(year, month, day);
      }
    }
  } catch (e) {
    console.warn(`⚠️ Could not parse date: ${dateString}`);
  }
  return null;
}

async function syncEmployees(user: any) {
  const syncLogStart = new Date();
  let syncedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    console.log("🔄 [Zoho People Sync] Starting employee sync...");

    // Get Zoho People access token from database
    const tokens = await getZohoPeopleAccessToken();

    if (!tokens) {
      console.error("❌ [Zoho People Sync] No tokens found");
      throw new Error("Zoho People not connected. Please connect in Settings.");
    }

    console.log("✅ [Zoho People Sync] Got access token");
    console.log("📍 [Zoho People Sync] API Domain:", tokens.api_domain);
    console.log("🔑 [Zoho People Sync] Access Token (first 20 chars):", tokens.access_token.substring(0, 20) + "...");

    // Let's also check the stored config to see organization info
    const settings = await prisma.integrationSettings.findUnique({
      where: { key: "zoho_people" },
    });
    const config = settings?.config as any;
    console.log("📋 [Zoho People Sync] Stored Config:", {
      organization_name: config?.organization_name,
      api_domain: config?.api_domain,
      connected_at: settings?.created_at,
      has_refresh_token: !!config?.refresh_token,
    });

    // Fetch all employees from Zoho People with pagination
    // https://www.zoho.com/people/api/bulk-records.html
    let allEmployees: any[] = [];

    // Zoho People uses a different domain: people.zoho.com (not www.zohoapis.com)
    const region = process.env.ZOHO_REGION || "US";
    const peopleDomain = region === "IN"
      ? "https://people.zoho.in"
      : "https://people.zoho.com";

    console.log("🌍 [Zoho People Sync] Region:", region);
    console.log("🏢 [Zoho People Sync] People Domain:", peopleDomain);

    // Pagination: Fetch all employees in batches of 200
    let sIndex = 1;
    let hasMore = true;
    const limit = 200;

    while (hasMore) {
      const apiUrl = `${peopleDomain}/people/api/forms/employee/getRecords?sIndex=${sIndex}&limit=${limit}`;
      console.log(`🌐 [Zoho People Sync] Fetching batch starting at index ${sIndex}...`);

      const employeesResponse = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      });

      console.log("📡 [Zoho People Sync] API Response Status:", employeesResponse.status);

      if (!employeesResponse.ok) {
        const error = await employeesResponse.text();
        console.error("❌ [Zoho People Sync] API Error Response:", error);
        throw new Error(`Failed to fetch employees from Zoho People: ${error}`);
      }

      const responseData = await employeesResponse.json();

      // Zoho People API response structure check
      if (responseData.status !== undefined && responseData.status !== 0) {
        console.error("❌ [Zoho People Sync] API returned error status:", responseData);
        throw new Error(`Zoho People API error: ${responseData.message || "Unknown error"}`);
      }

      // Extract employee records from response
      const batchEmployees = responseData.response?.result || [];
      console.log(`✅ [Zoho People Sync] Retrieved ${batchEmployees.length} employees in this batch`);

      if (batchEmployees.length === 0) {
        hasMore = false;
      } else {
        allEmployees.push(...batchEmployees);

        // If we got less than the limit, we've reached the end
        if (batchEmployees.length < limit) {
          hasMore = false;
        } else {
          sIndex += limit;
        }
      }
    }

    console.log(`✅ [Zoho People Sync] Total employees retrieved: ${allEmployees.length}`);

    // Process each employee
    console.log(`🔄 [Zoho People Sync] Processing ${allEmployees.length} employees...`);

    for (const employeeRecord of allEmployees) {
      try {
        // Zoho People returns data in a weird nested structure:
        // { "employeeZohoId": [ { actual data } ] }
        // We need to extract the actual employee data from the array
        const employeeZohoId = Object.keys(employeeRecord)[0];
        const employeeDataArray = employeeRecord[employeeZohoId];

        if (!employeeDataArray || !Array.isArray(employeeDataArray) || employeeDataArray.length === 0) {
          console.warn(`⚠️ [Zoho People Sync] Skipping invalid employee record structure`);
          continue;
        }

        const employee = employeeDataArray[0]; // Get the first (and usually only) item
        console.log(`📝 [Zoho People Sync] Processing employee:`, JSON.stringify(employee, null, 2).substring(0, 500) + "...");

        // Extract relevant fields from Zoho People API
        // IMPORTANT: Use the numeric Zoho ID from the record key, not EmployeeID (which is the employee code like "DEL-123")
        const zohoNumericId = employeeZohoId; // This is the numeric Zoho ID (e.g., "662055000000293832")
        const employeeCode = employee.EmployeeID; // This is the employee code (e.g., "DEL-123")
        const emailId = employee.EmailID;
        const firstName = employee.FirstName;
        const lastName = employee.LastName;
        const fullName = `${firstName || ""} ${lastName || ""}`.trim();
        const designation = employee.Designation;
        const department = employee.Department;
        const dateOfJoining = employee.Dateofjoining; // Note: lowercase 'j' in Zoho API
        const dateOfExit = employee.Dateofexit; // Exit/last working date
        const employeeStatus = employee.Employeestatus; // e.g., "Active", "Resigned", etc.
        const reportingToEmail = employee["Reporting_To.MailID"]; // Manager's email

        console.log(`👤 [Zoho People Sync] Extracted - Zoho ID: ${zohoNumericId}, Code: ${employeeCode}, Email: ${emailId}, Name: ${fullName}, Status: ${employeeStatus}, Manager: ${reportingToEmail || "None"}`);

        // Skip if no employee ID or email
        if (!zohoNumericId || !emailId) {
          console.warn(`⚠️ [Zoho People Sync] Skipping employee - missing Zoho ID or email`);
          continue;
        }

        // Check if person already exists by email (primary identifier)
        console.log(`🔍 [Zoho People Sync] Looking up employee by email: ${emailId}`);
        const existingPerson = await prisma.person.findUnique({
          where: { email: emailId },
        });
        console.log(`📋 [Zoho People Sync] Lookup result: ${existingPerson ? `Found existing (ID: ${existingPerson.id})` : 'Not found - will create'}`);

        if (existingPerson) {
          console.log(`🔄 [Zoho People Sync] Updating existing employee: ${fullName} (Zoho ID: ${zohoNumericId}, Code: ${employeeCode})`);

          // Parse exit date
          const endDate = parseZohoDate(dateOfExit);

          // Update existing person
          await prisma.person.update({
            where: { email: emailId },
            data: {
              name: fullName || emailId,
              zoho_employee_id: zohoNumericId, // Update Zoho ID for existing employees
              employee_code: employeeCode,
              role: designation || existingPerson.role,
              department: department || existingPerson.department,
              end_date: endDate,
              // Only update these if not manually overridden
              ...(existingPerson.manual_ctc_override ? {} : {
                // You can add salary sync logic here if Zoho People has salary data
              }),
            },
          });
          updatedCount++;
          syncedCount++;
          console.log(`✅ [Zoho People Sync] Updated: ${fullName}${endDate ? ` (Exit: ${dateOfExit})` : ""}`);
        } else {
          console.log(`➕ [Zoho People Sync] Creating new employee: ${fullName} (Zoho ID: ${zohoNumericId}, Code: ${employeeCode})`);

          // Parse dates
          const startDate = parseZohoDate(dateOfJoining) || new Date();
          const endDate = parseZohoDate(dateOfExit);

          // Create new person
          await prisma.person.create({
            data: {
              name: fullName || emailId,
              email: emailId,
              zoho_employee_id: zohoNumericId,
              employee_code: employeeCode,
              role: designation || "Employee",
              department: department || null,
              billable: true, // Default to billable, can be changed later
              ctc_monthly: 0, // Will be updated from salary data
              utilization_target: 0.85, // Default 85% utilization
              start_date: startDate,
              end_date: endDate,
            },
          });
          createdCount++;
          syncedCount++;
          console.log(`✅ [Zoho People Sync] Created: ${fullName}${endDate ? ` (Exit: ${dateOfExit})` : ""}`);
        }
      } catch (error: any) {
        console.error(`❌ [Zoho People Sync] Error processing employee:`, error);
        errorCount++;
        errors.push(`Employee: ${error.message}`);
      }
    }

    console.log(`📊 [Zoho People Sync] Summary - Processed: ${allEmployees.length}, Created: ${createdCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);

    // Second pass: Update manager relationships and history after all employees are synced
    console.log(`🔄 [Zoho People Sync] Starting manager relationship sync...`);
    let managerUpdatedCount = 0;
    let managerHistoryCreatedCount = 0;
    let managerHistoryClosedCount = 0;
    let managerErrorCount = 0;
    const employeesWithMissingManagers: Array<{employeeId: string, name: string, managerEmail: string}> = [];
    const employeesWithNoManagerField: Array<{employeeId: string, name: string}> = [];

    for (const employeeRecord of allEmployees) {
      try {
        const employeeZohoId = Object.keys(employeeRecord)[0];
        const employeeDataArray = employeeRecord[employeeZohoId];
        if (!employeeDataArray || !Array.isArray(employeeDataArray) || employeeDataArray.length === 0) {
          continue;
        }

        const employee = employeeDataArray[0];
        const employeeCode = employee.EmployeeID; // Employee code like "DEL-123"
        const zohoNumericId = employeeZohoId; // Numeric Zoho ID like "662055000000293832"
        const reportingToEmail = employee["Reporting_To.MailID"];

        console.log(`🔍 [Manager Sync Debug] Employee ${employeeCode} (Zoho ID: ${zohoNumericId}): Extracted manager email = ${reportingToEmail || 'NOT FOUND'}`);
        console.log(`🔍 [Manager Sync Debug] Employee ${employeeCode}: Full Reporting_To fields:`,
          Object.keys(employee).filter(key => key.startsWith('Reporting_To')).reduce((acc, key) => {
            acc[key] = employee[key];
            return acc;
          }, {} as Record<string, any>)
        );

        if (!zohoNumericId) {
          continue;
        }

        // Find this employee by numeric Zoho ID (not employee code!)
        const personRecord = await prisma.person.findUnique({
          where: { zoho_employee_id: zohoNumericId },
          include: {
            manager_history: {
              where: { end_date: null }, // Get current open manager relationship
              orderBy: { start_date: 'desc' },
              take: 1,
            },
          },
        });

        if (!personRecord) {
          console.log(`⚠️ [Manager Sync Debug] Employee ${employeeCode} (Zoho ID: ${zohoNumericId}): Person record not found in database`);
          continue;
        }

        console.log(`✓ [Manager Sync Debug] Employee ${employeeCode} (${personRecord.name}, Zoho ID: ${zohoNumericId}): Person found in database`);

        // Handle manager relationship for both active and exited employees
        if (reportingToEmail) {
          // Find manager by email
          const managerRecord = await prisma.person.findUnique({
            where: { email: reportingToEmail },
          });

          if (!managerRecord) {
            console.warn(`⚠️ [Zoho People Sync] Manager ${reportingToEmail} not found for employee ${employeeCode} (${personRecord.name})`);
            console.warn(`⚠️ [Manager Sync Debug] Available manager emails in database should include: ${reportingToEmail}`);
            employeesWithMissingManagers.push({
              employeeId: employeeCode,
              name: personRecord.name,
              managerEmail: reportingToEmail
            });
            continue;
          }

          console.log(`✓ [Manager Sync Debug] Employee ${employeeCode} (${personRecord.name}): Manager ${managerRecord.name} (${reportingToEmail}) found in database`);

          // Check if manager has changed
          const currentHistoryRecord = personRecord.manager_history[0];
          const managerChanged = !currentHistoryRecord || currentHistoryRecord.manager_id !== managerRecord.id;

          if (managerChanged) {
            // Close old manager history record if exists
            if (currentHistoryRecord) {
              // Use employee's exit date if they've exited, otherwise use today
              const closeDate = personRecord.end_date || new Date();
              await prisma.managerHistory.update({
                where: { id: currentHistoryRecord.id },
                data: { end_date: closeDate },
              });
              managerHistoryClosedCount++;
              console.log(`📝 [Zoho People Sync] Closed manager history for ${personRecord.name} (end: ${closeDate.toLocaleDateString()})`);
            }

            // Determine the start date for the new manager relationship
            // If this is the first manager record, use employee's start_date
            // Otherwise, use today's date
            const managerStartDate = currentHistoryRecord
              ? new Date()
              : new Date(personRecord.start_date);

            // Determine the end date for the manager relationship
            // If employee has exited, use their exit date, otherwise leave open (null)
            const managerEndDate = personRecord.end_date || null;

            // Create new manager history record
            await prisma.managerHistory.create({
              data: {
                person_id: personRecord.id,
                manager_id: managerRecord.id,
                start_date: managerStartDate,
                end_date: managerEndDate,
              },
            });
            managerHistoryCreatedCount++;

            // Update current manager relationship (only for active employees)
            if (!personRecord.end_date) {
              await prisma.person.update({
                where: { id: personRecord.id },
                data: { manager_id: managerRecord.id },
              });
            }

            managerUpdatedCount++;
            console.log(`✅ [Zoho People Sync] Set manager for ${personRecord.name} → ${managerRecord.name} (${managerStartDate.toLocaleDateString()} - ${managerEndDate ? managerEndDate.toLocaleDateString() : 'Present'})`);
          } else {
            // Manager hasn't changed, but check if we need to close the record for exited employees
            if (personRecord.end_date && currentHistoryRecord && !currentHistoryRecord.end_date) {
              await prisma.managerHistory.update({
                where: { id: currentHistoryRecord.id },
                data: { end_date: personRecord.end_date },
              });
              managerHistoryClosedCount++;
              console.log(`📝 [Zoho People Sync] Closed manager history for exited employee ${personRecord.name} (exit: ${personRecord.end_date.toLocaleDateString()})`);

              // Clear current manager for exited employees
              if (personRecord.manager_id) {
                await prisma.person.update({
                  where: { id: personRecord.id },
                  data: { manager_id: null },
                });
              }
            } else {
              console.log(`ℹ️ [Zoho People Sync] No manager change for ${personRecord.name}`);
            }
          }
        } else {
          // No manager in Zoho - close any open history records and clear manager
          console.log(`ℹ️ [Manager Sync Debug] Employee ${employeeCode} (${personRecord.name}): No manager email field in Zoho`);
          employeesWithNoManagerField.push({
            employeeId: employeeCode,
            name: personRecord.name
          });

          const currentHistoryRecord = personRecord.manager_history[0];
          if (currentHistoryRecord) {
            await prisma.managerHistory.update({
              where: { id: currentHistoryRecord.id },
              data: { end_date: new Date() },
            });
            managerHistoryClosedCount++;
            console.log(`📝 [Zoho People Sync] Closed manager history for ${personRecord.name} (no manager)`);
          }

          if (personRecord.manager_id) {
            await prisma.person.update({
              where: { id: personRecord.id },
              data: { manager_id: null },
            });
            console.log(`ℹ️ [Zoho People Sync] Cleared manager for ${personRecord.name}`);
          }
        }

      } catch (error: any) {
        managerErrorCount++;
        console.error(`❌ [Zoho People Sync] Error setting manager:`, error);
      }
    }

    console.log(`📊 [Zoho People Sync] Manager sync complete - Updated: ${managerUpdatedCount}, History Created: ${managerHistoryCreatedCount}, History Closed: ${managerHistoryClosedCount}, Errors: ${managerErrorCount}`);

    // Detailed summary of manager sync issues
    if (employeesWithMissingManagers.length > 0) {
      console.warn(`\n⚠️ [Manager Sync Summary] ${employeesWithMissingManagers.length} employees have managers in Zoho that don't exist in database:`);
      employeesWithMissingManagers.forEach(({ employeeId, name, managerEmail }) => {
        console.warn(`   - ${name} (${employeeId}): Manager ${managerEmail} not found`);
      });
    }

    if (employeesWithNoManagerField.length > 0) {
      console.log(`\nℹ️ [Manager Sync Summary] ${employeesWithNoManagerField.length} employees have no manager field in Zoho:`);
      employeesWithNoManagerField.forEach(({ employeeId, name }) => {
        console.log(`   - ${name} (${employeeId})`);
      });
    }

    console.log(`\n✅ [Manager Sync Summary] Successfully linked managers for ${managerUpdatedCount} employees`);

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        sync_type: "zoho_people_employees",
        status: errorCount > 0 || managerErrorCount > 0 ? "completed_with_errors" : "success",
        records_synced: syncedCount,
        error_message: errors.length > 0 ? errors.join("; ") : undefined,
        metadata: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: allEmployees.length,
          managers_updated: managerUpdatedCount,
          manager_history_created: managerHistoryCreatedCount,
          manager_history_closed: managerHistoryClosedCount,
          manager_errors: managerErrorCount,
        },
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
        processed: allEmployees.length,
        synced: syncedCount,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
        duration: new Date().getTime() - syncLogStart.getTime(),
      },
      details: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    // Log failed sync
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_people_employees",
        status: "failed",
        records_synced: 0,
        error_message: error.message,
        metadata: {
          created: 0,
          updated: 0,
          errors: 1,
          total: 0,
        },
      },
    });

    throw error;
  }
}

/**
 * Sync leaves from Zoho People
 * https://www.zoho.com/people/api/leave-management.html
 */
async function syncLeaves(user: any) {
  const syncLogStart = new Date();
  let syncedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    console.log("🔄 [Zoho People Sync] Starting leaves sync...");

    const tokens = await getZohoPeopleAccessToken();
    if (!tokens) {
      throw new Error("Zoho People not connected. Please connect in Settings.");
    }

    const region = process.env.ZOHO_REGION || "US";
    const peopleDomain = region === "IN"
      ? "https://people.zoho.in"
      : "https://people.zoho.com";

    // Fetch leaves from the last 2 years to present
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 2);
    const toDate = new Date();
    toDate.setFullYear(toDate.getFullYear() + 1); // Include future approved leaves

    let sIndex = 1;
    let hasMore = true;
    const limit = 200;
    let allLeaves: any[] = [];

    while (hasMore) {
      // Zoho People Leaves API endpoint - using forms/leave/getRecords
      const apiUrl = `${peopleDomain}/people/api/forms/leave/getRecords?sIndex=${sIndex}&limit=${limit}`;
      console.log(`🌐 [Zoho People Sync] Fetching leaves batch starting at index ${sIndex}...`);

      const leavesResponse = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      });

      if (!leavesResponse.ok) {
        const error = await leavesResponse.text();
        console.error("❌ [Zoho People Sync] API Error Response:", error);
        throw new Error(`Failed to fetch leaves from Zoho People: ${error}`);
      }

      const responseData = await leavesResponse.json();

      if (responseData.status !== undefined && responseData.status !== 0) {
        console.error("❌ [Zoho People Sync] API returned error status:", responseData);
        throw new Error(`Zoho People API error: ${responseData.message || "Unknown error"}`);
      }

      const batchLeaves = responseData.response?.result || [];
      console.log(`✅ [Zoho People Sync] Retrieved ${batchLeaves.length} leaves in this batch`);

      if (batchLeaves.length === 0) {
        hasMore = false;
      } else {
        allLeaves.push(...batchLeaves);

        if (batchLeaves.length < limit) {
          hasMore = false;
        } else {
          sIndex += limit;
        }
      }
    }

    console.log(`✅ [Zoho People Sync] Total leaves retrieved: ${allLeaves.length}`);

    // Log first few records to understand structure
    if (allLeaves.length > 0) {
      console.log("📋 [Zoho People Sync] Sample leave record structure:");
      console.log(JSON.stringify(allLeaves[0], null, 2));
      if (allLeaves.length > 1) {
        console.log("📋 [Zoho People Sync] Second leave record:");
        console.log(JSON.stringify(allLeaves[1], null, 2));
      }
    }

    // Process each leave
    for (const leaveRecord of allLeaves) {
      try {
        const leaveId = Object.keys(leaveRecord)[0];
        const leaveDataArray = leaveRecord[leaveId];

        if (!leaveDataArray || !Array.isArray(leaveDataArray) || leaveDataArray.length === 0) {
          console.warn(`⚠️ [Zoho People Sync] Skipping leave - invalid structure:`, leaveRecord);
          continue;
        }

        const leave = leaveDataArray[0];
        console.log(`📝 [Zoho People Sync] Processing leave ${leaveId}:`, JSON.stringify(leave, null, 2).substring(0, 500));

        const employeeId = leave["Employee_ID.ID"]; // Use the actual Zoho employee ID, not the display name
        const leaveType = leave.Leavetype;
        const fromDateStr = leave.From;
        const toDateStr = leave.To;
        const daysCount = parseFloat(leave.Daystaken) || 0; // Fixed: was "Dayscounted", should be "Daystaken"
        const approvalStatus = leave.ApprovalStatus; // "Approved", "Pending", "Rejected", "Cancelled"
        const reason = leave.Reasonforleave; // Fixed: was "Reason", should be "Reasonforleave"

        if (!employeeId || !fromDateStr || !toDateStr) {
          console.warn(`⚠️ [Zoho People Sync] Skipping leave ${leaveId} - missing required fields (employeeId: ${employeeId}, from: ${fromDateStr}, to: ${toDateStr})`);
          continue;
        }

        console.log(`🔍 [Zoho People Sync] Looking up employee with Zoho ID: ${employeeId}`);

        // Find person by Zoho employee ID
        const person = await prisma.person.findUnique({
          where: { zoho_employee_id: employeeId },
        });

        if (!person) {
          console.warn(`⚠️ [Zoho People Sync] Employee ${employeeId} not found in database for leave ${leaveId}`);
          continue;
        }

        console.log(`✅ [Zoho People Sync] Found employee: ${person.name} (DB ID: ${person.id}, Zoho ID: ${employeeId})`);

        // Parse dates
        const startDate = parseZohoDate(fromDateStr);
        const endDate = parseZohoDate(toDateStr);

        if (!startDate || !endDate) {
          console.warn(`⚠️ [Zoho People Sync] Invalid dates for leave ${leaveId}`);
          continue;
        }

        // Map Zoho approval status to our enum
        let status: "pending" | "approved" | "rejected" | "cancelled" = "pending";
        if (approvalStatus?.toLowerCase() === "approved") status = "approved";
        else if (approvalStatus?.toLowerCase() === "rejected") status = "rejected";
        else if (approvalStatus?.toLowerCase() === "cancelled") status = "cancelled";

        // Only sync approved leaves - skip all others
        if (status !== "approved") {
          console.log(`⏭️ [Zoho People Sync] Skipping leave ${leaveId} - status is '${status}' (only approved leaves are synced)`);
          continue;
        }

        // Check if leave already exists
        const existingLeave = await prisma.leave.findUnique({
          where: { zoho_leave_id: leaveId },
        });

        if (existingLeave) {
          await prisma.leave.update({
            where: { zoho_leave_id: leaveId },
            data: {
              leave_type: leaveType,
              start_date: startDate,
              end_date: endDate,
              days: daysCount,
              status,
              reason,
            },
          });
          updatedCount++;
        } else {
          await prisma.leave.create({
            data: {
              person_id: person.id,
              zoho_leave_id: leaveId,
              leave_type: leaveType,
              start_date: startDate,
              end_date: endDate,
              days: daysCount,
              status,
              reason,
            },
          });
          createdCount++;
        }

        syncedCount++;
      } catch (error: any) {
        console.error(`❌ [Zoho People Sync] Error processing leave:`, error);
        errorCount++;
        errors.push(`Leave: ${error.message}`);
      }
    }

    console.log(`📊 [Zoho People Sync] Leaves sync complete - Created: ${createdCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);

    const syncLog = await prisma.syncLog.create({
      data: {
        sync_type: "zoho_people_leaves",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_synced: syncedCount,
        error_message: errors.length > 0 ? errors.join("; ") : undefined,
        metadata: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: allLeaves.length,
        },
      },
    });

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
        processed: allLeaves.length,
        synced: syncedCount,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
        duration: new Date().getTime() - syncLogStart.getTime(),
      },
      details: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_people_leaves",
        status: "failed",
        records_synced: 0,
        error_message: error.message,
        metadata: {
          created: 0,
          updated: 0,
          errors: 1,
          total: 0,
        },
      },
    });

    throw error;
  }
}

/**
 * Sync holidays from Zoho People
 * https://www.zoho.com/people/api/holidays.html
 */
async function syncHolidays(user: any) {
  const syncLogStart = new Date();
  let syncedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    console.log("🔄 [Zoho People Sync] Starting holidays sync...");

    const tokens = await getZohoPeopleAccessToken();
    if (!tokens) {
      throw new Error("Zoho People not connected. Please connect in Settings.");
    }

    const region = process.env.ZOHO_REGION || "US";
    const peopleDomain = region === "IN"
      ? "https://people.zoho.in"
      : "https://people.zoho.com";

    // Fetch holidays for the last year and next year
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];

    let allHolidays: any[] = [];

    for (const year of years) {
      // Use the correct Zoho People holidays API endpoint with required parameters
      const fromDate = `01-Jan-${year}`;
      const toDate = `31-Dec-${year}`;
      const apiUrl = `${peopleDomain}/people/api/leave/v2/holidays/get?dateFormat=dd-MMM-yyyy&from=${fromDate}&to=${toDate}`;
      console.log(`🌐 [Zoho People Sync] Fetching holidays for year ${year}...`);
      console.log(`🔗 [Zoho People Sync] API URL: ${apiUrl}`);

      const holidaysResponse = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      });

      if (!holidaysResponse.ok) {
        const error = await holidaysResponse.text();
        console.error("❌ [Zoho People Sync] API Error Response:", error);
        // Continue with other years even if one fails
        continue;
      }

      const responseData = await holidaysResponse.json();

      // V2 API returns data in a different structure
      // Check for success (status: 1 means success in v2 API)
      if (!responseData.data || responseData.status !== 1) {
        console.error("❌ [Zoho People Sync] API returned error:", responseData);
        continue;
      }

      // V2 API returns holidays directly in the data array
      const yearHolidays = responseData.data || [];
      console.log(`✅ [Zoho People Sync] Retrieved ${yearHolidays.length} holidays for year ${year}`);
      allHolidays.push(...yearHolidays);
    }

    console.log(`✅ [Zoho People Sync] Total holidays retrieved: ${allHolidays.length}`);

    // Process each holiday
    for (const holiday of allHolidays) {
      try {
        // V2 API returns holiday data directly in each array element
        const holidayId = holiday.ID; // Zoho holiday ID
        const holidayDate = holiday.Date;
        const holidayName = holiday.Name;
        const isRestricted = holiday.isRestrictedHoliday; // boolean
        const description = holiday.Remarks;

        if (!holidayDate || !holidayName) {
          continue;
        }

        // Parse date
        const date = parseZohoDate(holidayDate);
        if (!date) {
          console.warn(`⚠️ [Zoho People Sync] Invalid date for holiday ${holidayName}`);
          continue;
        }

        // Map Zoho holiday type to our enum
        // V2 API uses isRestrictedHoliday boolean instead of Type string
        let type: "public" | "restricted" | "optional" = isRestricted ? "restricted" : "public";

        // Check if holiday already exists by date (unique constraint)
        const existingHoliday = await prisma.holiday.findUnique({
          where: { date },
        });

        if (existingHoliday) {
          await prisma.holiday.update({
            where: { date },
            data: {
              name: holidayName,
              type,
              description,
              zoho_holiday_id: holidayId,
            },
          });
          updatedCount++;
        } else {
          await prisma.holiday.create({
            data: {
              date,
              name: holidayName,
              type,
              description,
              zoho_holiday_id: holidayId,
            },
          });
          createdCount++;
        }

        syncedCount++;
      } catch (error: any) {
        console.error(`❌ [Zoho People Sync] Error processing holiday:`, error);
        errorCount++;
        errors.push(`Holiday: ${error.message}`);
      }
    }

    console.log(`📊 [Zoho People Sync] Holidays sync complete - Created: ${createdCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);

    const syncLog = await prisma.syncLog.create({
      data: {
        sync_type: "zoho_people_holidays",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_synced: syncedCount,
        error_message: errors.length > 0 ? errors.join("; ") : undefined,
        metadata: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: allHolidays.length,
        },
      },
    });

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
        processed: allHolidays.length,
        synced: syncedCount,
        created: createdCount,
        updated: updatedCount,
        errors: errorCount,
        duration: new Date().getTime() - syncLogStart.getTime(),
      },
      details: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_people_holidays",
        status: "failed",
        records_synced: 0,
        error_message: error.message,
        metadata: {
          created: 0,
          updated: 0,
          errors: 1,
          total: 0,
        },
      },
    });

    throw error;
  }
}
