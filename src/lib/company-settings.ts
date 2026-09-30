/**
 * Company-configurable operating policy.
 *
 * The yard turnaround limit is a real business rule: the dashboard ticker,
 * yard colours, reports and alerts all read it from here so the Settings
 * screen and the board can never disagree. Every change is recorded in the
 * settings history log by the database.
 */
import { supabase } from "@/integrations/supabase/client";
import { YARD_POLICY, type YardPolicy } from "@/lib/loads";
import { normalizeBusinessModel, type BusinessModel } from "@/lib/brokerage";

export type { YardPolicy };

export const POLICY_BOUNDS = {
  minDeadline: 1,
  maxDeadline: 168,
  maxCritical: 336,
} as const;

export type CompanySettingsRow = {
  company_id: string;
  yard_deadline_hours: number;
  yard_critical_hours: number;
};

/** Read the org operating profile; missing-column fallback keeps older deployments usable. */
export async function readBusinessModel(): Promise<BusinessModel> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("business_model")
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingBusinessModelColumn(error)) return "ASSET_BASED_3PL";
    throw new Error(error.message);
  }
  return normalizeBusinessModel((data as { business_model?: unknown } | null)?.business_model);
}

/** Settings are admin-controlled by the existing company_settings RLS policies. */
export async function saveBusinessModel(model: BusinessModel): Promise<void> {
  if (!isBusinessModel(model)) throw new Error("Choose a supported business model.");

  const { data: existing, error: readError } = await supabase
    .from("company_settings")
    .select("company_id")
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) {
    const { error } = await supabase
      .from("company_settings")
      .update({ business_model: model })
      .eq("company_id", (existing as { company_id: string }).company_id);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("No company is linked to your account.");
  const { error } = await supabase
    .from("company_settings")
    .insert({ company_id: (company as { id: string }).id, business_model: model });
  if (error) throw new Error(error.message);
}

function isBusinessModel(value: string): value is BusinessModel {
  return value === "ASSET_BASED_3PL" || value === "FREIGHT_BROKER" || value === "HYBRID";
}

function isMissingBusinessModelColumn(error: { code?: string; message: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message.toLowerCase().includes("business_model")
  );
}

/** Current company policy, falling back to the shipped defaults. */
export async function readYardPolicy(): Promise<YardPolicy> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("company_id, yard_deadline_hours, yard_critical_hours")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as CompanySettingsRow | null;
  if (!row) return YARD_POLICY;
  return {
    deadlineHours: row.yard_deadline_hours,
    criticalHours: row.yard_critical_hours,
  };
}

export function validateYardPolicy(p: YardPolicy): string | null {
  if (!Number.isInteger(p.deadlineHours) || !Number.isInteger(p.criticalHours))
    return "Enter whole hours.";
  if (p.deadlineHours < POLICY_BOUNDS.minDeadline || p.deadlineHours > POLICY_BOUNDS.maxDeadline)
    return `The turnaround limit must be between ${POLICY_BOUNDS.minDeadline} and ${POLICY_BOUNDS.maxDeadline} hours.`;
  if (p.criticalHours <= p.deadlineHours)
    return "The critical limit must be greater than the turnaround limit.";
  if (p.criticalHours > POLICY_BOUNDS.maxCritical)
    return `The critical limit must be ${POLICY_BOUNDS.maxCritical} hours or less.`;
  return null;
}

/** Admin-only on the database side; others receive a permission error. */
export async function saveYardPolicy(p: YardPolicy): Promise<void> {
  const invalid = validateYardPolicy(p);
  if (invalid) throw new Error(invalid);

  const patch = {
    yard_deadline_hours: p.deadlineHours,
    yard_critical_hours: p.criticalHours,
  };

  const { data: existing } = await supabase
    .from("company_settings")
    .select("company_id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("company_settings")
      .update(patch)
      .eq("company_id", (existing as { company_id: string }).company_id);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("No company is linked to your account.");
  const { error } = await supabase
    .from("company_settings")
    .insert({ company_id: (company as { id: string }).id, ...patch });
  if (error) throw new Error(error.message);
}
