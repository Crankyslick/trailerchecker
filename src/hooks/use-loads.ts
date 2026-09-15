import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportDataHealth } from "@/lib/data-health";
import type { LoadRow } from "@/lib/loads";

/** Days of past schedule dates kept on the live board; older loads live in History. */
export const ACTIVE_WINDOW_DAYS = 14;
/** Hard ceiling on rows pulled into any single board query. */
export const BOARD_ROW_LIMIT = 1000;
export const HISTORY_PAGE_SIZE = 50;

export function estToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Realtime subscription with bounded exponential backoff. Channel state is
 * pushed into the data-health store so the UI can warn when live updates stop.
 */
function subscribe(table: string, healthKey: string, onChange: () => void) {
  let channel: ReturnType<typeof supabase.channel> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    reportDataHealth(healthKey, { realtime: attempt === 0 ? "connecting" : "error" });
    try {
      channel = supabase.channel(`${table}-stream-${Math.random().toString(36).slice(2)}`);
      channel
        .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            reportDataHealth(healthKey, { realtime: "connected" });
            onChange();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            reportDataHealth(healthKey, { realtime: "error" });
            retry();
          }
        });
    } catch (e) {
      console.error(`[realtime:${table}] subscribe failed`, e);
      reportDataHealth(healthKey, { realtime: "error" });
      retry();
    }
  };

  const retry = () => {
    if (disposed || timer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** attempt);
    attempt += 1;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
      channel = undefined;
      connect();
    }, delay);
  };

  connect();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    try {
      if (channel) supabase.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}

/** Live dispatch board: recent + future loads only, server-filtered and capped. */
export function useLoads() {
  const since = isoDaysAgo(ACTIVE_WINDOW_DAYS);

  const query = useQuery({
    queryKey: ["trailer_loads", "active", since],
    queryFn: async (): Promise<LoadRow[]> => {
      const { data, error } = await supabase
        .from("trailer_loads")
        .select("*")
        .or(`schedule_date.gte.${since},schedule_date.is.null`)
        .order("schedule_date", { ascending: true, nullsFirst: false })
        .order("cutoff_time", { ascending: true, nullsFirst: false })
        .limit(BOARD_ROW_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as LoadRow[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("loads", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  useEffect(() => subscribe("trailer_loads", "loads", () => void query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export type HistoryFilters = {
  from?: string;
  to?: string;
  schedule?: string;
  trailer?: string;
  page?: number;
};

/** Paginated, server-filtered archive of loads scheduled before today. */
export function useHistoryLoads(filters: HistoryFilters) {
  const today = estToday();
  const page = filters.page ?? 0;
  const from = page * HISTORY_PAGE_SIZE;

  return useQuery({
    queryKey: ["trailer_loads", "history", today, filters],
    queryFn: async (): Promise<{ rows: LoadRow[]; total: number }> => {
      let q = supabase
        .from("trailer_loads")
        .select("*", { count: "exact" })
        .lt("schedule_date", filters.to && filters.to < today ? filters.to : today);
      if (filters.from) q = q.gte("schedule_date", filters.from);
      if (filters.schedule?.trim()) q = q.ilike("schedule_id", `%${filters.schedule.trim()}%`);
      if (filters.trailer?.trim()) {
        const t = filters.trailer.trim();
        q = q.or(`outbound_trailer.ilike.%${t}%,return_trailer.ilike.%${t}%`);
      }
      const { data, error, count } = await q
        .order("schedule_date", { ascending: false, nullsFirst: false })
        .range(from, from + HISTORY_PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as LoadRow[], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
    retry: 2,
  });
}

/** Loads whose schedule date falls in an explicit range — used by reporting. */
export function useLoadsRange(fromDate: string, toDate: string) {
  const query = useQuery({
    queryKey: ["trailer_loads", "range", fromDate, toDate],
    queryFn: async (): Promise<LoadRow[]> => {
      const { data, error } = await supabase
        .from("trailer_loads")
        .select("*")
        .or(
          `and(schedule_date.gte.${fromDate},schedule_date.lte.${toDate}),completed_at.not.is.null`,
        )
        .order("schedule_date", { ascending: false, nullsFirst: false })
        .limit(BOARD_ROW_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as LoadRow[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("reports", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  return query;
}

export type YardCheckIn = {
  id: string;
  trailer_number: string;
  inbound_load_id: string | null;
  arrival_at: string;
  checked_out_at: string | null;
  note: string | null;
  created_at: string;
};

export function useYardCheckIns() {
  const query = useQuery({
    queryKey: ["yard_check_ins"],
    queryFn: async (): Promise<YardCheckIn[]> => {
      const { data, error } = await supabase
        .from("yard_check_ins")
        .select("*")
        .is("checked_out_at", null)
        .order("arrival_at", { ascending: true })
        .limit(BOARD_ROW_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as YardCheckIn[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("yard", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  useEffect(() => subscribe("yard_check_ins", "yard", () => void query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export function useNowTick(intervalMs = 60_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
