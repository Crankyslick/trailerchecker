import { createFileRoute } from "@tanstack/react-router";
import { sendSms } from "@/lib/alerts/sendSms";
import { sendEmail } from "@/lib/alerts/sendEmail";
import { shouldSend } from "@/lib/alerts/rateLimit";

type AlertType = "dispatch" | "exception" | "pod";

type NotifyBody = {
  type: AlertType;
  loadId: string;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * Looks up who to notify itself, server-side, from loadId — never trusts a
 * client-supplied phone/email/message. This is deliberate: an alert route
 * that took contact info from the request body would let any authenticated
 * user text/email an arbitrary number via this company's Twilio account.
 */
export const Route = createFileRoute("/api/alerts/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate the caller — this route sends real SMS/email on a
        // shared account, so it isn't public the way /api/public/health is.
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ") || authHeader.length < 20) {
          return json({ error: "unauthorized" }, 401);
        }

        let body: NotifyBody;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }
        if (!body?.type || !body?.loadId) {
          return json({ error: "type and loadId are required" }, 400);
        }

        try {
          const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
          // carriers/tenders/appointments/exception_reason/drivers.user_id etc.
          // are all from migrations this repo's generated types.ts hasn't
          // been regenerated against yet — same documented escape hatch used
          // throughout the app's newer hooks.
          const supabaseAdmin = rawAdmin as unknown as {
            from: (table: string) => ReturnType<typeof rawAdmin.from<"trailer_loads">>;
            auth: typeof rawAdmin.auth;
          };

          // Verify the token belongs to a real user before doing anything else.
          const token = authHeader.slice("Bearer ".length);
          const { data: claims, error: authError } = await supabaseAdmin.auth.getClaims(token);
          if (authError || !claims?.claims?.sub) {
            return json({ error: "unauthorized" }, 401);
          }

          const { data: load, error: loadError } = await supabaseAdmin
            .from("trailer_loads")
            .select(
              "id, company_id, schedule_id, driver_id, origin_name, str_name, cutoff_date, cutoff_time, exception_reason",
            )
            .eq("id", body.loadId)
            .maybeSingle();
          if (loadError || !load) {
            // Not the caller's fault in the common case (e.g. a race with a
            // superseded/replanned load) — log but don't error the whole
            // request over a side effect that has nowhere to go.
            console.error(
              `[alerts:${body.type}] load ${body.loadId} not found:`,
              loadError?.message,
            );
            return json({ ok: true, sent: [] }, 200);
          }

          const dedupeKey = `${body.type}:${load.id}`;
          if (!shouldSend(dedupeKey)) {
            return json({ ok: true, sent: [], skipped: "duplicate_within_cooldown" }, 200);
          }

          const results: Array<{ channel: string; sent: boolean }> = [];

          if (body.type === "dispatch") {
            if (!load.driver_id) return json({ ok: true, sent: [] }, 200);
            const { data: driver } = await supabaseAdmin
              .from("drivers")
              .select("phone, user_id")
              .eq("id", load.driver_id)
              .maybeSingle();

            const message =
              `New load assigned:\n${load.origin_name ?? "—"} → ${load.str_name ?? "—"}\n` +
              `Pickup: ${load.cutoff_date ?? "TBD"} ${load.cutoff_time ?? ""}\n` +
              `Check app for details.`;

            if (driver?.phone) {
              const r = await sendSms(driver.phone, message);
              results.push({ channel: "sms", sent: r.sent });
            }
            // Drivers have no email column — only reachable if they've been
            // onboarded to the driver app (drivers.user_id set). Skipped
            // otherwise, per "if missing, safely skip."
            if (driver?.user_id) {
              const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(driver.user_id);
              if (authUser?.user?.email) {
                const r = await sendEmail(
                  authUser.user.email,
                  "New load assigned",
                  `<p>${message.replace(/\n/g, "<br/>")}</p>`,
                );
                results.push({ channel: "email", sent: r.sent });
              }
            }
          } else if (body.type === "exception" || body.type === "pod") {
            const recipients = await getDispatcherEmails(supabaseAdmin, load.company_id);
            const message =
              body.type === "exception"
                ? `⚠️ Driver reported issue on load #${load.schedule_id}\nNote: ${load.exception_reason ?? "—"}`
                : `✅ Load #${load.schedule_id} delivered successfully`;
            const subject =
              body.type === "exception" ? "Load exception reported" : "Load delivered";

            for (const email of recipients) {
              const r = await sendEmail(
                email,
                subject,
                `<p>${message.replace(/\n/g, "<br/>")}</p>`,
              );
              results.push({ channel: "email", sent: r.sent });
            }
          }

          return json({ ok: true, sent: results }, 200);
        } catch (e) {
          // Alerts must never surface as a hard failure to the caller — the
          // operation they're a side effect of has already committed.
          console.error(`[alerts:${body.type}]`, (e as Error).message);
          return json({ ok: false, error: "alert failed, logged" }, 200);
        }
      },
    },
  },
});

/** Owner/admin/dispatcher emails for the company that owns this load, capped to keep fan-out bounded. */
async function getDispatcherEmails(
  supabaseAdmin: {
    from: (table: string) => ReturnType<import("@supabase/supabase-js").SupabaseClient["from"]>;
    auth: import("@supabase/supabase-js").SupabaseClient["auth"];
  },
  companyId: string,
): Promise<string[]> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("tenant_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!company?.tenant_id) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("tenant_id", company.tenant_id);
  const profileIds = (profiles ?? []).map((p) => p.id);
  if (profileIds.length === 0) return [];

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("user_id", profileIds)
    .in("role", ["owner", "admin", "dispatcher"]);
  const userIds = [...new Set((roles ?? []).map((r) => r.user_id))].slice(0, 5);

  const emails: string[] = [];
  for (const userId of userIds) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (data?.user?.email) emails.push(data.user.email);
  }
  return emails;
}
