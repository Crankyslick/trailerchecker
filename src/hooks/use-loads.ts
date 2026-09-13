import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LoadRow } from "@/lib/loads";

function subscribe(table: string, onChange: () => void) {
  let ch: ReturnType<typeof supabase.channel> | undefined;
  try {
    ch = supabase.channel(`${table}-stream-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table }, onChange).subscribe();
  } catch (e) {
    console.error(`[realtime:${table}] subscribe failed`, e);
  }
  return () => {
    try { if (ch) supabase.removeChannel(ch); } catch { /* noop */ }
  };
}

export function useLoads() {
  const query = useQuery({
    queryKey: ["trailer_loads"],
    queryFn: async (): Promise<LoadRow[]> => {
      const { data, error } = await supabase
        .from("trailer_loads")
        .select("*")
        .order("cutoff_date", { ascending: true, nullsFirst: false })
        .order("cutoff_time", { ascending: true, nullsFirst: false });
      if (error) {
        console.error("[useLoads]", error.message);
        return [];
      }
      return (data ?? []) as LoadRow[];
    },
    initialData: [] as LoadRow[],
  });

  useEffect(() => subscribe("trailer_loads", () => { void query.refetch(); }), []);

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
        .order("arrival_at", { ascending: true });
      if (error) {
        console.error("[useYardCheckIns]", error.message);
        return [];
      }
      return (data ?? []) as YardCheckIn[];
    },
    initialData: [] as YardCheckIn[],
  });

  useEffect(() => subscribe("yard_check_ins", () => { void query.refetch(); }), []);

  return query;
}


export function useNowTick(intervalMs = 60_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
