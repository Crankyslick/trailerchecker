import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { processSheetOutbox } from "@/lib/sheets.functions";
import { fetchOutboxProblems, fetchOutboxStats } from "@/lib/sheet-outbox";

/** Queue counts + the pending/failed list for the sync health panel. */
export function useSheetSyncStatus() {
  const stats = useQuery({
    queryKey: ["sheet-outbox", "stats"],
    queryFn: fetchOutboxStats,
    initialData: { pending: 0, failed: 0, oldestPendingAt: null },
    refetchInterval: 30_000,
  });
  const problems = useQuery({
    queryKey: ["sheet-outbox", "problems"],
    queryFn: () => fetchOutboxProblems(10),
    initialData: [],
    refetchInterval: 60_000,
  });
  return { stats, problems };
}

/**
 * Runs a drain pass over the queue. Entries are claimed with a lease on the
 * server, so this can run alongside other tabs and the hourly scheduled job
 * without ever sending the same update twice.
 */
export function useDrainSheetOutbox() {
  const drain = useServerFn(processSheetOutbox);
  const qc = useQueryClient();
  // Stable per-tab worker id, so claims are attributable.
  const worker = useMemo(() => Math.random().toString(36).slice(2, 10), []);
  return useMutation({
    mutationFn: async () => drain({ data: { limit: 25, worker } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["sheet-outbox"] });
    },
  });
}

/**
 * Low-latency helper only. Delivery does not depend on it: an hourly
 * server-side job drains the same queue when nobody has the app open.
 */
export function useSheetOutboxWorker(intervalMs = 60_000, enabled = true) {
  const { mutateAsync } = useDrainSheetOutbox();
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const run = () => {
      if (!stopped) void mutateAsync().catch(() => undefined);
    };
    const t = setTimeout(run, 3_000);
    const i = setInterval(run, intervalMs);
    return () => {
      stopped = true;
      clearTimeout(t);
      clearInterval(i);
    };
  }, [mutateAsync, intervalMs]);
}
