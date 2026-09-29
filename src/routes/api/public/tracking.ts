import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Inbound tracking webhook. Vendor-agnostic on purpose: this repo has no
 * telematics provider connected, so it accepts a generic normalized shape
 * rather than one specific provider's payload. Point any GPS/ELD provider's
 * webhook (or a small adapter in front of one) at this URL with:
 *   Authorization: Bearer <inbound token from Settings>
 * Body: a single event object, or { events: [...] } for a batch.
 */
const eventSchema = z.object({
  external_id: z.string().min(1), // matched against loads.outbound_trailer
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  speed_mph: z.number().nullable().optional(),
  heading_deg: z.number().nullable().optional(),
  recorded_at: z.string().datetime({ offset: true }),
  eta_at: z.string().datetime({ offset: true }).nullable().optional(),
  eta_source: z.string().nullable().optional(),
});

const bodySchema = z.union([
  eventSchema,
  z.object({ events: z.array(eventSchema).min(1).max(200) }),
]);

export const Route = createFileRoute("/api/public/tracking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) {
          return json({ error: "Missing bearer token" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // sync_secrets.inbound_token and ingest_tracking_event() aren't in the
        // generated Database type yet (added by a migration that hasn't been
        // through `supabase gen types` against a live DB) — same escape hatch
        // used in the hooks, scoped to just these calls.
        const admin = supabaseAdmin as unknown as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
          from: (table: string) => any;
          rpc: (
            fn: string,
            args?: Record<string, unknown>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
          ) => Promise<{ data: any; error: { message: string } | null }>;
        };

        const { data: secretRow, error: secretErr } = await admin
          .from("sync_secrets")
          .select("company_id")
          .eq("inbound_token", token)
          .maybeSingle();
        if (secretErr || !secretRow) {
          return json({ error: "Invalid token" }, 401);
        }
        const companyId = (secretRow as { company_id: string }).company_id;

        let parsed: z.infer<typeof bodySchema>;
        try {
          const raw = await request.json();
          parsed = bodySchema.parse(raw);
        } catch (e) {
          return json(
            { error: "Invalid payload", detail: e instanceof Error ? e.message : String(e) },
            400,
          );
        }

        const events = "events" in parsed ? parsed.events : [parsed];
        const results: { external_id: string; matched_load: boolean }[] = [];

        for (const ev of events) {
          const { data, error } = await admin.rpc("ingest_tracking_event", {
            p_company_id: companyId,
            p_external_id: ev.external_id,
            p_latitude: ev.latitude ?? null,
            p_longitude: ev.longitude ?? null,
            p_speed_mph: ev.speed_mph ?? null,
            p_heading_deg: ev.heading_deg ?? null,
            p_recorded_at: ev.recorded_at,
            p_eta_at: ev.eta_at ?? null,
            p_eta_source: ev.eta_source ?? null,
            p_raw_payload: ev,
          });
          if (error) {
            return json({ error: error.message }, 500);
          }
          results.push({
            external_id: ev.external_id,
            matched_load: !!(data as { load_id: string | null } | null)?.load_id,
          });
        }

        return json({ received: results.length, results }, 200);
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
