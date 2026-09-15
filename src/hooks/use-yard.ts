import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { YardCheckIn } from "@/hooks/use-loads";

/** Refresh everything that can show a yard trailer. */
function useYardInvalidate() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["yard_check_ins"] }),
      qc.invalidateQueries({ queryKey: ["trailer_loads"] }),
      qc.invalidateQueries({ queryKey: ["trailer_events"] }),
    ]);
  };
}

export type CheckInArgs = {
  trailer: string;
  /** Resolved trailer_loads.id — never free text. */
  loadId?: string | null;
  note?: string | null;
  /** Stable per user action, so retries and double clicks collapse into one row. */
  idempotencyKey?: string;
};

/**
 * Gate check-in through the transactional database command. It resolves the
 * company, validates the load reference and is idempotent: a repeat submission
 * or a trailer already sitting on the yard returns the existing record instead
 * of creating a second one.
 */
export function useYardCheckIn() {
  const invalidate = useYardInvalidate();
  return useMutation({
    mutationFn: async (args: CheckInArgs): Promise<YardCheckIn> => {
      const { data, error } = await supabase.rpc("yard_check_in", {
        p_trailer: args.trailer,
        p_load_id: args.loadId ?? undefined,
        p_note: args.note ?? undefined,
        p_idempotency_key: args.idempotencyKey ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as unknown as YardCheckIn;
    },
    onSuccess: () => { void invalidate(); },
  });
}

/** Gate check-out. Verifies exactly one row changed inside the database. */
export function useYardCheckOut() {
  const invalidate = useYardInvalidate();
  return useMutation({
    mutationFn: async (id: string): Promise<YardCheckIn> => {
      const { data, error } = await supabase.rpc("yard_check_out", { p_id: id });
      if (error) throw new Error(error.message);
      return data as unknown as YardCheckIn;
    },
    onSuccess: () => { void invalidate(); },
  });
}

/**
 * Move a return trailer off the yard. Requires exactly one updated row, so a
 * stale or already-returned load surfaces an error instead of silently
 * appearing to work. The database trigger writes the audit event and clears
 * the yard timer.
 */
export function useReturnToDC() {
  const invalidate = useYardInvalidate();
  return useMutation({
    mutationFn: async (loadId: string) => {
      const { data, error } = await supabase
        .from("trailer_loads")
        .update({ return_trailer_location: "Returned To DC" })
        .eq("id", loadId)
        .eq("return_trailer_location", "Yard")
        .select("id, return_trailer");
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length !== 1) {
        throw new Error("That trailer is no longer on the yard — the board has been refreshed.");
      }
      return rows[0];
    },
    onSettled: () => { void invalidate(); },
  });
}

/** Stable idempotency key for one user action. */
export function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
