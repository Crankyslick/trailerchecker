// Server-only invoice sync engine: TMS -> QuickBooks Online.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ensureQboCustomer,
  ensureQboItem,
  getConnection,
  qboApi,
  queryQbo,
  type QboConnection,
} from "./qbo.server";
import { codeForDescription, itemNameFor } from "./revenue-items";

// The generated Database types do not know the qbo_* columns yet.
const admin = supabaseAdmin as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind the schema
  from: (table: string) => any;
};

type InvoiceRow = {
  id: string;
  company_id: string;
  invoice_number: string;
  total_amount: number;
  issued_at: string | null;
  due_at: string | null;
  status: string;
  qbo_invoice_id: string | null;
  trailer_clients: {
    id: string;
    name: string;
    contact_info: string | null;
    qbo_customer_id: string | null;
  } | null;
};

type LineRow = { invoice_id: string; description: string; amount: number };

const SELECT =
  "id, company_id, invoice_number, total_amount, issued_at, due_at, status, qbo_invoice_id, " +
  "trailer_clients ( id, name, contact_info, qbo_customer_id )";

export type SyncResult = { invoiceId: string; ok: boolean; error?: string; qboInvoiceId?: string };

function emailFrom(contactInfo: string | null): string | null {
  if (!contactInfo) return null;
  const m = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(contactInfo);
  return m ? m[0] : null;
}

async function mappingsFor(companyId: string) {
  const { data } = await admin
    .from("qbo_account_mappings")
    .select("revenue_code, qbo_item_name, qbo_income_account")
    .eq("company_id", companyId);
  const map = new Map<string, { item: string | null; account: string | null }>();
  for (const r of (data ?? []) as Array<Record<string, string | null>>) {
    map.set(r["revenue_code"] as string, {
      item: r["qbo_item_name"] ?? null,
      account: r["qbo_income_account"] ?? null,
    });
  }
  return map;
}

async function syncOne(conn: QboConnection, inv: InvoiceRow, lines: LineRow[]): Promise<SyncResult> {
  const client = inv.trailer_clients;
  if (!client) {
    return {
      invoiceId: inv.id,
      ok: false,
      error: "Invoice has no customer — assign one before syncing.",
    };
  }

  const customerRef = await ensureQboCustomer(conn, {
    id: client.id,
    name: client.name,
    email: emailFrom(client.contact_info),
    qbo_customer_id: client.qbo_customer_id,
  });
  const mappings = await mappingsFor(inv.company_id);

  const source: LineRow[] =
    lines.length > 0
      ? lines
      : [{ invoice_id: inv.id, description: "Freight services", amount: inv.total_amount }];

  const qboLines = [];
  for (const l of source) {
    const code = codeForDescription(l.description);
    const m = mappings.get(code);
    const itemName = m?.item || itemNameFor(code);
    const itemId = await ensureQboItem(conn, itemName, m?.account ?? null);
    const amount = Number(Number(l.amount).toFixed(2));
    qboLines.push({
      DetailType: "SalesItemLineDetail",
      Amount: amount,
      Description: l.description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId, name: itemName },
        Qty: 1,
        UnitPrice: amount,
      },
    });
  }

  const body: Record<string, unknown> = {
    CustomerRef: { value: customerRef },
    DocNumber: inv.invoice_number.slice(0, 21),
    Line: qboLines,
    ...(inv.issued_at ? { TxnDate: inv.issued_at.slice(0, 10) } : {}),
    ...(inv.due_at ? { DueDate: inv.due_at.slice(0, 10) } : {}),
  };

  if (inv.qbo_invoice_id) {
    const existing = await qboApi<{ Invoice?: { Id: string; SyncToken: string } }>(
      conn,
      `/invoice/${inv.qbo_invoice_id}?minorversion=70`,
    );
    if (existing.Invoice) {
      body["Id"] = existing.Invoice.Id;
      body["SyncToken"] = existing.Invoice.SyncToken;
      body["sparse"] = false;
    }
  }

  const created = await qboApi<{ Invoice?: { Id: string } }>(conn, "/invoice?minorversion=70", {
    method: "POST",
    body,
  });
  const qboInvoiceId = created.Invoice?.Id;
  if (!qboInvoiceId) throw new Error("QuickBooks did not return an invoice id.");
  return { invoiceId: inv.id, ok: true, qboInvoiceId };
}

export async function syncInvoices(companyId: string, invoiceIds: string[]): Promise<SyncResult[]> {
  const conn = await getConnection(companyId);
  if (!conn) throw new Error("QuickBooks is not connected for this company.");

  const { data, error } = await admin
    .from("customer_invoices")
    .select(SELECT)
    .in("id", invoiceIds)
    .eq("company_id", companyId);
  if (error) throw error;
  const invoices = (data ?? []) as InvoiceRow[];
  if (invoices.length === 0) return [];

  const { data: lineData } = await admin
    .from("customer_invoice_lines")
    .select("invoice_id, description, amount")
    .in(
      "invoice_id",
      invoices.map((i) => i.id),
    );
  const linesByInvoice = new Map<string, LineRow[]>();
  for (const l of (lineData ?? []) as LineRow[]) {
    const list = linesByInvoice.get(l.invoice_id) ?? [];
    list.push(l);
    linesByInvoice.set(l.invoice_id, list);
  }

  await admin
    .from("customer_invoices")
    .update({ qbo_sync_status: "syncing", qbo_sync_error: null })
    .in(
      "id",
      invoices.map((i) => i.id),
    );

  const results: SyncResult[] = [];
  for (const inv of invoices) {
    try {
      const r = await syncOne(conn, inv, linesByInvoice.get(inv.id) ?? []);
      if (r.ok) {
        await admin
          .from("customer_invoices")
          .update({
            qbo_invoice_id: r.qboInvoiceId,
            qbo_sync_status: "synced",
            qbo_sync_error: null,
            qbo_synced_at: new Date().toISOString(),
            ...(inv.status === "DRAFT" ? { status: "SENT" } : {}),
          })
          .eq("id", inv.id);
      } else {
        await admin
          .from("customer_invoices")
          .update({ qbo_sync_status: "error", qbo_sync_error: r.error ?? "Unknown error" })
          .eq("id", inv.id);
      }
      results.push(r);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown QuickBooks error";
      await admin
        .from("customer_invoices")
        .update({ qbo_sync_status: "error", qbo_sync_error: message.slice(0, 500) })
        .eq("id", inv.id);
      results.push({ invoiceId: inv.id, ok: false, error: message });
    }
  }

  await admin
    .from("qbo_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", conn.id);

  return results;
}

/** QuickBooks -> TMS: mark local invoices paid when QBO shows a zero balance. */
export async function pullPaymentStatus(companyId: string) {
  const conn = await getConnection(companyId);
  if (!conn) throw new Error("QuickBooks is not connected for this company.");

  const { data } = await admin
    .from("customer_invoices")
    .select("id, qbo_invoice_id, status")
    .eq("company_id", companyId)
    .not("qbo_invoice_id", "is", null)
    .neq("status", "PAID");

  const rows = (data ?? []) as Array<{ id: string; qbo_invoice_id: string; status: string }>;
  if (rows.length === 0) return { checked: 0, paid: 0 };

  const ids = rows.map((r) => `'${r.qbo_invoice_id.replace(/'/g, "''")}'`).join(",");
  const res = await queryQbo<{ QueryResponse?: { Invoice?: Array<{ Id: string; Balance: number }> } }>(
    conn,
    `select Id, Balance from Invoice where Id in (${ids})`,
  );
  const balances = new Map((res.QueryResponse?.Invoice ?? []).map((i) => [i.Id, i.Balance]));

  let paid = 0;
  for (const r of rows) {
    if (balances.get(r.qbo_invoice_id) === 0) {
      await admin
        .from("customer_invoices")
        .update({ status: "PAID", paid_at: new Date().toISOString() })
        .eq("id", r.id);
      paid += 1;
    }
  }
  await admin
    .from("qbo_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", conn.id);
  return { checked: rows.length, paid };
}
