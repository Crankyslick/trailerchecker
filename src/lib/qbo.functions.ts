import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QboStatus = {
  configured: boolean;
  connected: boolean;
  companyName: string | null;
  realmId: string | null;
  lastSyncedAt: string | null;
  environment: string;
};

export type QboMapping = {
  revenue_code: string;
  qbo_item_name: string | null;
  qbo_income_account: string | null;
};

export const getQboStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QboStatus> => {
    const { requireBillingCompany } = await import("@/lib/qbo/guard.server");
    const companyId = await requireBillingCompany(context.supabase);
    const { getConnection, qboEnvironment } = await import("@/lib/qbo/qbo.server");
    const configured = Boolean(process.env["QBO_CLIENT_ID"] && process.env["QBO_CLIENT_SECRET"]);
    const conn = configured ? await getConnection(companyId) : null;
    return {
      configured,
      connected: Boolean(conn),
      companyName: conn?.company_name ?? null,
      realmId: conn?.realm_id ?? null,
      lastSyncedAt: conn?.last_synced_at ?? null,
      environment: qboEnvironment(),
    };
  });

export const startQboConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const { requireBillingCompany } = await import("@/lib/qbo/guard.server");
    const companyId = await requireBillingCompany(context.supabase);
    const { buildAuthorizeUrl, qboRedirectUri } = await import("@/lib/qbo/qbo.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const state = crypto.randomUUID();
    const { error } = await (
      supabaseAdmin as unknown as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind the schema
        from: (table: string) => any;
      }
    )
      .from("qbo_oauth_states")
      .insert({ state, company_id: companyId, user_id: context.userId });
    if (error) throw error;

    const origin = new URL(getRequestUrl()).origin;
    return { url: buildAuthorizeUrl(state, qboRedirectUri(origin)) };
  });

export const disconnectQbo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { requireBillingCompany } = await import("@/lib/qbo/guard.server");
    const companyId = await requireBillingCompany(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (
      supabaseAdmin as unknown as {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind the schema
        from: (table: string) => any;
      }
    )
      .from("qbo_connections")
      .delete()
      .eq("company_id", companyId);
    if (error) throw error;
    return { ok: true };
  });

export const syncInvoicesToQbo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ invoiceIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireBillingCompany } = await import("@/lib/qbo/guard.server");
    const companyId = await requireBillingCompany(context.supabase);
    const { syncInvoices } = await import("@/lib/qbo/sync.server");
    return syncInvoices(companyId, data.invoiceIds);
  });

export const refreshQboPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireBillingCompany } = await import("@/lib/qbo/guard.server");
    const companyId = await requireBillingCompany(context.supabase);
    const { pullPaymentStatus } = await import("@/lib/qbo/sync.server");
    return pullPaymentStatus(companyId);
  });
