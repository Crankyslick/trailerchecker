import { supabase } from "@/integrations/supabase/client";

let cached: { url: string | null; at: number } = { url: null, at: 0 };

async function getWebhook(): Promise<string | null> {
  if (Date.now() - cached.at < 30_000) return cached.url;
  const { data } = await supabase.from("sync_config").select("webhook_url").eq("id", 1).maybeSingle();
  cached = { url: (data as { webhook_url: string | null } | null)?.webhook_url ?? null, at: Date.now() };
  return cached.url;
}

export function invalidateWebhookCache() {
  cached = { url: null, at: 0 };
}

// Fire-and-forget POST to the configured Google Sheet webhook (Apps Script / Zapier / Make).
// Uses no-cors so opaque endpoints (Apps Script Web App) don't block.
export async function fireWebhook(event: string, payload: Record<string, unknown>) {
  try {
    const url = await getWebhook();
    if (!url) return;
    const body = JSON.stringify({ event, payload, at: new Date().toISOString() });
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
    const now = new Date().toISOString();
    supabase.from("sync_config").update({ last_synced_at: now, updated_at: now }).eq("id", 1).then(() => {});
  } catch { /* noop */ }
}
