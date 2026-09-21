import { createFileRoute } from "@tanstack/react-router";

/**
 * Readiness probe. Unlike /api/public/health (liveness, always 200), this
 * answers HTTP 503 when the backend cannot be reached, so uptime monitors
 * that only look at status codes still page during an outage.
 */
export const Route = createFileRoute("/api/public/ready")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let database: "ok" | "degraded" = "ok";
        let detail: string | null = null;

        try {
          const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
          const key =
            process.env["SUPABASE_PUBLISHABLE_KEY"] ??
            process.env["SUPABASE_ANON_KEY"] ??
            import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
          if (!url || !key) throw new Error("backend configuration missing");
          const res = await fetch(`${url}/auth/v1/health`, {
            headers: { apikey: key },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`data api responded ${res.status}`);
        } catch (e) {
          database = "degraded";
          detail = (e as Error).message;
        }

        const body = {
          status: database === "ok" ? "ready" : "degraded",
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
