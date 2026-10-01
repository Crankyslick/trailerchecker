import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { loadAccess } from "@/lib/access";
import { reportDataHealth } from "@/lib/data-health";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw redirect({ to: "/auth" });
    const access = await loadAccess();
    // A failed permission lookup is an outage, not a demotion — surface it.
    reportDataHealth("permissions", { error: access.error, updatedAt: Date.now() });

    // A brand-new organization must finish setup before it can use the app.
    if (location.pathname !== "/onboarding") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", data.user.id)
        .maybeSingle();
      const tenantId = (profile as { tenant_id: string | null } | null)?.tenant_id ?? null;
      if (tenantId) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("onboarded")
          .eq("id", tenantId)
          .maybeSingle();
        if (tenant && (tenant as { onboarded: boolean }).onboarded === false) {
          throw redirect({ to: "/onboarding" });
        }
      }
    }

    return { user: data.user, access };
  },

  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
