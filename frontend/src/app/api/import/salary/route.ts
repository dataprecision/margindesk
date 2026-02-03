import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

interface SalaryRow {
  "Emp Code": string;
  Name: string;
  [key: string]: string; // Third column can have dynamic name like "Sep-25"
}

/**
 * POST /api/import/salary
 * Import salary data from CSV with upsert strategy
 * - Matches employees by employee code
 * - Updates existing salary records or creates new ones
 * - Requires month selection (YYYY-MM format)
 */
export const POST = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    console.log("Starting salary import...");

    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      console.log("Permission denied for user:", user.role);
      return NextResponse.json(
        { error: "Only owners and finance can import salaries" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const monthStr = formData.get("month") as string; // Format: "YYYY-MM"

    if (!file) {
      console.log("No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!monthStr) {
      console.log("No month provided");
      return NextResponse.json({ error: "Month is required (YYYY-MM format)" }, { status: 400 });
    }

    // Parse month
    const [year, month] = monthStr.split("-").map(Number);
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 });
    }

    // Use UTC to avoid timezone conversion issues - set to last day of month at noon UTC
    const salaryMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0)); // Last day of the month at noon UTC

    console.log("File received:", file.name, "Size:", file.size, "Month:", salaryMonth.toISOString());

    // Read CSV content
    const csvContent = await file.text();
    console.log("CSV content length:", csvContent.length);

    // Parse CSV
    const records: SalaryRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      skip_records_with_error: true,
      relax_quotes: true,
    });

    if (records.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty" },
        { status: 400 }
      );
    }

    console.log(`Parsed ${records.length} rows from CSV`);

    // Track statistics
    const stats = {
      totalRows: records.length,
      processedRows: 0,
      skippedRows: 0,
      newRecords: 0,
      updatedRecords: 0,
      newEmployees: 0,
      errors: [] as string[],
    };

    // Process each row
    for (const [index, record] of records.entries()) {
      try {
        // Validate required fields
        if (!record["Emp Code"] || !record["Name"]) {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: Missing Emp Code or Name`);
          continue;
        }

        // Find salary amount (third column - can have any name like "Sep-25")
        const columns = Object.keys(record);
        const salaryColumnName = columns.find(col => col !== "Emp Code" && col !== "Name");

        if (!salaryColumnName) {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: No salary column found`);
          continue;
        }

        const salaryStr = record[salaryColumnName];
        if (!salaryStr) {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: Salary value is empty`);
          continue;
        }

        // Parse salary amount (remove currency symbols, commas, spaces and convert to number)
        const cleanedSalary = salaryStr
          .replace(/[₹$€£]/g, "") // Remove currency symbols
          .replace(/,/g, "") // Remove commas
          .trim(); // Remove spaces

        // Handle empty or dash values (treat as 0)
        if (cleanedSalary === "" || cleanedSalary === "-") {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: Empty or zero salary amount: ${salaryStr}`);
          continue;
        }

        const salaryAmount = parseFloat(cleanedSalary);
        if (isNaN(salaryAmount) || salaryAmount < 0) {
          stats.skippedRows++;
          stats.errors.push(`Row ${index + 2}: Invalid salary amount: ${salaryStr} (cleaned: ${cleanedSalary})`);
          continue;
        }

        // Find or create person by employee code
        let person = await prisma.person.findFirst({
          where: {
            employee_code: record["Emp Code"].trim(),
          },
        });

        if (!person) {
          // Create new employee with start_date 3 years ago (for management resources)
          const threeYearsAgo = new Date();
          threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

          person = await prisma.person.create({
            data: {
              employee_code: record["Emp Code"].trim(),
              name: record["Name"].trim(),
              email: `${record["Emp Code"].trim().toLowerCase()}@temp.local`, // Temporary email
              role: "employee",
              start_date: threeYearsAgo,
            },
          });
          stats.newEmployees++;
          console.log(`✨ Created new employee: ${person.name} (${person.employee_code})`);
        }

        // Determine if this person is support staff based on department
        // Support staff: IT, HR, Accounts, Admin, Sales, Finance, Technology, People and Culture, Management
        // Also support staff if no department is defined
        const isSupportStaff = !person.department ||
          ['IT', 'HR', 'Accounts', 'Admin', 'Sales', 'Finance', 'Technology', 'People and Culture', 'Management'].includes(person.department);

        // Upsert salary record
        const result = await prisma.personSalary.upsert({
          where: {
            person_id_month: {
              person_id: person.id,
              month: salaryMonth,
            },
          },
          update: {
            base_salary: salaryAmount,
            total: salaryAmount, // For now, total = base_salary
            is_support_staff: isSupportStaff,
            updated_at: new Date(),
          },
          create: {
            person_id: person.id,
            month: salaryMonth,
            base_salary: salaryAmount,
            total: salaryAmount,
            is_support_staff: isSupportStaff,
          },
        });

        // Check if it was an update or create
        const existing = await prisma.personSalary.findFirst({
          where: {
            person_id: person.id,
            month: salaryMonth,
            created_at: { lt: new Date(Date.now() - 1000) }, // Created more than 1 second ago
          },
        });

        if (existing) {
          stats.updatedRecords++;
        } else {
          stats.newRecords++;
        }

        stats.processedRows++;
      } catch (error) {
        stats.skippedRows++;
        stats.errors.push(
          `Row ${index + 2}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Log the import
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PersonSalary",
        entity_id: salaryMonth.toISOString(),
        action: "import",
        after_json: {
          ...stats,
          month: salaryMonth.toISOString(),
          file_name: file.name,
        },
      },
    });

    console.log(`✅ Import complete: ${stats.newRecords} created, ${stats.updatedRecords} updated`);

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        month: salaryMonth.toISOString().substring(0, 7), // YYYY-MM format
      },
    });
  } catch (error) {
    console.error("Error importing salaries:", error);
    return NextResponse.json(
      {
        error: "Failed to import salaries",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
