import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged-routine verification — runs against the live backend with the
 * ANON key only.
 *
 * Every SECURITY DEFINER routine runs with the owner's rights, so an
 * unauthenticated caller must never be able to invoke one. The routines below
 * are the ones that mutate tenant data, lease background work, or hand back
 * integration secrets. If a future migration re-grants EXECUTE to PUBLIC or
 * anon (the Postgres default for newly created functions), these tests fail.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** name -> argument payload accepted by the routine's signature. */
const PRIVILEGED_RPCS: Record<string, Record<string, unknown>> = {
  // Background worker: leases queued Google Sheet writes.
  claim_sheet_outbox: {
    p_worker: "rls-test",
    p_limit: 1,
    p_lease_seconds: 30,
    p_company_id: null,
  },
  // Integration secrets.
  get_inbound_token: {},
  rotate_inbound_token: {},
  // Tenant data mutation.
  dispatch_trailer: {
    p_load_id: "00000000-0000-0000-0000-000000000000",
    p_trailer: "RLS-TEST",
    p_driver: null,
    p_destination: null,
    p_previous_driver: null,
    p_command_id: null,
  },
  yard_check_in: {
    p_trailer: "RLS-TEST",
    p_load_id: null,
    p_note: null,
    p_idempotency_key: null,
  },
  flag_exception: {
    p_load_id: "00000000-0000-0000-0000-000000000000",
    p_reason: "rls-test",
  },
  set_load_financials: {
    p_load_id: "00000000-0000-0000-0000-000000000000",
    p_customer_rate: 1,
    p_fuel_surcharge_amount: 0,
    p_carrier_pay: 0,
  },
  // Tracking reads that expose live asset positions.
  latest_tracking_locations: {},
  recent_tracking_events: { p_limit: 1 },
  // Alert fan-out, intended for the scheduled job only.
  evaluate_alerts: { p_notify: false },
  notify_user: {
    p_company_id: "00000000-0000-0000-0000-000000000000",
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_type: "test",
    p_title: "test",
    p_body: null,
    p_link: null,
  },
  // GPS ingestion — reachable only through the token-authenticated endpoint.
  ingest_tracking_event: {
    p_company_id: "00000000-0000-0000-0000-000000000000",
    p_external_id: "rls-test",
    p_latitude: 0,
    p_longitude: 0,
    p_speed_mph: null,
    p_heading_deg: null,
    p_recorded_at: new Date().toISOString(),
    p_eta_at: null,
    p_eta_source: null,
    p_raw_payload: {},
    p_asset_type: null,
    p_provider: null,
  },
};

describe("Privileged routines reject anonymous callers", () => {
  for (const [name, args] of Object.entries(PRIVILEGED_RPCS)) {
    it(`anon cannot execute ${name}()`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (anon as any).rpc(name, args);
      expect(error).not.toBeNull();
      // Postgres reports a missing EXECUTE grant as 42501; PostgREST reports an
      // unexposed routine as PGRST202. Either means anon cannot reach it.
      const code = error?.code ?? "";
      const message = error?.message ?? "";
      expect(
        code === "42501" ||
          code === "PGRST202" ||
          /permission denied|could not find the function|not exist/i.test(message),
      ).toBe(true);
    });
  }
});
