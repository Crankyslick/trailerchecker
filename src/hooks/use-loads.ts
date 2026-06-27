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
        .order("schedule_date", { ascending: false })
        .order("delivery_sequence", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("loads-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "loads" }, () => {
        query.refetch();
      })
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
