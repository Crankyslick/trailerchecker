import { useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportDataHealth } from "@/lib/data-health";

export type Driver = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function useDrivers() {
  const query = useQuery({
    queryKey: ["drivers"],
    queryFn: async (): Promise<Driver[]> => {
      const { data, error } = await supabase.from("drivers").select("*").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Driver[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("drivers", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | undefined;
    try {
      ch = supabase.channel(`drivers-stream-${Math.random().toString(36).slice(2)}`);
      ch.on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => {
        void query.refetch();
      }).subscribe();
    } catch (e) {
      console.error("[useDrivers] realtime subscribe failed", e);
    }
    return () => {
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}
