import { supabase } from "@/integrations/supabase/client";

/**
 * Fires the server-side alert endpoint and forgets about it. Callers should
 * not await this in a way that blocks their own success handling — it's
 * `void triggerAlert(...)`, not `await triggerAlert(...)`, at every call
 * site, so a slow or failed alert can never delay or fail the operation it's
 * attached to.
 */
export async function triggerAlert(
  type: "dispatch" | "exception" | "pod",
  loadId: string,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return; // no session — nothing to authenticate the alert call with, just skip

    await fetch("/api/alerts/notify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, loadId }),
    });
  } catch (e) {
    // Never let an alert failure surface to the caller.
    console.error(`[triggerAlert:${type}]`, e);
  }
}
