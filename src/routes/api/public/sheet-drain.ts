import { createFileRoute } from "@tanstack/react-router";
import { drainSheetOutbox } from "@/lib/sheets.functions";

/**
 * Server-side drain of the Google Sheet queue for every company.
 *
 * Called by the scheduled job so queued sheet writes are delivered even when
 * nobody has the app open; the in-browser worker stays as a low-latency
 * helper. Protected by a shared secret — the route prefix is public, the
 * handler is not.
 */
export const Route = createFileRoute("/api/public/sheet-drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SHEET_DRAIN_SECRET"];
        const provided = request.headers.get("x-drain-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await drainSheetOutbox(supabaseAdmin, {
            limit: 100,
            worker: `cron:${new Date().toISOString()}`,
          });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
