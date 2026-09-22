import { redirect } from "@tanstack/react-router";
import { checkAccess, type AccessResult, type GuardOptions } from "@/lib/access";

type Ctx = { access?: AccessResult };

/**
 * Route-level gate. Redirects away from screens the signed-in user's
 * organization has not subscribed to, or that their role cannot use.
 * RLS in the database stays the authoritative control.
 *
 * When the permission lookup itself failed, the screen is left open — the
 * app shows a service-unavailable banner and blocks changes instead of
 * bouncing a valid user out as if their account had been removed.
 */
export function guard(opts: GuardOptions) {
  return ({ context }: { context: Ctx }) => {
    const access = context.access;
    if (!access || access.error) return;
    const result = checkAccess(access, opts);
    if (result.ok) return;
    throw redirect({ to: result.reason === "product" ? "/settings" : "/dashboard" });
  };
}
