import { createFileRoute } from "@tanstack/react-router";
import { normalizeTelematics } from "@/lib/telematics";

/**
 * Inbound tracking webhook.
 *
 * Accepts Motive (KeepTruckin), Samsara, Geotab, and generic/phone JSON
 * payloads — `normalizeTelematics` detects the shape and converts it to the
 * internal ping format that `ingest_tracking_event` understands.
 *
 *   POST /api/public/tracking
 *   Authorization: Bearer <inbound token from Settings → Integrations>
 *
 * A generic body is `{ external_id, latitude, longitude, speed_mph,
 * heading_deg, recorded_at, eta_at? }`, or `{ events: [...] }` for a batch.
 * `external_id` is matched against the outbound trailer, return trailer, or
 * driver on an open load.
 */
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
        // generated Database type yet — same escape hatch used in the hooks,
        // scoped to just these calls.
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

        let raw: unknown;
        try {
          raw = await request.json();
        } catch (e) {
          return json(
            { error: "Invalid JSON", detail: e instanceof Error ? e.message : String(e) },
            400,
          );
        }

        const hint =
          request.headers.get("x-telematics-provider") ??
          request.headers.get("user-agent") ??
          null;
        const { provider, events } = normalizeTelematics(raw, hint);

        if (events.length === 0) {
          return json({ error: "No usable events in payload", provider }, 400);
        }
        if (events.length > 200) {
          return json({ error: "Too many events in one request (max 200)" }, 400);
        }

        const results: {
          external_id: string;
          matched_load: boolean;
          matched_by: string | null;
        }[] = [];

        for (const ev of events) {
          const { data, error } = await admin.rpc("ingest_tracking_event", {
            p_company_id: companyId,
            p_external_id: ev.external_id,
            p_latitude: ev.latitude,
            p_longitude: ev.longitude,
            p_speed_mph: ev.speed_mph,
            p_heading_deg: ev.heading_deg,
            p_recorded_at: ev.recorded_at,
            p_eta_at: ev.eta_at,
            p_eta_source: ev.eta_source ?? (ev.eta_at ? provider : null),
            p_raw_payload: ev as unknown as Record<string, unknown>,
            p_asset_type: ev.asset_type,
            p_provider: provider,
          });
          if (error) {
            return json({ error: error.message, provider }, 400);
          }
          const row = data as { load_id: string | null; matched_by: string | null } | null;
          results.push({
            external_id: ev.external_id,
            matched_load: !!row?.load_id,
            matched_by: row?.matched_by ?? null,
          });
        }

        return json({ provider, received: results.length, results }, 200);
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
