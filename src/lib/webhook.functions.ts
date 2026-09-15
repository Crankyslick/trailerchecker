/**
 * Server-side Sheet webhook delivery.
 *
 * The webhook address lives in the locked `sync_secrets` table and is never
 * sent to the browser. The client asks this module to deliver an event; the
 * server resolves the caller's company, reads the address with the service
 * client, POSTs the payload, and stamps the sync status.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function readWebhookUrl(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  company: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("sync_secrets")
    .select("webhook_url")
    .eq("company_id", company)
    .maybeSingle();
  return (data as { webhook_url: string | null } | null)?.webhook_url ?? null;
}

async function stampSynced(supabaseAdmin: import("@supabase/supabase-js").SupabaseClient, company: string) {
  await supabaseAdmin
    .from("trailer_sync_config")
    .update({ last_synced_at: new Date().toISOString(), last_sync_status: "ok" })
    .eq("company_id", company);
}

/** Deliver a sync event to the company's configured Sheet webhook. */
export const fireWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event: z.string().min(1),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company, error } = await context.supabase.rpc("current_company_id");
    if (error || !company) return { sent: false };
    const url = await readWebhookUrl(supabaseAdmin, company as string);
    if (!url) return { sent: false };
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: data.event,
          payload: data.payload,
          at: new Date().toISOString(),
        }),
      });
    } catch {
      return { sent: false };
    }
    await stampSynced(supabaseAdmin, company as string);
    return { sent: true };
  });

/** Admin-only: POST a test.ping to the configured webhook. */
export const testSyncWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can test the webhook");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company, error } = await context.supabase.rpc("current_company_id");
    if (error || !company) return { sent: false };
    const url = await readWebhookUrl(supabaseAdmin, company as string);
    if (!url) return { sent: false };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "test.ping",
        payload: { hello: "Me Do Logistics" },
        at: new Date().toISOString(),
      }),
    });
    await stampSynced(supabaseAdmin, company as string);
    return { sent: true };
  });
