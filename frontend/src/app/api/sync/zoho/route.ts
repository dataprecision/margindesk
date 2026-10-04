import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRole } from "@/lib/auth/protect-route";
import { getZohoBooksApiUrl } from "@/lib/zoho/config";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";


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
    if (syncType === "contact_persons") {
      return await syncContactPersons(user, body.only_with_contracts !== false);
    }
    if (syncType === "invoices") {
      return await syncInvoices(user, body.date_start || "2025-04-01");
    }
    if (syncType === "creditnotes") {
      return await syncCreditNotes(user, body.date_start || "2025-04-01");
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

        // Zoho returns tags as objects: { tag_name: "Country", tag_option_name: "India", ... }
        // Client.tags is String[], so flatten to "Category:Value" strings to preserve both.
        const flattenedTags: string[] = Array.isArray(contact.tags)
          ? contact.tags
              .map((t: any) =>
                t?.tag_name && t?.tag_option_name
                  ? `${t.tag_name}:${t.tag_option_name}`
                  : t?.tag_option_name || null
              )
              .filter((s: string | null): s is string => Boolean(s))
          : [];

        if (existingClient) {
          // Update existing client
          await prisma.client.update({
            where: { zoho_contact_id: contact.contact_id },
            data: {
              name: contact.company_name,
              billing_currency: contact.currency_code || "INR",
              gstin: contact.gst_no || undefined,
              pan: contact.pan_no || contact.tax_id || undefined,
              tags: flattenedTags,
              ...companyFields(contact),
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
              pan: contact.pan_no || contact.tax_id || undefined,
              tags: flattenedTags,
              ...companyFields(contact),
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

    const matches = await proposePlaceholderMatches();

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


/** Company facts Zoho holds that the register shows read-only. */
function companyFields(contact: any) {
  return {
    contact_type: contact.contact_type || undefined,
    zoho_status: contact.status || undefined,
    payment_terms: Number.isFinite(Number(contact.payment_terms)) ? Number(contact.payment_terms) : undefined,
    primary_email: contact.email || undefined,
    primary_phone: contact.phone || contact.mobile || undefined,
    website: contact.website || undefined,
    placeholder: false,
  };
}

const normName = (s: string) =>
  s.toLowerCase().replace(/\b(private|pvt|limited|ltd|llp|inc|pte|co|company|the)\b\.?/g, "").replace(/[^a-z0-9]/g, "");

/**
 * A placeholder is a company created here before finance made the Zoho record.
 * Once a Zoho contact with the same GSTIN, PAN or name exists, suggest it and
 * raise a follow-up for finance to confirm the merge. Nothing is merged here.
 */
async function proposePlaceholderMatches() {
  const placeholders = await prisma.client.findMany({ where: { placeholder: true, zoho_contact_id: null }, select: { id: true, name: true, gstin: true, pan: true, suggested_zoho_contact_id: true } });
  if (placeholders.length === 0) return 0;
  const synced = await prisma.client.findMany({ where: { zoho_contact_id: { not: null } }, select: { id: true, name: true, gstin: true, pan: true, zoho_contact_id: true } });
  let proposed = 0;
  for (const p of placeholders) {
    const hit =
      (p.gstin && synced.find((c) => c.gstin && c.gstin === p.gstin)) ||
      (p.pan && synced.find((c) => c.pan && c.pan === p.pan)) ||
      synced.find((c) => normName(c.name) === normName(p.name) && normName(p.name).length > 3);
    if (!hit || hit.zoho_contact_id === p.suggested_zoho_contact_id) continue;
    await prisma.client.update({ where: { id: p.id }, data: { suggested_zoho_contact_id: hit.zoho_contact_id } });
    await prisma.contractTask.upsert({
      where: { auto_key: `company-match:${p.id}` },
      create: { auto_key: `company-match:${p.id}`, kind: "company_match", title: `Zoho record found for ${p.name}: confirm it is "${hit.name}"`, detail: "Open the company page and confirm the link; contracts and contacts move to the Zoho-backed record.", due_date: new Date(Date.now() + 7 * 86_400_000), owner: null, created_by: "zoho_contacts sync" },
      update: { title: `Zoho record found for ${p.name}: confirm it is "${hit.name}"` },
    });
    proposed++;
  }
  return proposed;
}

/**
 * Contact persons from Zoho Books (read-only), one call per company. Roles
 * and escalation levels are set in MarginDesk and never overwritten here.
 */
async function syncContactPersons(user: any, onlyWithContracts: boolean) {
  const started = new Date();
  let companies = 0, created = 0, updated = 0, deactivated = 0;
  const errors: string[] = [];
  try {
    const tokens = await getZohoAccessToken();
    if (!tokens) throw new Error("Zoho Books not connected. Please connect in Settings.");
    const clients = await prisma.client.findMany({
      where: { zoho_contact_id: { not: null }, ...(onlyWithContracts ? { OR: [{ contracts: { some: {} } }, { projects: { some: {} } }] } : {}) },
      select: { id: true, zoho_contact_id: true, name: true },
    });
    for (const client of clients) {
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${tokens.api_domain}/books/v3/contacts/${client.zoho_contact_id}/contactpersons?organization_id=${tokens.organization_id}`, { headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` } });
        if (res.status !== 429) break;
        await new Promise((r) => setTimeout(r, 60_000));
      }
      if (!res || !res.ok) { errors.push(`${client.name}: HTTP ${res?.status}`); continue; }
      const persons: any[] = (await res.json()).contact_persons ?? [];
      companies++;
      const seen: string[] = [];
      for (const cp of persons) {
        const name = [cp.salutation, cp.first_name, cp.last_name].filter(Boolean).join(" ").trim() || cp.email || "Contact";
        const data = { name, designation: cp.designation || null, department: cp.department || null, email: cp.email || null, phone: cp.phone || null, mobile: cp.mobile || null, is_primary: !!cp.is_primary_contact, source: "zoho", active: true };
        const existing = await prisma.clientContact.findUnique({ where: { zoho_contact_person_id: cp.contact_person_id } });
        if (existing) { await prisma.clientContact.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.clientContact.create({ data: { ...data, client_id: client.id, zoho_contact_person_id: cp.contact_person_id } }); created++; }
        seen.push(cp.contact_person_id);
      }
      const gone = await prisma.clientContact.updateMany({ where: { client_id: client.id, source: "zoho", active: true, zoho_contact_person_id: { notIn: seen } }, data: { active: false } });
      deactivated += gone.count;
      await new Promise((r) => setTimeout(r, 650)); // stay under Zoho's per-minute limit
    }
    await prisma.syncLog.create({ data: { sync_type: "zoho_contact_persons", status: errors.length ? "completed_with_errors" : "success", started_at: started, completed_at: new Date(), records_synced: created + updated, error_message: errors.length ? errors.slice(0, 20).join("; ") : undefined, metadata: { companies, created, updated, deactivated, triggered_by: user?.email } } });
    return NextResponse.json({ success: true, companies, created, updated, deactivated, errors: errors.length });
  } catch (error: any) {
    await prisma.syncLog.create({ data: { sync_type: "zoho_contact_persons", status: "failed", started_at: started, completed_at: new Date(), error_message: error.message } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dateOf = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s.slice(0, 10) + "T00:00:00.000Z") : null);
const tsOf = (s: unknown) => (typeof s === "string" && s ? new Date(s) : null);

/** GET a Zoho Books path, waiting out the per-minute limit. */
async function zohoGet(tokens: { api_domain: string; organization_id: string; access_token: string }, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${tokens.api_domain}/books/v3/${path}${path.includes("?") ? "&" : "?"}organization_id=${tokens.organization_id}`, { headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` } });
    if (res.status === 429) { await pause(60_000); continue; }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(`${path}: rate limited`);
}

async function listAll(tokens: any, base: string, key: string) {
  const out: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const data = await zohoGet(tokens, `${base}&per_page=200&page=${page}`);
    out.push(...(data[key] ?? []));
    if (!data.page_context?.has_more_page) break;
    await pause(400);
  }
  return out;
}

/**
 * Zoho Books invoices, read-only. The list is fetched in full from date_start;
 * details (line items, custom fields) only for invoices that are new or were
 * modified since the last sync.
 */
async function syncInvoices(user: any, dateStart: string) {
  const started = new Date();
  let created = 0, updated = 0, unchanged = 0;
  const errors: string[] = [];
  try {
    const tokens = await getZohoAccessToken();
    if (!tokens) throw new Error("Zoho Books not connected. Please connect in Settings.");
    const clients = await prisma.client.findMany({ where: { zoho_contact_id: { not: null } }, select: { id: true, zoho_contact_id: true } });
    const clientByZoho = new Map(clients.map((c) => [c.zoho_contact_id!, c.id]));
    const list = await listAll(tokens, `invoices?date_start=${dateStart}&sort_column=date&sort_order=A`, "invoices");
    const known = new Map((await prisma.zohoInvoice.findMany({ select: { zoho_invoice_id: true, last_modified_time: true } })).map((i) => [i.zoho_invoice_id, i.last_modified_time?.getTime() ?? 0]));
    for (const item of list) {
      try {
        const modified = tsOf(item.last_modified_time)?.getTime() ?? 0;
        if (known.has(item.invoice_id) && known.get(item.invoice_id) === modified) { unchanged++; continue; }
        const inv = (await zohoGet(tokens, `invoices/${item.invoice_id}`)).invoice;
        await pause(650);
        const cf = (label: string) => (inv.custom_fields ?? []).find((f: any) => String(f.label).toLowerCase() === label)?.value ?? null;
        const data = {
          invoice_number: inv.invoice_number, zoho_customer_id: inv.customer_id, customer_name: inv.customer_name, client_id: clientByZoho.get(inv.customer_id) ?? null,
          date: dateOf(inv.date)!, due_date: dateOf(inv.due_date), status: inv.status, currency: inv.currency_code || "INR", exchange_rate: Number(inv.exchange_rate) || 1,
          sub_total: Number(inv.sub_total) || 0, tax_total: Number(inv.tax_total) || 0, total: Number(inv.total) || 0, balance: Number(inv.balance) || 0,
          reference_number: inv.reference_number || null, service_month: dateOf(cf("service month")), team: cf("team"), zoho_estimate_id: inv.estimate_id || null,
          last_modified_time: tsOf(inv.last_modified_time), synced_at: new Date(),
        };
        const lines = (inv.line_items ?? []).map((l: any) => ({ zoho_line_item_id: l.line_item_id || null, item_name: l.name || l.item_name || "Line", description: l.description || null, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, amount: Number(l.item_total) || 0, hsn_sac: l.hsn_or_sac || null, tax_percentage: l.tax_percentage != null ? Number(l.tax_percentage) : null }));
        const existing = await prisma.zohoInvoice.findUnique({ where: { zoho_invoice_id: inv.invoice_id }, select: { id: true } });
        if (existing) {
          await prisma.$transaction([
            prisma.zohoInvoice.update({ where: { id: existing.id }, data }),
            prisma.zohoInvoiceLine.deleteMany({ where: { invoice_id: existing.id } }),
            prisma.zohoInvoiceLine.createMany({ data: lines.map((l: any) => ({ ...l, invoice_id: existing.id })) }),
          ]);
          updated++;
        } else {
          await prisma.zohoInvoice.create({ data: { ...data, zoho_invoice_id: inv.invoice_id, lines: { create: lines } } });
          created++;
        }
      } catch (e: any) { errors.push(`${item.invoice_number}: ${e.message}`); }
    }
    await prisma.syncLog.create({ data: { sync_type: "zoho_invoices", status: errors.length ? "completed_with_errors" : "success", started_at: started, completed_at: new Date(), records_synced: created + updated, error_message: errors.length ? errors.slice(0, 20).join("; ") : undefined, metadata: { listed: list.length, created, updated, unchanged, date_start: dateStart, triggered_by: user?.email } } });
    return NextResponse.json({ success: true, listed: list.length, created, updated, unchanged, errors: errors.length });
  } catch (error: any) {
    await prisma.syncLog.create({ data: { sync_type: "zoho_invoices", status: "failed", started_at: started, completed_at: new Date(), error_message: error.message } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Zoho Books credit notes, read-only, with the invoices each was applied to. */
async function syncCreditNotes(user: any, dateStart: string) {
  const started = new Date();
  let created = 0, updated = 0, unchanged = 0;
  const errors: string[] = [];
  try {
    const tokens = await getZohoAccessToken();
    if (!tokens) throw new Error("Zoho Books not connected. Please connect in Settings.");
    const clients = await prisma.client.findMany({ where: { zoho_contact_id: { not: null } }, select: { id: true, zoho_contact_id: true } });
    const clientByZoho = new Map(clients.map((c) => [c.zoho_contact_id!, c.id]));
    const list = await listAll(tokens, `creditnotes?date_start=${dateStart}&sort_column=date&sort_order=A`, "creditnotes");
    const known = new Map((await prisma.zohoCreditNote.findMany({ select: { zoho_creditnote_id: true, last_modified_time: true } })).map((c) => [c.zoho_creditnote_id, c.last_modified_time?.getTime() ?? 0]));
    for (const item of list) {
      try {
        const modified = tsOf(item.last_modified_time)?.getTime() ?? 0;
        if (known.has(item.creditnote_id) && known.get(item.creditnote_id) === modified) { unchanged++; continue; }
        const cn = (await zohoGet(tokens, `creditnotes/${item.creditnote_id}`)).creditnote;
        await pause(650);
        const applied: string[] = (cn.invoices_credited ?? cn.invoices ?? []).map((x: any) => x.invoice_id).filter(Boolean);
        const data = {
          creditnote_number: cn.creditnote_number, zoho_customer_id: cn.customer_id, customer_name: cn.customer_name, client_id: clientByZoho.get(cn.customer_id) ?? null,
          date: dateOf(cn.date)!, status: cn.status, currency: cn.currency_code || "INR", exchange_rate: Number(cn.exchange_rate) || 1,
          sub_total: Number(cn.sub_total) || 0, total: Number(cn.total) || 0, balance: Number(cn.balance) || 0, reference_number: cn.reference_number || null,
          applied_invoice_ids: applied, last_modified_time: tsOf(cn.last_modified_time), synced_at: new Date(),
        };
        const existing = await prisma.zohoCreditNote.findUnique({ where: { zoho_creditnote_id: cn.creditnote_id }, select: { id: true } });
        if (existing) { await prisma.zohoCreditNote.update({ where: { id: existing.id }, data }); updated++; }
        else { await prisma.zohoCreditNote.create({ data: { ...data, zoho_creditnote_id: cn.creditnote_id } }); created++; }
      } catch (e: any) { errors.push(`${item.creditnote_number}: ${e.message}`); }
    }
    await prisma.syncLog.create({ data: { sync_type: "zoho_creditnotes", status: errors.length ? "completed_with_errors" : "success", started_at: started, completed_at: new Date(), records_synced: created + updated, error_message: errors.length ? errors.slice(0, 20).join("; ") : undefined, metadata: { listed: list.length, created, updated, unchanged, date_start: dateStart, triggered_by: user?.email } } });
    return NextResponse.json({ success: true, listed: list.length, created, updated, unchanged, errors: errors.length });
  } catch (error: any) {
    await prisma.syncLog.create({ data: { sync_type: "zoho_creditnotes", status: "failed", started_at: started, completed_at: new Date(), error_message: error.message } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
