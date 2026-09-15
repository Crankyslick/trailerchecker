import { readSyncConfig, markSynced } from "@/lib/sync-config";

let cached: { url: string | null; at: number } = { url: null, at: 0 };

async function getWebhook(): Promise<string | null> {
  if (Date.now() - cached.at < 30_000) return cached.url;
  const cfg = await readSyncConfig();
  cached = { url: cfg?.webhook_url ?? null, at: Date.now() };
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
    void markSynced();
  } catch {
    /* noop */
  }
}
