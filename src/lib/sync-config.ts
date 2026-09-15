/**
 * Single source of truth for Google Sheet sync settings.
 *
 * Live settings are company-scoped in `trailer_sync_config`. The legacy
 * `sync_config` row (id = 1) is no longer read or written by the app — it stays
 * untouched only as a fallback record until the legacy tables are dropped.
 */
import { supabase } from "@/integrations/supabase/client";

export type SyncConfig = {
  id: string;
  company_id: string;
  spreadsheet_id: string | null;
  sheet_name: string | null;
  webhook_url: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

export const SYNC_CONFIG_TABLE = "trailer_sync_config" as const;

/** Current company's sync settings, or null when none exist yet. */
export async function readSyncConfig(): Promise<SyncConfig | null> {
  const { data, error } = await supabase
    .from(SYNC_CONFIG_TABLE)
    .select("id, company_id, spreadsheet_id, sheet_name, webhook_url, last_synced_at, last_sync_status")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[readSyncConfig]", error.message);
    return null;
  }
  return (data as SyncConfig | null) ?? null;
}

/** Create or update the current company's sync settings. */
export async function saveSyncConfig(patch: Partial<Omit<SyncConfig, "id" | "company_id">>) {
  const existing = await readSyncConfig();
  if (existing) {
    const { error } = await supabase.from(SYNC_CONFIG_TABLE).update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from(SYNC_CONFIG_TABLE).insert(patch);
  if (error) throw new Error(error.message);
}

export async function markSynced(status = "ok") {
  const now = new Date().toISOString();
  await saveSyncConfig({ last_synced_at: now, last_sync_status: status });
}
