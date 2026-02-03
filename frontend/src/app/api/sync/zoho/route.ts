import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";
import { getZohoBooksApiUrl } from "@/lib/zoho/config";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";

const prisma = new PrismaClient();

/**
 * POST /api/sync/zoho
 * On-demand sync of cash receipts from Zoho Books
 * Only owner/finance can trigger this sync
 */
export const POST = withAdminRole(async (req, { user }) => {
  try {
    const body = await req.json();
    const { syncType = "cash_receipts" } = body;

    if (syncType === "cash_receipts") {
      return await syncCashReceipts(user);
    }

    if (syncType === "contacts") {
      return await syncContacts(user);
    }

    return NextResponse.json(
      { error: "Invalid sync type. Use 'contacts' or 'cash_receipts'" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error syncing Zoho data:", error);
    return NextResponse.json(
      { error: "Failed to sync Zoho data", details: error.message },
      { status: 500 }
    );
  }
});

async function syncCashReceipts(user: any) {
  const syncLogStart = new Date();
  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    // Get Zoho Books access token from database
    const tokens = await getZohoAccessToken();

    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    // Fetch customer payments from Zoho Books
    // https://www.zoho.com/books/api/v3/#Customer-Payments_List_Customer_Payments
    const paymentsResponse = await fetch(
      `${tokens.api_domain}/books/v3/customerpayments?organization_id=${tokens.organization_id}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      }
    );

    if (!paymentsResponse.ok) {
      const error = await paymentsResponse.text();
      throw new Error(`Failed to fetch payments from Zoho Books: ${error}`);
    }

    const { customerpayments } = await paymentsResponse.json();

    // Process each payment
    for (const payment of customerpayments) {
      try {
        // Find the corresponding invoice in our system
        const invoice = await prisma.invoice.findUnique({
          where: { zoho_invoice_id: payment.invoice_id },
        });

        if (!invoice) {
          skippedCount++;
          errors.push(`Invoice not found for Zoho payment ${payment.payment_id}`);
          continue;
        }

        // Check if payment already exists
        const existingReceipt = await prisma.cashReceipt.findUnique({
          where: { zoho_payment_id: payment.payment_id },
        });

        if (existingReceipt) {
          // Update existing receipt
          await prisma.cashReceipt.update({
            where: { zoho_payment_id: payment.payment_id },
            data: {
              amount: payment.amount,
              payment_mode: payment.payment_mode,
              reference_number: payment.reference_number,
              payment_date: new Date(payment.payment_date),
              notes: payment.notes,
            },
          });
          syncedCount++;
        } else {
          // Create new cash receipt
          await prisma.cashReceipt.create({
            data: {
              invoice_id: invoice.id,
              zoho_payment_id: payment.payment_id,
              amount: payment.amount,
              payment_mode: payment.payment_mode,
              reference_number: payment.reference_number,
              payment_date: new Date(payment.payment_date),
              notes: payment.notes,
            },
          });
          syncedCount++;
        }
      } catch (error: any) {
        errorCount++;
        errors.push(`Payment ${payment.payment_id}: ${error.message}`);
      }
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        entity: "CashReceipt",
        source: "ZohoBooks",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_processed: customerpayments.length,
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
        processed: customerpayments.length,
        synced: syncedCount,
        skipped: skippedCount,
        errors: errorCount,
        duration: new Date().getTime() - syncLogStart.getTime(),
      },
      details: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    // Log failed sync
    await prisma.syncLog.create({
      data: {
        entity: "CashReceipt",
        source: "ZohoBooks",
        status: "failed",
        records_processed: 0,
        records_synced: 0,
        errors: [error.message],
        triggered_by: user.id,
      },
    });

    throw error;
  }
}

async function syncContacts(user: any) {
  const syncLogStart = new Date();
  let syncedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    // Get Zoho Books access token from database
    const tokens = await getZohoAccessToken();

    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    // Fetch all contacts from Zoho Books with pagination
    // https://www.zoho.com/books/api/v3/#Contacts_List_Contacts
    let allContacts: any[] = [];
    let page = 1;
    let hasMorePages = true;
    const perPage = 200; // Zoho Books max per page

    while (hasMorePages) {
      const contactsResponse = await fetch(
        `${tokens.api_domain}/books/v3/contacts?organization_id=${tokens.organization_id}&page=${page}&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
          },
        }
      );

      if (!contactsResponse.ok) {
        const error = await contactsResponse.text();
        throw new Error(`Failed to fetch contacts from Zoho Books: ${error}`);
      }

      const responseData = await contactsResponse.json();
      const { contacts, page_context } = responseData;

      allContacts = allContacts.concat(contacts);

      // Check if there are more pages
      hasMorePages = page_context?.has_more_page || false;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 100) {
        console.warn("Reached maximum page limit (100) for Zoho contacts sync");
        break;
      }
    }

    // Process each contact
    for (const contact of allContacts) {
      try {
        // Skip if contact has no company name
        if (!contact.company_name) {
          continue;
        }

        // Check if client already exists
        const existingClient = await prisma.client.findUnique({
          where: { zoho_contact_id: contact.contact_id },
        });

        if (existingClient) {
          // Update existing client
          await prisma.client.update({
            where: { zoho_contact_id: contact.contact_id },
            data: {
              name: contact.company_name,
              billing_currency: contact.currency_code || "INR",
              gstin: contact.gst_no || undefined,
              pan: contact.tax_id || undefined,
            },
          });
          updatedCount++;
          syncedCount++;
        } else {
          // Create new client
          await prisma.client.create({
            data: {
              name: contact.company_name,
              zoho_contact_id: contact.contact_id,
              billing_currency: contact.currency_code || "INR",
              gstin: contact.gst_no || undefined,
              pan: contact.tax_id || undefined,
              tags: contact.tags || [],
            },
          });
          createdCount++;
          syncedCount++;
        }
      } catch (error: any) {
        errorCount++;
        errors.push(`Contact ${contact.contact_id}: ${error.message}`);
      }
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        sync_type: "zoho_contacts",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_synced: syncedCount,
        error_message: errors.length > 0 ? errors.join("; ") : undefined,
        metadata: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: allContacts.length,
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
        processed: allContacts.length,
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
        sync_type: "zoho_contacts",
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
