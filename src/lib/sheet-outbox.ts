/**
 * Client helpers for the durable Google Sheet sync queue.
 *
 * Every sheet write goes through the queue first, so a failed, rate-limited
 * or unconfigured sheet never loses a dispatch, check-in or bulk update.
 */
import { supabase } from "@/integrations/supabase/client";

export type OutboxKind = "update" | "append";

export type OutboxEntry = {
  id: string;
  kind: OutboxKind;
  match_column: string | null;
  match_value: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "done" | "failed";
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
};

type Cells = Record<string, string | number | null>;

/** Queue a single-row update. Returns the queue row id, or null if queueing failed. */
export async function queueSheetUpdate(matchColumn: string, matchValue: string, updates: Cells) {
  const { data, error } = await supabase
    .from("sheet_sync_outbox")
    .insert({
      kind: "update",
      match_column: matchColumn,
      match_value: matchValue,
      payload: { updates },
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[outbox:update]", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** Queue a new appended row. */
export async function queueSheetAppend(record: Cells) {
  const { data, error } = await supabase
    .from("sheet_sync_outbox")
    .insert({ kind: "append", payload: { record } })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[outbox:append]", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** Queue many single-row updates keyed by one match column. */
export async function queueSheetUpdates(
  matchColumn: string,
  rows: Array<{ matchValue: string; updates: Cells }>,
) {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("sheet_sync_outbox").insert(
    rows.map((r) => ({
      kind: "update" as const,
      match_column: matchColumn,
      match_value: r.matchValue,
      payload: { updates: r.updates },
    })),
  );
  if (error) {
    console.error("[outbox:batch]", error.message);
    return 0;
  }
  return rows.length;
}

/** Counts for the sync health panel. */
export async function fetchOutboxStats() {
  const [pending, failed] = await Promise.all([
    supabase
      .from("sheet_sync_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("sheet_sync_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);
  return { pending: pending.count ?? 0, failed: failed.count ?? 0 };
}

/** Most recent problem entries, newest first. */
export async function fetchOutboxProblems(limit = 10) {
  const { data, error } = await supabase
    .from("sheet_sync_outbox")
    .select(
      "id, kind, match_column, match_value, payload, status, attempts, last_error, next_attempt_at, created_at",
    )
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[outbox:problems]", error.message);
    return [] as OutboxEntry[];
  }
  return (data ?? []) as unknown as OutboxEntry[];
}

/** Put a failed entry back in line for an immediate retry. */
export async function requeueOutboxEntry(id: string) {
  const { error } = await supabase
    .from("sheet_sync_outbox")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Reset every failed entry for another pass. */
export async function requeueAllFailed() {
  const { error } = await supabase
    .from("sheet_sync_outbox")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("status", "failed");
  if (error) throw new Error(error.message);
}

/** Drop an entry that should never be sent. */
export async function discardOutboxEntry(id: string) {
  const { error } = await supabase.from("sheet_sync_outbox").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Short human label for an entry, used in the sync panel. */
export function describeEntry(e: OutboxEntry): string {
  if (e.kind === "append") {
    const rec = (e.payload.record ?? {}) as Cells;
    const trailer = rec["Trailer #"] ?? rec["STR RTRN TRL#"] ?? "";
    return `Add row${trailer ? ` · trailer ${trailer}` : ""}`;
  }
  return `Update ${e.match_column ?? "row"} ${e.match_value ?? ""}`.trim();
}
