/**
 * Single source of truth for Google Sheet sync settings.
 *
 * Live settings are company-scoped in `trailer_sync_config`. The webhook
 * address itself lives in a locked `sync_secrets` table and is only reachable
 * through the admin-only `admin_sync_config` / `admin_save_sync_config`
 * functions — staff (dispatchers, guards) see status but never the URL.
 *
 * The legacy `sync_config` row (id = 1) is no longer read or written by the
 * app — it stays untouched only as a fallback record until the legacy tables
 * are dropped.
 */
import { supabase } from "@/integrations/supabase/client";

export type SyncConfig = {
  id: string;
  company_id: string;
  spreadsheet_id: string | null;
  sheet_name: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

export type AdminSyncConfig = {
  spreadsheet_id: string | null;
  sheet_name: string | null;
  webhook_url: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

export const SYNC_CONFIG_TABLE = "trailer_sync_config" as const;

/**
 * Current company's sync settings (without the webhook address), or null when
 * none exist yet. Safe for any signed-in staff member.
 */
export async function readSyncConfig(): Promise<SyncConfig | null> {
  const { data, error } = await supabase
    .from(SYNC_CONFIG_TABLE)
    .select(
      "id, company_id, spreadsheet_id, sheet_name, last_synced_at, last_sync_status",
    )
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[readSyncConfig]", error.message);
    return null;
  }
  return (data as SyncConfig | null) ?? null;
}

/**
 * Admin-only: full sync settings including the webhook address. Returns null
 * for non-admins (the underlying function filters by role).
 */
export async function readAdminSyncConfig(): Promise<AdminSyncConfig | null> {
  const { data, error } = await supabase.rpc("admin_sync_config");
  if (error) return null;
  const rows = (data ?? []) as AdminSyncConfig[];
  return rows[0] ?? null;
}

/**
 * Create or update the current company's sync settings. Admin-only on the
 * database side; non-admins receive an error. Fields not included in the
 * patch keep their current value.
 */
export async function saveSyncConfig(patch: {
  spreadsheet_id?: string | null;
  sheet_name?: string | null;
  webhook_url?: string | null;
}) {
  const current = await readAdminSyncConfig();
  const { error } = await supabase.rpc("admin_save_sync_config", {
    p_spreadsheet_id:
      patch.spreadsheet_id !== undefined
        ? patch.spreadsheet_id
        : (current?.spreadsheet_id ?? null),
    p_sheet_name:
      patch.sheet_name !== undefined
        ? patch.sheet_name
        : (current?.sheet_name ?? "Sheet1"),
    p_webhook_url:
      patch.webhook_url !== undefined
        ? patch.webhook_url
        : (current?.webhook_url ?? null),
  });
  if (error) throw new Error(error.message);
}
