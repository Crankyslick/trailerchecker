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
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("drivers-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => query.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}
