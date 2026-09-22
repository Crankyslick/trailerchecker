import { createFileRoute } from "@tanstack/react-router";
import { drainSheetOutbox } from "@/lib/sheets.functions";

/**
 * Server-side drain of the Google Sheet queue for every company.
 *
 * Called hourly by the scheduled database job so queued sheet writes are
 * delivered even when nobody has the app open; the in-browser worker stays as
 * a low-latency helper. The route prefix is public, the handler is not — it
 * requires the private job token, which only the scheduler can read.
 */
export const Route = createFileRoute("/api/public/sheet-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });

        const provided = request.headers.get("x-drain-secret") ?? "";
        if (!provided) return json({ error: "unauthorized" }, 401);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: tokenRow } = await supabaseAdmin
            .from("internal_job_tokens")
            .select("token")
            .eq("name", "sheet_drain")
            .maybeSingle();
          const expected = (tokenRow as { token: string } | null)?.token ?? "";
          if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

          const result = await drainSheetOutbox(supabaseAdmin, {
            limit: 100,
            worker: `cron:${new Date().toISOString()}`,
          });
          return json(result, 200);
        } catch (e) {
          console.error("[sheet-drain]", (e as Error).message);
          return json({ error: "drain failed" }, 500);
        }
      },
    },
  },
});
