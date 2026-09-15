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
          // Reach the data API without reading any row: a healthy service
          // answers the API root, a degraded one does not.
          const headers: Record<string, string> = { apikey: key };
          if (!key.startsWith("sb_")) headers["Authorization"] = `Bearer ${key}`;
          const res = await fetch(`${url}/rest/v1/`, {
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`data api responded ${res.status}`);
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
