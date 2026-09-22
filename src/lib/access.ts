import { supabase } from "@/integrations/supabase/client";
import type { ProductKey } from "@/lib/products";
import { isProductEntitled } from "@/lib/products";
import type { Database } from "@/integrations/supabase/types";

/** The one role list — generated straight from the database enum. */
export type AppRole = Database["public"]["Enums"]["app_role"];

/* ---- capability helpers (owner semantics live here, once) ---- */

export const isOwner = (roles: AppRole[]) => roles.includes("owner");
/** Owners are administrators too — the database treats them the same way. */
export const canAdminister = (roles: AppRole[]) => isOwner(roles) || roles.includes("admin");
export const canDispatch = (roles: AppRole[]) => canAdminister(roles) || roles.includes("dispatcher");
export const canCheckInTrailers = (roles: AppRole[]) =>
  canDispatch(roles) || roles.includes("guard");
export const canManageBilling = (roles: AppRole[]) =>
  canAdminister(roles) || roles.includes("billing");

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  guard: "Gate guard",
  billing: "Billing",
  driver: "Driver",
};

/** Highest-ranking role, for display. */
export function roleLabel(roles: AppRole[]): string {
  const order: AppRole[] = ["owner", "admin", "dispatcher", "billing", "guard", "driver"];
  const best = order.find((r) => roles.includes(r));
  return best ? ROLE_LABELS[best] : "No role";
}

export type Access = { roles: AppRole[]; products: ProductKey[] };
/** `error` is set when the permission lookup itself failed (backend outage). */
export type AccessResult = Access & { error: string | null };

/**
 * Route-level access checks. The database (RLS) remains the authoritative
 * control — these guards just stop someone opening a screen they can never
 * use, instead of letting them hit permission errors mid-action.
 *
 * A failed lookup is reported as an error rather than silently becoming
 * "no permissions", so a backend outage never looks like a closed account.
 */
export async function loadAccess(): Promise<AccessResult> {
  const [rolesRes, productsRes] = await Promise.all([
    supabase.from("user_roles").select("role"),
    supabase.from("tenant_products").select("product, status, trial_ends_at"),
  ]);

  const error = rolesRes.error?.message ?? productsRes.error?.message ?? null;

  const roles = ((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role);
  const products = (
    (productsRes.data ?? []) as {
      product: ProductKey;
      status: string;
      trial_ends_at: string | null;
    }[]
  )
    .filter(isProductEntitled)
    .map((p) => p.product);

  return { roles, products, error };
}

export type GuardOptions = {
  /** Any one of these roles is enough. Empty means any signed-in user. */
  roles?: AppRole[];
  /** Product subscription the screen belongs to. */
  product?: ProductKey;
};

export function checkAccess(
  access: Access,
  opts: GuardOptions,
): { ok: true } | { ok: false; reason: "product" | "role" } {
  if (opts.product && !access.products.includes(opts.product))
    return { ok: false, reason: "product" };
  if (opts.roles?.length) {
    // Owners satisfy any admin-level requirement.
    const required = opts.roles.includes("admin") ? [...opts.roles, "owner" as AppRole] : opts.roles;
    const privileged = access.roles.some((r) => required.includes(r));
    if (!privileged) return { ok: false, reason: "role" };
  }
  return { ok: true };
}
