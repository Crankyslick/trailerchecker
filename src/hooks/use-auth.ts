import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "dispatcher" | "guard";

export type Profile = {
  id: string;
  tenant_id: string | null;
  email: string | null;
  full_name: string | null;
};

export type Tenant = {
  id: string;
  name: string;
  plan: string;
  yard_count: number;
  onboarded: boolean;
};

/** Live Supabase session (null while signed out). */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data?.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export type Organization = Tenant;

/** Profile + tenant + roles for the signed-in user. */
export function useCurrentUser() {
  const { session, loading } = useSession();
  const userId = session?.user?.id ?? null;

  const query = useQuery({
    queryKey: ["me", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, tenant_id, email, full_name")
          .eq("id", userId!)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);

      let tenant: Tenant | null = null;
      if (profile?.tenant_id) {
        const { data } = await supabase
          .from("tenants")
          .select("id, name, plan, yard_count, onboarded")
          .eq("id", profile.tenant_id)
          .maybeSingle();
        tenant = (data as Tenant | null) ?? null;
      }

      return {
        profile: (profile as Profile | null) ?? null,
        tenant,
        roles: ((roles ?? []) as { role: AppRole }[]).map((r) => r.role),
      };
    },
  });

  const roles = query.data?.roles ?? [];
  const hasRole = (r: AppRole) => roles.includes(r);

  return {
    loading: loading || (Boolean(userId) && query.isLoading),
    user: session?.user ?? null,
    profile: query.data?.profile ?? null,
    tenant: query.data?.tenant ?? null,
    /** @deprecated use `tenant` */
    org: query.data?.tenant ?? null,
    roles,
    hasRole,
    isAdmin: hasRole("admin"),
    isDispatcher: hasRole("admin") || hasRole("dispatcher"),
    isGuard: hasRole("guard"),
    canDispatch: hasRole("admin") || hasRole("dispatcher"),
    refetch: query.refetch,
  };
}
