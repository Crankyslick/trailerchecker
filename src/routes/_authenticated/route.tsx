import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { loadAccess } from "@/lib/access";
import { reportDataHealth } from "@/lib/data-health";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw redirect({ to: "/auth" });
    const access = await loadAccess();
    // A failed permission lookup is an outage, not a demotion — surface it.
    reportDataHealth("permissions", { error: access.error, updatedAt: Date.now() });
    return { user: data.user, access };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
