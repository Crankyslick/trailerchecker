import { useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reportDataHealth } from "@/lib/data-health";

// Local types for the new order/shipment/stop/leg tables. These are not yet
// in src/integrations/supabase/types.ts — that file is Supabase-CLI generated
// and needs `supabase gen types typescript` re-run against the migrated DB.
// Once regenerated, swap these for Database["public"]["Tables"][...]["Row"].
export type OrderStatus = "OPEN" | "PARTIALLY_ALLOCATED" | "ALLOCATED" | "CANCELLED" | "CLOSED";
export type ShipmentStatus = "PLANNING" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type StopType = "PICKUP" | "DELIVERY";
export type LegStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type OrderRow = {
  id: string;
  company_id: string;
  order_number: string;
  client_id: string | null;
  commodity_description: string | null;
  total_weight: number | null;
  total_pieces: number | null;
  total_pallets: number | null;
  service_level: string | null;
  ready_datetime: string | null;
  requested_delivery_datetime: string | null;
  status: OrderStatus;
  root_id: string;
  version: number;
  superseded_by_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentRow = {
  id: string;
  company_id: string;
  shipment_number: string;
  status: ShipmentStatus;
  root_id: string;
  version: number;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StopRow = {
  id: string;
  company_id: string;
  shipment_id: string;
  stop_sequence: number;
  stop_type: StopType;
  location_code: string | null;
  location_name: string | null;
  earliest_datetime: string | null;
  latest_datetime: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type LegRow = {
  id: string;
  company_id: string;
  shipment_id: string;
  leg_sequence: number;
  origin_stop_id: string;
  destination_stop_id: string;
  status: LegStatus;
  root_id: string;
  version: number;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Client = { id: string; name: string };

// The generated Database type (src/integrations/supabase/types.ts) doesn't
// know about orders/shipments/stops/legs or the new RPCs until
// `supabase gen types typescript` is re-run against the migrated DB. This
// alias scopes the `as any` escape hatch to just those calls below, rather
// than losing type-safety on the rest of the file.
const sb = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
  rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
};

function realtimeSubscribe(table: string, onChange: () => void) {
  let ch: ReturnType<typeof supabase.channel> | undefined;
  try {
    ch = supabase.channel(`${table}-stream-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => void onChange()).subscribe();
  } catch (e) {
    console.error(`[realtime:${table}] subscribe failed`, e);
  }
  return () => {
    try {
      if (ch) supabase.removeChannel(ch);
    } catch {
      /* noop */
    }
  };
}

/** Customers for the order-entry dropdown. */
export function useClients() {
  return useQuery({
    queryKey: ["trailer_clients"],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await sb.from("trailer_clients").select("id, name").order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Client[];
    },
    placeholderData: keepPreviousData,
  });
}

/** Order list — most recent first. */
export function useOrders() {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await sb
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as OrderRow[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("orders", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  useEffect(() => realtimeSubscribe("orders", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

/** Shipments with their stops and legs nested, most recent first. */
export function useShipments() {
  const query = useQuery({
    queryKey: ["shipments"],
    queryFn: async (): Promise<(ShipmentRow & { stops: StopRow[]; legs: LegRow[] })[]> => {
      const { data, error } = await sb
        .from("shipments")
        .select("*, stops(*), legs(*)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as (ShipmentRow & { stops: StopRow[]; legs: LegRow[] })[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("shipments", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  useEffect(() => realtimeSubscribe("shipments", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => realtimeSubscribe("stops", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => realtimeSubscribe("legs", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export type CreateOrderInput = {
  clientId: string | null;
  commodityDescription: string | null;
  totalWeight: number | null;
  totalPieces: number | null;
  totalPallets: number | null;
  serviceLevel: string | null;
  readyDatetime: string | null;
  requestedDeliveryDatetime: string | null;
  shipperName: string;
  shipperCode: string | null;
  consigneeName: string;
  consigneeCode: string | null;
};

export async function createOrder(input: CreateOrderInput) {
  const { data, error } = await sb.rpc("create_order_with_shipment", {
    p_client_id: input.clientId,
    p_commodity_description: input.commodityDescription,
    p_total_weight: input.totalWeight,
    p_total_pieces: input.totalPieces,
    p_total_pallets: input.totalPallets,
    p_service_level: input.serviceLevel,
    p_ready_datetime: input.readyDatetime,
    p_requested_delivery_datetime: input.requestedDeliveryDatetime,
    p_shipper_name: input.shipperName,
    p_shipper_code: input.shipperCode,
    p_consignee_name: input.consigneeName,
    p_consignee_code: input.consigneeCode,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function addShipmentStop(input: {
  shipmentId: string;
  stopType: "PICKUP" | "DELIVERY";
  locationCode: string | null;
  locationName: string;
  earliest: string | null;
  latest: string | null;
}) {
  const { error } = await sb.rpc("add_shipment_stop", {
    p_shipment_id: input.shipmentId,
    p_stop_type: input.stopType,
    p_location_code: input.locationCode,
    p_location_name: input.locationName,
    p_earliest: input.earliest,
    p_latest: input.latest,
  });
  if (error) throw new Error(error.message);
}

export async function addShipmentLeg(input: {
  shipmentId: string;
  originStopId: string;
  destinationStopId: string;
}) {
  const { error } = await sb.rpc("add_shipment_leg", {
    p_shipment_id: input.shipmentId,
    p_origin_stop_id: input.originStopId,
    p_destination_stop_id: input.destinationStopId,
  });
  if (error) throw new Error(error.message);
}
