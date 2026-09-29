import { useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

function realtimeSubscribe(table: string, onChange: () => void) {
  let ch: ReturnType<typeof supabase.channel> | undefined;
  try {
    ch = supabase.channel(`${table}-stream-${Math.random().toString(36).slice(2)}`);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => void onChange(),
    ).subscribe();
  } catch {
    /* noop */
  }
  return () => {
    try {
      if (ch) supabase.removeChannel(ch);
    } catch {
      /* noop */
    }
  };
}

// ---------------------------------------------------------------------------
// Rate agreements
// ---------------------------------------------------------------------------

export type RateAgreement = {
  id: string;
  client_id: string | null;
  origin_code: string | null;
  destination_code: string | null;
  rate_type: "FLAT" | "PER_MILE";
  linehaul_rate: number;
  fuel_surcharge_pct: number;
};

export function useRateAgreements() {
  const qc = useQueryClient();
  useEffect(
    () =>
      realtimeSubscribe("rate_agreements", () => {
        void qc.invalidateQueries({ queryKey: ["rate_agreements"] });
      }),
    [qc],
  );
  return useQuery({
    queryKey: ["rate_agreements"],
    queryFn: async (): Promise<RateAgreement[]> => {
      const { data, error } = await sb
        .from("rate_agreements")
        .select(
          "id, client_id, origin_code, destination_code, rate_type, linehaul_rate, fuel_surcharge_pct",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as RateAgreement[];
    },
    placeholderData: keepPreviousData,
  });
}

export async function createRateAgreement(input: {
  clientId: string | null;
  originCode: string | null;
  destinationCode: string | null;
  rateType: "FLAT" | "PER_MILE";
  linehaulRate: number;
  fuelSurchargePct: number;
}) {
  const { error } = await sb.from("rate_agreements").insert({
    client_id: input.clientId,
    origin_code: input.originCode,
    destination_code: input.destinationCode,
    rate_type: input.rateType,
    linehaul_rate: input.linehaulRate,
    fuel_surcharge_pct: input.fuelSurchargePct,
  });
  if (error) throw new Error(error.message);
}

export async function applyRateToLoad(
  loadId: string,
  rateAgreementId: string,
  miles: number | null,
) {
  const { error } = await sb.rpc("apply_rate_to_load", {
    p_load_id: loadId,
    p_rate_agreement_id: rateAgreementId,
    p_miles: miles,
  });
  if (error) throw new Error(error.message);
}

export async function setLoadFinancials(input: {
  loadId: string;
  customerRate: number | null;
  fuelSurchargeAmount: number | null;
  carrierPay: number | null;
}) {
  const { error } = await sb.rpc("set_load_financials", {
    p_load_id: input.loadId,
    p_customer_rate: input.customerRate,
    p_fuel_surcharge_amount: input.fuelSurchargeAmount,
    p_carrier_pay: input.carrierPay,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Accessorials
// ---------------------------------------------------------------------------

export type Accessorial = {
  id: string;
  load_id: string;
  code: string;
  description: string | null;
  amount: number;
  billable_to: "CUSTOMER" | "CARRIER";
};

export async function addAccessorial(input: {
  loadId: string;
  code: string;
  description: string | null;
  amount: number;
  billableTo: "CUSTOMER" | "CARRIER";
}) {
  const { error } = await sb.from("accessorials").insert({
    load_id: input.loadId,
    code: input.code,
    description: input.description,
    amount: input.amount,
    billable_to: input.billableTo,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Billing workspace: loads with financials + client/carrier names
// ---------------------------------------------------------------------------

export type BillableLoad = {
  id: string;
  schedule_id: string;
  status: string;
  client_id: string | null;
  carrier_id: string | null;
  customer_rate: number | null;
  fuel_surcharge_amount: number;
  carrier_pay: number | null;
  invoice_status: string;
  settlement_status: string;
  trailer_clients: { name: string } | null;
  carriers: { name: string } | null;
};

export function useBillableLoads() {
  const query = useQuery({
    queryKey: ["loads", "billing"],
    queryFn: async (): Promise<BillableLoad[]> => {
      const { data, error } = await sb
        .from("trailer_loads")
        .select(
          `id, schedule_id, status, client_id, carrier_id,
           customer_rate, fuel_surcharge_amount, carrier_pay, invoice_status, settlement_status,
           trailer_clients ( name ), carriers ( name )`,
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BillableLoad[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("trailer_loads", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function generateCustomerInvoice(clientId: string, loadIds: string[]) {
  const { data, error } = await sb.rpc("generate_customer_invoice", {
    p_client_id: clientId,
    p_load_ids: loadIds,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function generateCarrierSettlement(carrierId: string, loadIds: string[]) {
  const { data, error } = await sb.rpc("generate_carrier_settlement", {
    p_carrier_id: carrierId,
    p_load_ids: loadIds,
  });
  if (error) throw new Error(error.message);
  return data;
}

export type CustomerInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  issued_at: string | null;
  trailer_clients: { name: string } | null;
};

export function useCustomerInvoices() {
  const query = useQuery({
    queryKey: ["customer_invoices"],
    queryFn: async (): Promise<CustomerInvoice[]> => {
      const { data, error } = await sb
        .from("customer_invoices")
        .select("id, invoice_number, status, total_amount, issued_at, trailer_clients ( name )")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CustomerInvoice[];
    },
    placeholderData: keepPreviousData,
  });
  useEffect(() => realtimeSubscribe("customer_invoices", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return query;
}

export type CarrierSettlement = {
  id: string;
  settlement_number: string;
  status: string;
  total_amount: number;
  carriers: { name: string } | null;
};

export function useCarrierSettlements() {
  const query = useQuery({
    queryKey: ["carrier_settlements"],
    queryFn: async (): Promise<CarrierSettlement[]> => {
      const { data, error } = await sb
        .from("carrier_settlements")
        .select("id, settlement_number, status, total_amount, carriers ( name )")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CarrierSettlement[];
    },
    placeholderData: keepPreviousData,
  });
  useEffect(() => realtimeSubscribe("carrier_settlements", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return query;
}
