import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LoadRow } from "@/lib/loads";

export function useLoads() {
  const query = useQuery({
    queryKey: ["loads"],
    queryFn: async (): Promise<LoadRow[]> => {
      const { data, error } = await supabase
        .from("loads")
        .select("*")
        .order("cutoff_date", { ascending: true, nullsFirst: false })
        .order("cutoff_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LoadRow[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`loads-stream-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "loads" }, () => {
      query.refetch();
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (error) throw error;
      return (data ?? []) as YardCheckIn[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("yard_check_ins-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "yard_check_ins" }, () => query.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}

export function useNowTick(intervalMs = 60_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
