import { redirect } from "@tanstack/react-router";
import { checkAccess, type AccessResult, type GuardOptions } from "@/lib/access";
import { canSee, homePath, screenFor } from "@/lib/workspace";

type Ctx = { access?: AccessResult };

/**
 * Route-level gate. Redirects away from screens the signed-in user's
 * organization has not subscribed to, that don't fit its operating profile
 * (asset carrier / broker / both), or that their role cannot use. Screens in
 * the workspace table (src/lib/workspace.ts) are judged by that table, the
 * same one that builds the sidebar; `opts` covers any route not listed there.
 * Anyone turned away lands on their own home screen. RLS in the database
 * stays the authoritative control.
 *
 * When the permission lookup itself failed, the screen is left open — the
 * app shows a service-unavailable banner and blocks changes instead of
 * bouncing a valid user out as if their account had been removed.
 */
export function guard(opts: GuardOptions) {
  return ({ context, location }: { context: Ctx; location: { pathname: string } }) => {
    const access = context.access;
    if (!access || access.error) return;
    const screen = screenFor(location.pathname);
    const ok = screen ? canSee(access, screen) : checkAccess(access, opts).ok;
    if (ok) return;
    const home = homePath(access);
    if (home === location.pathname) return;
    throw redirect({ to: home });
  };
}
