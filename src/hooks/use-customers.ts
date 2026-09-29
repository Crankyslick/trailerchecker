import { useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Customer = {
  id: string;
  name: string;
  contact_info: string | null;
  notes: string | null;
  created_at: string;
};

export const CUSTOMERS_KEY = ["trailer_clients", "full"] as const;

/** Full customer records for the Customers page. */
export function useCustomers() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase
        .from("trailer_clients")
        .select("id, name, contact_info, notes, created_at")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Customer[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`trailer_clients-stream-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trailer_clients" }, () => {
        void qc.invalidateQueries({ queryKey: ["trailer_clients"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export async function createCustomer(input: {
  name: string;
  contactInfo: string | null;
  notes: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Customer name is required");
  const { data, error } = await supabase
    .from("trailer_clients")
    .insert({ name, contact_info: input.contactInfo, notes: input.notes })
    .select("id, name, contact_info, notes, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

export async function updateCustomer(
  id: string,
  input: { name: string; contactInfo: string | null; notes: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Customer name is required");
  const { error } = await supabase
    .from("trailer_clients")
    .update({ name, contact_info: input.contactInfo, notes: input.notes })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("trailer_clients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
