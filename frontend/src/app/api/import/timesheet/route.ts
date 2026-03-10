import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { parse } from "csv-parse/sync";
import { createHash } from "crypto";

const prisma = new PrismaClient();

interface TimesheetRow {
  Date: string;
  "Email Id": string;
  "User Name": string;
  "Employee Code": string;
  "Task/General/subtask name": string;
  "Project name": string;
  "Task type": string;
  "Enter By": string;
  Hours: string;
  "Hours(For Client)": string;
  "Hours(For Calculation)": string;
  Notes: string;
  "All Fields": string;
}

/**
 * POST /api/import/timesheet
 * Import timesheet from CSV with delete+insert strategy
 * - Auto-creates projects under "Unknown Client" if they don't exist
 * - Auto-creates contractors if they don't exist
 * - Deletes existing entries for the period before inserting new ones
 * - Stores raw daily entries (not aggregated)
 */
export const POST = withAuth(async (req, { user }: { user: any }) => {
  try {
    console.log("Starting timesheet import...");

    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      console.log("Permission denied for user:", user.role);
      return NextResponse.json(
        { error: "Only owners and finance can import timesheets" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.log("No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log("File received:", file.name, "Size:", file.size);

    // Read CSV content
    const csvContent = await file.text();
    console.log("CSV content length:", csvContent.length);

    // Log first line to debug delimiter/header issues
    const firstLine = csvContent.split('\n')[0];
    console.log("CSV first line:", firstLine.substring(0, 200));

    // Parse CSV
    const records: TimesheetRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Allow inconsistent column counts
      skip_records_with_error: true, // Skip malformed records
      relax_quotes: true, // Handle quotes more flexibly
    });

    console.log(`Parsed ${records.length} records`);
    if (records.length > 0) {
      console.log("Column headers:", Object.keys(records[0]));
      console.log("First record:", JSON.stringify(records[0]));
    }

    if (records.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty" },
        { status: 400 }
      );
    }

    // Get or create "Unknown Client"
    let unknownClient = await prisma.client.findFirst({
      where: { name: "Unknown Client" },
    });

    if (!unknownClient) {
      unknownClient = await prisma.client.create({
        data: {
          name: "Unknown Client",
          billing_currency: "INR",
          tags: ["auto-created"],
        },
      });
    }

    // Track statistics
    const stats = {
      totalRows: records.length,
      processedRows: 0,
      skippedRows: 0,
      newProjects: 0,
      newContractors: 0,
      deletedEntries: 0,
      newEntries: 0,
      errors: [] as string[],
    };

    // Track dates to determine period range
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    // Collect all entries to insert
    const entriesToInsert: any[] = [];

    for (const [index, record] of records.entries()) {
      try {
        // Validate required fields
        if (!record.Date || !record["Email Id"] || !record["Project name"]) {
          stats.skippedRows++;
          stats.errors.push(
            `Row ${index + 2}: Missing required fields (Date, Email Id, or Project name)`
          );
          continue;
        }

        // Parse date - supports multiple formats:
        //   DD/MM/YY, DD/MM/YYYY, DD-MM-YY, DD-MM-YYYY, YYYY-MM-DD
        const dateParts = record.Date.trim().split(/[\/\-]/);
        if (dateParts.length !== 3) {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: Invalid date format: ${record.Date}`);
          continue;
        }

        let day: number, month: number, year: number;
        const p0 = parseInt(dateParts[0], 10);
        const p1 = parseInt(dateParts[1], 10);
        const p2 = parseInt(dateParts[2], 10);

        if (p0 > 999) {
          // YYYY-MM-DD (ISO format)
          year = p0;
          month = p1 - 1;
          day = p2;
        } else {
          // DD/MM/YY or DD-MM-YYYY
          day = p0;
          month = p1 - 1; // JS months are 0-indexed
          year = p2;
        }

        // Convert 2-digit year to 4-digit (assume 20XX for YY < 50, 19XX otherwise)
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }

        // Create date at midnight UTC to avoid timezone issues
        const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        if (isNaN(date.getTime())) {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: Invalid date: ${record.Date}`);
          continue;
        }

        // Track min/max dates for period calculation
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;

        // Find or create person by email (handles contractors)
        let person = await prisma.person.findUnique({
          where: { email: record["Email Id"].toLowerCase().trim() },
        });

        if (!person) {
          // Auto-create as contractor
          const email = record["Email Id"].toLowerCase().trim();
          const name = record["User Name"] || email.split('@')[0];

          person = await prisma.person.create({
            data: {
              email,
              name,
              role: "Contractor",
              billable: true, // Contractors are typically billable
              start_date: date, // Use the work date
              ctc_monthly: 0, // Set to 0 for contractors (paid per project)
              utilization_target: 1.0, // 100% for contractors
            },
          });

          stats.newContractors++;
          console.log(`Auto-created contractor: ${name} (${email})`);
        }

        // Find or create project
        let project = await prisma.project.findFirst({
          where: { name: record["Project name"].trim() },
        });

        if (!project) {
          // Auto-create project under Unknown Client
          project = await prisma.project.create({
            data: {
              client_id: unknownClient.id,
              name: record["Project name"].trim(),
              pricing_model: "TnM",
              start_date: date,
              status: "active",
            },
          });
          stats.newProjects++;
        }

        // Parse hours - use Hours(For Calculation) as the main hours value
        const calculationHours = parseFloat(record["Hours(For Calculation)"]) || 0;

        // Determine if billable based on Task type column
        // Check for exact "Billable" (not "Non Billable")
        const taskTypeLower = record["Task type"]?.toLowerCase().trim() || "";
        const isBillable = taskTypeLower === "billable";

        // Create unique hash per CSV row - include row index since multiple rows
        // can have identical date/email/project/hours (e.g. separate task entries)
        const hashContent = `${index}|${record.Date}|${record["Email Id"]}|${record["Project name"]}|${record["Task Name"]}|${calculationHours}|${record.Notes || ''}`;
        const sourceRowHash = createHash("md5").update(hashContent).digest("hex");

        // Collect entry for batch insert
        entriesToInsert.push({
          person_id: person.id,
          project_id: project.id,
          work_date: date,
          task_name: record["Task Name"] || null,
          task_type: record["Task type"] || null,
          hours_logged: calculationHours,
          is_billable: isBillable,
          notes: record.Notes || null,
          source_row_hash: sourceRowHash,
        });

        stats.processedRows++;
      } catch (error) {
        stats.skippedRows++;
        stats.errors.push(
          `Row ${index + 2}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // If no valid entries, return early
    if (entriesToInsert.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid timesheet entries to import",
        stats,
      });
    }

    // Create import batch record
    const importBatch = await prisma.timesheetImportBatch.create({
      data: {
        imported_by: user.id,
        file_name: file.name,
        period_start: minDate!,
        period_end: maxDate!,
        total_rows: records.length,
        processed_rows: stats.processedRows,
        skipped_rows: stats.skippedRows,
        error_messages: stats.errors,
      },
    });

    // Delete existing entries for this period
    const deleteResult = await prisma.timesheetEntry.deleteMany({
      where: {
        work_date: {
          gte: minDate!,
          lte: maxDate!,
        },
      },
    });

    stats.deletedEntries = deleteResult.count;
    console.log(`🗑️ Deleted ${deleteResult.count} existing entries for period ${minDate?.toISOString().split('T')[0]} to ${maxDate?.toISOString().split('T')[0]}`);

    // Insert new entries with import_batch_id
    const entriesWithBatchId = entriesToInsert.map(entry => ({
      ...entry,
      import_batch_id: importBatch.id,
    }));

    await prisma.timesheetEntry.createMany({
      data: entriesWithBatchId,
      skipDuplicates: true, // Safety net for hash collisions
    });

    stats.newEntries = entriesWithBatchId.length;

    // Update batch with deleted count
    await prisma.timesheetImportBatch.update({
      where: { id: importBatch.id },
      data: { deleted_entries: stats.deletedEntries },
    });

    // Log the import
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "TimesheetEntry",
        entity_id: importBatch.id,
        action: "import",
        after_json: {
          ...stats,
          batch_id: importBatch.id,
          period: `${minDate?.toISOString().split('T')[0]} to ${maxDate?.toISOString().split('T')[0]}`,
        },
      },
    });

    console.log(`✅ Import complete: ${stats.newEntries} entries created, ${stats.deletedEntries} old entries deleted`);

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        batch_id: importBatch.id,
      },
    });
  } catch (error) {
    console.error("Error importing timesheet:", error);
    return NextResponse.json(
      {
        error: "Failed to import timesheet",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
