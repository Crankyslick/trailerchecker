import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/qbo/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const realmId = url.searchParams.get("realmId");
        const back = (msg: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: `${url.origin}/billing?qbo=${msg}` },
          });

        if (url.searchParams.get("error") || !code || !state || !realmId) return back("denied");

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as unknown as {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind the schema
            from: (table: string) => any;
          };

          const { data: st } = await admin
            .from("qbo_oauth_states")
            .select("state, company_id, user_id, created_at")
            .eq("state", state)
            .maybeSingle();
          if (!st) return back("invalid_state");
          await admin.from("qbo_oauth_states").delete().eq("state", state);
          if (Date.now() - new Date(st.created_at as string).getTime() > 15 * 60_000) {
            return back("expired");
          }

          const { exchangeCode, qboRedirectUri, qboEnvironment, qboApi } = await import(
            "@/lib/qbo/qbo.server"
          );
          const tokens = await exchangeCode(code, qboRedirectUri(url.origin));
          const accessExpires = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          const conn = {
            id: "",
            company_id: st.company_id as string,
            realm_id: realmId,
            company_name: null,
            environment: qboEnvironment(),
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            access_expires_at: accessExpires,
            last_synced_at: null,
          };

          let companyName: string | null = null;
          try {
            const info = await qboApi<{ CompanyInfo?: { CompanyName?: string } }>(
              conn,
              `/companyinfo/${realmId}?minorversion=70`,
            );
            companyName = info.CompanyInfo?.CompanyName ?? null;
          } catch (e) {
            console.error("QuickBooks company info lookup failed", e);
          }

          const { error } = await admin.from("qbo_connections").upsert(
            {
              company_id: st.company_id as string,
              realm_id: realmId,
              company_name: companyName,
              environment: qboEnvironment(),
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              access_expires_at: accessExpires,
              refresh_expires_at: tokens.x_refresh_token_expires_in
                ? new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000).toISOString()
                : null,
              connected_by: (st.user_id as string | null) ?? null,
            },
            { onConflict: "company_id" },
          );
          if (error) throw error;

          return back("connected");
        } catch (e) {
          console.error("QuickBooks OAuth callback failed", e);
          return back("failed");
        }
      },
    },
  },
});
