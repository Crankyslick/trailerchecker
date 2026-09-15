import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CompanySite = {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  is_default: boolean;
  active: boolean;
};

/**
 * Yards / destinations configured for the signed-in user's company.
 * Nothing in the app should hard-code a yard name — read it from here.
 */
export function useCompanySites() {
  const query = useQuery({
    queryKey: ["company_sites"],
    queryFn: async (): Promise<CompanySite[]> => {
      const { data, error } = await supabase
        .from("company_sites")
        .select("id, name, code, kind, is_default, active")
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (error) {
        console.error("[useCompanySites]", error.message);
        return [];
      }
      return (data ?? []) as CompanySite[];
    },
    initialData: [] as CompanySite[],
  });

  const sites = query.data ?? [];
  const defaultSite = sites.find((s) => s.is_default) ?? sites[0] ?? null;

  return { sites, defaultSite, names: sites.map((s) => s.name), query };
}
