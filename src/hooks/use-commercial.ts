import { useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose client for new tables/views
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

function useRealtime(table: string, keys: readonly unknown[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`${table}-cm-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    }).subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, table]); // eslint-disable-line react-hooks/exhaustive-deps
}

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- Rates
export type RateVersion = {
  id: string;
  root_id: string;
  version: number;
  linehaul_rate: number;
  fuel_surcharge_pct: number;
  effective_start: string | null;
  effective_end: string | null;
  superseded_by_id: string | null;
  created_at: string;
};

export function useRateHistory(rootId: string | null) {
  return useQuery({
    queryKey: ["rate_agreements", "history", rootId],
    enabled: Boolean(rootId),
    queryFn: async (): Promise<RateVersion[]> => {
      const { data, error } = await sb
        .from("rate_agreements")
        .select(
          "id, root_id, version, linehaul_rate, fuel_surcharge_pct, effective_start, effective_end, superseded_by_id, created_at",
        )
        .eq("root_id", rootId)
        .order("version", { ascending: false });
      throwIf(error);
      return (data ?? []) as RateVersion[];
    },
  });
}

export async function reviseRate(input: {
  id: string;
  linehaulRate: number;
  fuelSurchargePct: number;
  effectiveStart: string;
}) {
  const { data, error } = await sb.rpc("revise_rate_agreement", {
    p_rate_agreement_id: input.id,
    p_new_linehaul_rate: input.linehaulRate,
    p_new_fuel_surcharge_pct: input.fuelSurchargePct,
    p_effective_start: input.effectiveStart,
  });
  throwIf(error);
  return data as { id: string };
}

export async function updateRateExtras(
  id: string,
  input: { contractNumber: string | null; additionalStopRate: number },
) {
  const { error } = await sb
    .from("rate_agreements")
    .update({ contract_number: input.contractNumber, additional_stop_rate: input.additionalStopRate })
    .eq("id", id);
  throwIf(error);
}

export type RateBreak = {
  id: string;
  rate_agreement_id: string;
  min_weight: number;
  max_weight: number | null;
  linehaul_rate: number;
};

export function useRateBreaks(rateId: string | null) {
  useRealtime("rate_breaks", [["rate_breaks"]]);
  return useQuery({
    queryKey: ["rate_breaks", rateId],
    enabled: Boolean(rateId),
    queryFn: async (): Promise<RateBreak[]> => {
      const { data, error } = await sb
        .from("rate_breaks")
        .select("id, rate_agreement_id, min_weight, max_weight, linehaul_rate")
        .eq("rate_agreement_id", rateId)
        .order("min_weight");
      throwIf(error);
      return (data ?? []) as RateBreak[];
    },
  });
}

export async function addRateBreak(input: {
  rateId: string;
  minWeight: number;
  maxWeight: number | null;
  linehaulRate: number;
}) {
  const { error } = await sb.from("rate_breaks").insert({
    rate_agreement_id: input.rateId,
    min_weight: input.minWeight,
    max_weight: input.maxWeight,
    linehaul_rate: input.linehaulRate,
  });
  throwIf(error);
}

export async function deleteRateBreak(id: string) {
  const { error } = await sb.from("rate_breaks").delete().eq("id", id);
  throwIf(error);
}

// ---------------------------------------------------------- Accessorials
export type PendingAccessorial = {
  id: string;
  code: string;
  description: string | null;
  amount: number;
  billable_to: string;
  created_at: string;
  trailer_loads: { schedule_id: string } | null;
};

export function usePendingAccessorials() {
  useRealtime("accessorials", [["accessorials"]]);
  return useQuery({
    queryKey: ["accessorials", "pending"],
    queryFn: async (): Promise<PendingAccessorial[]> => {
      const { data, error } = await sb
        .from("accessorials")
        .select("id, code, description, amount, billable_to, created_at, trailer_loads ( schedule_id )")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });
      throwIf(error);
      return (data ?? []) as PendingAccessorial[];
    },
    placeholderData: keepPreviousData,
  });
}

export async function approveAccessorial(id: string) {
  const { error } = await sb.rpc("approve_accessorial", { p_accessorial_id: id });
  throwIf(error);
}
export async function rejectAccessorial(id: string, reason: string) {
  const { error } = await sb.rpc("reject_accessorial", { p_accessorial_id: id, p_reason: reason });
  throwIf(error);
}

// ---------------------------------------------------------- AR + disputes
export type AgingRow = {
  id: string;
  client_id: string;
  client_name: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  due_at: string | null;
  days_past_due: number | null;
  aging_bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
};

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

export function useInvoiceAging() {
  useRealtime("customer_invoices", [["invoice_aging"]]);
  return useQuery({
    queryKey: ["invoice_aging"],
    queryFn: async (): Promise<AgingRow[]> => {
      const { data, error } = await sb.from("customer_invoice_aging").select("*");
      throwIf(error);
      return (data ?? []) as AgingRow[];
    },
    placeholderData: keepPreviousData,
  });
}

export async function disputeInvoice(id: string, reason: string) {
  const { error } = await sb.rpc("dispute_invoice", { p_invoice_id: id, p_reason: reason });
  throwIf(error);
}
export async function resolveDispute(id: string, status: "SENT" | "PAID" | "VOID") {
  const { error } = await sb.rpc("resolve_invoice_dispute", {
    p_invoice_id: id,
    p_new_status: status,
  });
  throwIf(error);
}
export async function markInvoiceSent(id: string) {
  const { error } = await sb
    .from("customer_invoices")
    .update({ status: "SENT" })
    .eq("id", id)
    .eq("status", "DRAFT");
  throwIf(error);
}

// ---------------------------------------------------------------- CRM
export type ClientContact = {
  id: string;
  client_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

export function useClientContacts(clientId: string | null) {
  useRealtime("trailer_client_contacts", [["client_contacts"]]);
  return useQuery({
    queryKey: ["client_contacts", clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientContact[]> => {
      const { data, error } = await sb
        .from("trailer_client_contacts")
        .select("id, client_id, name, title, email, phone, is_primary")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("name");
      throwIf(error);
      return (data ?? []) as ClientContact[];
    },
  });
}

export async function addClientContact(input: Omit<ClientContact, "id">) {
  if (!input.name.trim()) throw new Error("Contact name is required");
  if (input.is_primary) {
    const { error: e1 } = await sb
      .from("trailer_client_contacts")
      .update({ is_primary: false })
      .eq("client_id", input.client_id)
      .eq("is_primary", true);
    throwIf(e1);
  }
  const { error } = await sb.from("trailer_client_contacts").insert({
    ...input,
    name: input.name.trim(),
    email: input.email?.trim() || null,
  });
  throwIf(error);
}

export async function setPrimaryContact(clientId: string, contactId: string) {
  const { error: e1 } = await sb
    .from("trailer_client_contacts")
    .update({ is_primary: false })
    .eq("client_id", clientId)
    .eq("is_primary", true);
  throwIf(e1);
  const { error } = await sb
    .from("trailer_client_contacts")
    .update({ is_primary: true })
    .eq("id", contactId);
  throwIf(error);
}

export async function deleteClientContact(id: string) {
  const { error } = await sb.from("trailer_client_contacts").delete().eq("id", id);
  throwIf(error);
}

export type ClientActivity = {
  id: string;
  activity_type: "call" | "email" | "note" | "meeting" | "system";
  note: string | null;
  created_at: string;
};

export function useClientActivities(clientId: string | null) {
  useRealtime("trailer_client_activities", [["client_activities"]]);
  return useQuery({
    queryKey: ["client_activities", clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientActivity[]> => {
      const { data, error } = await sb
        .from("trailer_client_activities")
        .select("id, activity_type, note, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(100);
      throwIf(error);
      return (data ?? []) as ClientActivity[];
    },
  });
}

export async function logClientActivity(input: {
  clientId: string;
  type: "call" | "email" | "note" | "meeting";
  note: string;
}) {
  if (!input.note.trim()) throw new Error("Add a short note");
  const { error } = await sb.from("trailer_client_activities").insert({
    client_id: input.clientId,
    activity_type: input.type,
    note: input.note.trim(),
  });
  throwIf(error);
}

export async function updateClientTerms(
  clientId: string,
  input: { paymentTermsDays: number; creditLimit: number | null },
) {
  const { error } = await sb
    .from("trailer_clients")
    .update({ payment_terms_days: input.paymentTermsDays, credit_limit: input.creditLimit })
    .eq("id", clientId);
  throwIf(error);
}

export function useClientTerms(clientId: string | null) {
  return useQuery({
    queryKey: ["trailer_clients", "terms", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await sb
        .from("trailer_clients")
        .select("payment_terms_days, credit_limit")
        .eq("id", clientId)
        .single();
      throwIf(error);
      return data as { payment_terms_days: number; credit_limit: number | null };
    },
  });
}
