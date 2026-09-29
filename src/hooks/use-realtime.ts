import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// `drivers.user_id` was added by a migration this repo's generated
// src/integrations/supabase/types.ts hasn't been regenerated against yet
// (same situation documented in use-orders.ts). Scoped escape hatch, not a
// blanket `as any` on the whole file — swap for the real Database type once
// `supabase gen types typescript` is re-run.
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

// ============================================================================
// useRealtimeSubscription — reusable primitive.
//
// Query invalidation only, never manual cache writes, per the brief. `enabled`
// exists so callers can always call this hook unconditionally (rules of
// hooks) and just gate whether it actually subscribes — e.g. a dispatcher
// hook and a driver hook can both be mounted at the app shell and each
// no-ops until the signed-in user's role matches.
// ============================================================================
type PgChangePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export function useRealtimeSubscription({
  table,
  event = "*",
  filter,
  queryKeys,
  onPayload,
  enabled = true,
}: {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** postgres_changes filter, e.g. "driver_id=eq.<uuid>". Simple column equality only. */
  filter?: string;
  queryKeys: readonly (readonly unknown[])[];
  onPayload?: (payload: PgChangePayload) => void;
  enabled?: boolean;
}) {
  // Keep the latest callback without re-subscribing every render.
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`${table}-${filter ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: PgChangePayload) => {
          for (const key of queryKeys) {
            void qc.invalidateQueries({ queryKey: key as unknown[] });
          }
          onPayloadRef.current?.(payload);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, filter, enabled, qc]);
}

// ============================================================================
// Dispatcher
//
// Subscribes to trailer_loads directly (assignment, dispatch, status, carrier
// changes) rather than relying on trailer_events alone: plan_leg's reassign
// path updates trailer_loads without writing an event row, so an
// events-only subscription would miss plain driver/equipment reassignments —
// checked against the actual function body, not assumed. trailer_events is
// still subscribed separately because that's where the human-readable
// event_type/note the toasts need actually live.
//
// No organization_id/company_id filter: the column doesn't exist on
// trailer_events (its RLS is join-based through trailer_loads), and RLS
// already scopes every row to the caller's company for both tables — Realtime
// evaluates postgres_changes through the subscriber's RLS, so this isn't
// optional plumbing, it's the actual scoping mechanism.
//
// driver_activity_log is intentionally not subscribed: that table does not
// exist in this schema.
// ============================================================================
export function useDispatcherRealtime(enabled = true) {
  useRealtimeSubscription({
    table: "trailer_loads",
    queryKeys: [["trailer_loads"], ["planning_loads"], ["loads"]],
    enabled,
  });

  useRealtimeSubscription({
    table: "trailer_events",
    event: "INSERT",
    queryKeys: [["trailer_events"], ["loads"], ["notifications"]],
    enabled,
    onPayload: (payload) => {
      const row = payload.new as {
        event_type?: string;
        to_status?: string;
        note?: string | null;
        trailer_number?: string | null;
      };
      if (row.event_type === "Exception flagged") {
        toast.warning("Driver reported issue", { description: row.note ?? undefined });
      } else if (row.event_type === "Status changed" && row.to_status === "Delivered") {
        toast.success(`Load delivered${row.trailer_number ? ` — ${row.trailer_number}` : ""}`);
      } else if (row.event_type === "Status changed") {
        toast(`Status changed: ${row.note ?? ""}`);
      }
      // Other event types (Dispatched, Geofence entered, Exception resolved, …)
      // still drive the query invalidation above; they just don't get a toast,
      // to avoid over-notifying on routine dispatch actions.
    },
  });
}

// ============================================================================
// Driver
//
// trailer_loads.driver_id is drivers.id, not the signed-in user's auth id, so
// the caller's own driver row has to be resolved before it can be used as a
// realtime filter. This is a small, cheap, RLS-scoped query (a driver can
// only ever see their own drivers row), not a schema change.
//
// trailer_events has no driver_id or load-ownership column to filter on
// client-side (only load_id, and postgres_changes filters don't support
// joins) — RLS is what scopes it to the driver's own loads. That RLS policy
// does not exist yet for the driver role; see the migration note below.
// ============================================================================
function useOwnDriverId(enabled: boolean) {
  const { user } = useSession();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["own-driver-id", userId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb
        .from("drivers")
        .select("id")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    },
    enabled: enabled && !!userId,
    staleTime: Infinity, // a user's own driver row doesn't change during a session
  });
}

/** Minimal query so `['driver-loads']` invalidation actually refetches something. */
export function useDriverLoads(driverId: string | null) {
  return useQuery({
    queryKey: ["driver-loads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trailer_loads")
        .select("*")
        .eq("driver_id", driverId as string)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!driverId,
  });
}

export function useDriverRealtime(enabled = true) {
  const { data: driverId } = useOwnDriverId(enabled);
  const ready = enabled && !!driverId;

  useRealtimeSubscription({
    table: "trailer_loads",
    filter: driverId ? `driver_id=eq.${driverId}` : undefined,
    queryKeys: [["driver-loads"], ["loads", "mine"]],
    enabled: ready,
  });

  useRealtimeSubscription({
    table: "trailer_events",
    event: "INSERT",
    queryKeys: [["driver-loads"], ["loads", "mine"]],
    enabled: ready,
  });

  return { driverId };
}
