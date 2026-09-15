import { redirect } from "@tanstack/react-router";
import { checkAccess, type AppRole, type GuardOptions } from "@/lib/access";
import type { ProductKey } from "@/lib/products";

type Ctx = { access?: { roles: AppRole[]; products: ProductKey[] } };

/**
 * Route-level gate. Redirects away from screens the signed-in user's
 * organization has not subscribed to, or that their role cannot use.
 * RLS in the database stays the authoritative control.
 */
export function guard(opts: GuardOptions) {
  return ({ context }: { context: Ctx }) => {
    const access = context.access;
    if (!access) return;
    const result = checkAccess(access, opts);
    if (result.ok) return;
    throw redirect({
      to: result.reason === "product" ? "/settings" : "/dashboard",
      search: result.reason === "product" ? { denied: opts.product } : undefined,
    });
  };
}
