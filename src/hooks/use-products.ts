import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportDataHealth } from "@/lib/data-health";
import { useCurrentUser } from "@/hooks/use-auth";
import type { ProductKey } from "@/lib/products";
import { isProductEntitled } from "@/lib/products";

export type TenantProduct = {
  id: string;
  tenant_id: string;
  product: ProductKey;
  status: string;
  trial_ends_at: string | null;
};

/** Which products the signed-in user's organization has subscribed to. */
export function useTenantProducts() {
  const { tenant, loading: userLoading } = useCurrentUser();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tenant_products", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<TenantProduct[]> => {
      const { data, error } = await supabase
        .from("tenant_products")
        .select("id, tenant_id, product, status, trial_ends_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as TenantProduct[];
    },
    retry: 2,
  });

  useEffect(() => {
    reportDataHealth("products", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  const active = (query.data ?? []).filter(isProductEntitled);
  const keys = active.map((p) => p.product);

  async function setProduct(product: ProductKey, enabled: boolean) {
    if (!tenantId) throw new Error("No organization linked to your account.");
    const existing = (query.data ?? []).find((p) => p.product === product);
    if (existing) {
      const { error } = await supabase
        .from("tenant_products")
        .update({ status: enabled ? "active" : "cancelled" })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("tenant_products")
        .insert({ tenant_id: tenantId, product, status: enabled ? "active" : "cancelled" });
      if (error) throw new Error(error.message);
    }
    await qc.invalidateQueries({ queryKey: ["tenant_products", tenantId] });
  }

  return {
    products: active,
    keys,
    /** Loading until we know; avoids hiding nav on first paint. */
    loading: userLoading || (Boolean(tenantId) && query.isLoading),
    has: (key: ProductKey) => keys.includes(key),
    setProduct,
    refetch: query.refetch,
  };
}
