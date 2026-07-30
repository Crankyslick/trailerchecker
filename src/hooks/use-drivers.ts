import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      if (error) {
        console.error("[useDrivers]", error.message);
        return [];
      }
      return (data ?? []) as Driver[];
    },
    initialData: [] as Driver[],
  });

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
      try { if (ch) supabase.removeChannel(ch); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}

