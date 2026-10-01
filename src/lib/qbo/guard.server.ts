// Authorization helper for QuickBooks server functions.
import type { SupabaseClient } from "@supabase/supabase-js";

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Confirms the caller may manage billing and returns the company they belong
 * to. The company is always resolved server-side from the caller's own
 * session, never taken from the request, so one tenant can never reach
 * another tenant's QuickBooks connection.
 */
export async function requireBillingCompany(
  supabase: SupabaseClient<never> | unknown,
): Promise<string> {
  const client = supabase as RpcClient;

  const { data: allowed } = await client.rpc("current_user_has_any_role", {
    _roles: ["owner", "admin", "billing"],
  });
  if (allowed !== true) throw new Error("You need billing or admin access to manage QuickBooks.");

  const { data: companyId } = await client.rpc("current_company_id");
  if (typeof companyId !== "string" || !companyId) {
    throw new Error("Your account is not linked to a company yet.");
  }
  return companyId;
}
