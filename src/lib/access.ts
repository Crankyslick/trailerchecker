import { supabase } from "@/integrations/supabase/client";
import type { ProductKey } from "@/lib/products";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Route-level access checks. The database (RLS) remains the authoritative
 * control — these guards just stop someone opening a screen they can never
 * use, instead of letting them hit permission errors mid-action.
 */
export async function loadAccess(): Promise<{ roles: AppRole[]; products: ProductKey[] }> {
  const [rolesRes, productsRes] = await Promise.all([
    supabase.from("user_roles").select("role"),
    supabase.from("tenant_products").select("product, status"),
  ]);

  const roles = ((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role);
  const products = ((productsRes.data ?? []) as { product: ProductKey; status: string }[])
    .filter((p) => p.status !== "cancelled")
    .map((p) => p.product);

  return { roles, products };
}

export type GuardOptions = {
  /** Any one of these roles is enough. Empty means any signed-in user. */
  roles?: AppRole[];
  /** Product subscription the screen belongs to. */
  product?: ProductKey;
};

export function checkAccess(
  access: { roles: AppRole[]; products: ProductKey[] },
  opts: GuardOptions,
): { ok: true } | { ok: false; reason: "product" | "role" } {
  if (opts.product && !access.products.includes(opts.product))
    return { ok: false, reason: "product" };
  if (opts.roles?.length) {
    const privileged = access.roles.some((r) => opts.roles!.includes(r));
    if (!privileged) return { ok: false, reason: "role" };
  }
  return { ok: true };
}
