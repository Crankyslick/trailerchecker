import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { processSheetOutbox } from "@/lib/sheets.functions";
import { fetchOutboxProblems, fetchOutboxStats } from "@/lib/sheet-outbox";

/** Queue counts + the pending/failed list for the sync health panel. */
export function useSheetSyncStatus() {
  const stats = useQuery({
    queryKey: ["sheet-outbox", "stats"],
    queryFn: fetchOutboxStats,
    initialData: { pending: 0, failed: 0 },
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

/** Runs a drain pass over the queue. */
export function useDrainSheetOutbox() {
  const drain = useServerFn(processSheetOutbox);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => drain({ data: { limit: 25 } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ["sheet-outbox"] }); },
  });
}

/**
 * Background drain. Mounted once in the app shell so queued sheet writes keep
 * flowing while anyone has the app open, without blocking the UI.
 */
export function useSheetOutboxWorker(intervalMs = 60_000) {
  const { mutateAsync } = useDrainSheetOutbox();
  useEffect(() => {
    let stopped = false;
    const run = () => { if (!stopped) void mutateAsync().catch(() => undefined); };
    const t = setTimeout(run, 3_000);
    const i = setInterval(run, intervalMs);
    return () => { stopped = true; clearTimeout(t); clearInterval(i); };
  }, [mutateAsync, intervalMs]);
}
