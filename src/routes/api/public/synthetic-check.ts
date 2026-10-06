import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Scheduled, end-to-end synthetic health check — called every 15 minutes by
 * the synthetic-check pg_cron job (see the reliability_observability
 * migration). Same job-token pattern as /api/public/sheet-drain: the route
 * prefix is public, the handler is not.
 *
 * This exists because "reliability is unproven" isn't fixed by a claim —
 * it's fixed by evidence, generated continuously, that the system (including
 * the brand-new public token routes) is actually working right now. Every
 * sub-check below exercises real, live code paths: it never asserts against
 * a mock.
 */
export const Route = createFileRoute("/api/public/synthetic-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });

        const provided = request.headers.get("x-job-secret") ?? "";
        if (!provided) return json({ error: "unauthorized" }, 401);

        const { supabaseAdmin: typedAdmin } = await import("@/integrations/supabase/client.server");
        // ops_health_checks and sheet_sync_outbox's "status" column aren't in
        // the generated Database type yet — same escape hatch used in
        // sheet-drain.ts and tracking.ts, scoped to just these calls.
        const supabaseAdmin = typedAdmin as unknown as {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
          from: (table: string) => any;
          rpc: (
            fn: string,
            args?: Record<string, unknown>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
          ) => Promise<{ data: any; error: { message: string } | null }>;
        };
        const { data: tokenRow } = await supabaseAdmin
          .from("internal_job_tokens")
          .select("token")
          .eq("name", "synthetic_check")
          .maybeSingle();
        const expected = (tokenRow as { token: string } | null)?.token ?? "";
        if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

        const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
        const anonKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["SUPABASE_ANON_KEY"] ??
          import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        const siteOrigin = process.env["SITE_URL"] ?? "https://trailerchecker.lovable.app";
        const anon =
          url && anonKey
            ? createClient(url, anonKey, {
                auth: { persistSession: false, autoRefreshToken: false },
              })
            : null;

        const results: {
          check_name: string;
          status: "ok" | "degraded" | "fail";
          latency_ms: number;
          detail: string | null;
        }[] = [];

        async function run(
          name: string,
          fn: () => Promise<{ status: "ok" | "degraded" | "fail"; detail?: string | null }>,
        ) {
          const started = Date.now();
          try {
            const { status, detail } = await fn();
            results.push({
              check_name: name,
              status,
              latency_ms: Date.now() - started,
              detail: detail ?? null,
            });
          } catch (e) {
            results.push({
              check_name: name,
              status: "fail",
              latency_ms: Date.now() - started,
              detail: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // 1. Database reachable at all.
        await run("db_reachability", async () => {
          if (!url || !anonKey) return { status: "fail", detail: "backend configuration missing" };
          const res = await fetch(`${url}/auth/v1/health`, {
            headers: { apikey: anonKey },
            signal: AbortSignal.timeout(5000),
          });
          return res.ok
            ? { status: "ok" }
            : { status: "fail", detail: `auth health responded ${res.status}` };
        });

        // 2. RLS still denies anonymous reads of tenant data — this is the
        // same assertion as src/lib/rls.test.ts, but running continuously
        // against production instead of once in CI.
        await run("anon_rls_trailer_loads", async () => {
          if (!anon) return { status: "fail", detail: "no anon client" };
          const { data, error } = await anon.from("trailer_loads").select("id").limit(1);
          const denied = !!error || !data || data.length === 0;
          return denied
            ? { status: "ok" }
            : { status: "fail", detail: "anonymous read returned tenant rows" };
        });

        // 3 & 4. The brand-new zero-login public RPCs, exercised with a
        // token that cannot match anything. A real end-to-end call through
        // the live anon-granted RPC path — if either now throws, requires
        // auth, or 500s, this fails immediately instead of waiting for a
        // carrier or customer to hit a dead link first.
        await run("public_tender_token_rpc", async () => {
          if (!anon) return { status: "fail", detail: "no anon client" };
          const { data, error } = await anon.rpc("get_tender_by_token", {
            p_token: "synthetic-check-nonexistent-token",
          });
          if (error) return { status: "fail", detail: error.message };
          const row = (Array.isArray(data) ? data[0] : data) as
            | { token_valid?: boolean }
            | undefined;
          return row?.token_valid === false
            ? { status: "ok" }
            : { status: "fail", detail: "unexpected response shape" };
        });

        await run("public_tracking_token_rpc", async () => {
          if (!anon) return { status: "fail", detail: "no anon client" };
          const { data, error } = await anon.rpc("get_tracking_by_token", {
            p_token: "synthetic-check-nonexistent-token",
          });
          if (error) return { status: "fail", detail: error.message };
          const row = (Array.isArray(data) ? data[0] : data) as { found?: boolean } | undefined;
          return row?.found === false
            ? { status: "ok" }
            : { status: "fail", detail: "unexpected response shape" };
        });

        // 5. The public-facing pages themselves actually render (catches a
        // build/deploy break in the route, not just the RPC behind it).
        for (const path of ["/tenders/respond?token=synthetic-check", "/track/synthetic-check"]) {
          await run(`public_page:${path}`, async () => {
            const res = await fetch(`${siteOrigin}${path}`, { signal: AbortSignal.timeout(8000) });
            return res.ok
              ? { status: "ok" }
              : { status: "fail", detail: `responded ${res.status}` };
          });
        }

        // 6. Tenant isolation: every tenant-scoped table must have RLS both
        // enabled AND forced. A table found with either flag off is exactly
        // the shape of bug that lets a brand-new tenant see another
        // tenant's dashboard/yard data — this catches that automatically
        // instead of waiting for a customer to report it.
        await run("tenant_rls_enabled", async () => {
          const { data, error } = await supabaseAdmin.rpc("check_tenant_rls_enabled");
          if (error) return { status: "fail", detail: error.message };
          const rows = (data ?? []) as {
            table_name: string;
            rls_enabled: boolean;
            rls_forced: boolean;
          }[];
          const bad = rows.filter((r) => !r.rls_enabled || !r.rls_forced);
          return bad.length === 0
            ? { status: "ok", detail: `${rows.length} tables checked` }
            : {
                status: "fail",
                detail: `RLS not enforced on: ${bad.map((r) => r.table_name).join(", ")}`,
              };
        });

        // 7. Sheet sync backlog age — the same figure Settings already
        // warns on, now tracked over time instead of only on page load.
        await run("sheet_outbox_backlog", async () => {
          const { data, error } = await supabaseAdmin
            .from("sheet_sync_outbox")
            .select("created_at")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (error) return { status: "fail", detail: error.message };
          if (!data) return { status: "ok", detail: "queue empty" };
          const ageHours =
            (Date.now() - new Date((data as { created_at: string }).created_at).getTime()) /
            3_600_000;
          if (ageHours >= 3)
            return {
              status: "degraded",
              detail: `oldest pending row is ${ageHours.toFixed(1)}h old`,
            };
          return { status: "ok", detail: `oldest pending row is ${ageHours.toFixed(1)}h old` };
        });

        await supabaseAdmin.from("ops_health_checks").insert(results);

        const overall = results.some((r) => r.status === "fail")
          ? "fail"
          : results.some((r) => r.status === "degraded")
            ? "degraded"
            : "ok";
        return json({ overall, results }, overall === "fail" ? 500 : 200);
      },
    },
  },
});
