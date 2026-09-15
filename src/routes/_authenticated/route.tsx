import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { loadAccess } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) throw redirect({ to: "/auth" });
    const access = await loadAccess();
    return { user: data.user, access };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
