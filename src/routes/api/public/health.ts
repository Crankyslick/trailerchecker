import { createFileRoute } from "@tanstack/react-router";


/**
 * Readiness probe: reports whether the app can reach the database.
 * Public on purpose (no data is returned) so uptime monitors can poll it.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let database: "ok" | "degraded" = "ok";
        let detail: string | null = null;

        try {
          const url = process.env["SUPABASE_URL"];
          const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
          if (!url || !key) throw new Error("backend configuration missing");
          const client = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
                  h.delete("Authorization");
                }
                h.set("apikey", key);
                return fetch(input, { ...init, headers: h });
              },
            },
          });
          // RLS blocks the rows; a clean response still proves the API is up.
          const { error } = await client.from("companies").select("id").limit(1);
          if (error) throw new Error(error.message);
        } catch (e) {
          database = "degraded";
          detail = (e as Error).message;
        }

        const body = {
          status: database === "ok" ? "ok" : "degraded",
          database,
          detail,
          latency_ms: Date.now() - started,
          checked_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(body), {
          status: database === "ok" ? 200 : 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
