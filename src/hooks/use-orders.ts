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

export type LoadSummary = {
  id: string;
  driver: string | null;
  outbound_trailer: string | null;
  return_trailer: string | null;
  status: string;
  pro_number: string | null;
};

export type LegWithLoad = LegRow & { loads: LoadSummary[] };
export type ShipmentWithDetail = ShipmentRow & { stops: StopRow[]; legs: LegWithLoad[] };
export type OrderWithShipment = OrderRow & {
  shipment_orders: { shipment_id: string; shipments: ShipmentWithDetail }[];
};

const LEG_LOAD_EMBED = `*, loads:trailer_loads ( id, driver, outbound_trailer, return_trailer, status, pro_number )`;

/** Order list with each order's shipment, stops, legs, and dispatched load embedded. */
export function useOrders() {
  const query = useQuery({
    queryKey: ["orders", "with-shipment"],
    queryFn: async (): Promise<OrderWithShipment[]> => {
      const { data, error } = await sb
        .from("orders")
        .select(
          `*, shipment_orders ( shipment_id, shipments ( *, stops (*), legs (${LEG_LOAD_EMBED}) ) )`,
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as OrderWithShipment[];
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
  useEffect(() => realtimeSubscribe("shipments", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => realtimeSubscribe("trailer_loads", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

/** Shipments with their stops, legs, and each leg's dispatched load embedded. */
export function useShipments() {
  const query = useQuery({
    queryKey: ["shipments", "with-detail"],
    queryFn: async (): Promise<ShipmentWithDetail[]> => {
      const { data, error } = await sb
        .from("shipments")
        .select(`*, stops (*), legs (${LEG_LOAD_EMBED})`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as ShipmentWithDetail[];
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
  useEffect(() => realtimeSubscribe("trailer_loads", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

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

// ---------------------------------------------------------------------------
// Load-planning workspace: equipment, plannable legs, and the assign action.
// ---------------------------------------------------------------------------

export type Equipment = {
  id: string;
  equipment_number: string;
  equipment_type: string;
  status: string;
};

export function useEquipment() {
  const query = useQuery({
    queryKey: ["equipment"],
    queryFn: async (): Promise<Equipment[]> => {
      const { data, error } = await sb
        .from("equipment")
        .select("id, equipment_number, equipment_type, status")
        .order("equipment_number");
      if (error) throw new Error(error.message);
      return (data ?? []) as Equipment[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("equipment", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export type HaulType = "INTERNAL" | "BROKERED_OUT";

export type PlanningLeg = {
  id: string;
  leg_sequence: number;
  status: LegStatus;
  shipments: { id: string; shipment_number: string; status: string } | null;
  origin: { location_name: string | null; location_code: string | null } | null;
  destination: { location_name: string | null; location_code: string | null } | null;
  loads: {
    id: string;
    driver_id: string | null;
    equipment_id: string | null;
    carrier_id: string | null;
    tractor_id: string | null;
    broker_id: string | null;
    rate_confirmation_id: string | null;
    haul_type: HaulType;
    driver: string | null;
    outbound_trailer: string | null;
    status: string;
  }[];
  tenders: {
    id: string;
    carrier_id: string;
    status: TenderStatus;
    offered_rate: number | null;
    offered_at: string;
    response_token: string | null;
  }[];
};

/** Every leg, with its shipment, both stop ends, its load, and any tenders embedded. */
export function usePlanningLegs() {
  const query = useQuery({
    queryKey: ["legs", "planning"],
    queryFn: async (): Promise<PlanningLeg[]> => {
      const { data, error } = await sb
        .from("legs")
        .select(
          `id, leg_sequence, status,
           shipments ( id, shipment_number, status ),
           origin:stops!legs_origin_stop_id_fkey ( location_name, location_code ),
           destination:stops!legs_destination_stop_id_fkey ( location_name, location_code ),
           loads:trailer_loads ( id, driver_id, equipment_id, carrier_id, tractor_id, broker_id, rate_confirmation_id, haul_type, driver, outbound_trailer, status ),
           tenders ( id, carrier_id, status, offered_rate, offered_at, response_token )`,
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PlanningLeg[];
    },
    retry: 2,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    reportDataHealth("planning-legs", {
      error: query.error ? (query.error as Error).message : null,
      updatedAt: query.dataUpdatedAt || null,
    });
  }, [query.error, query.dataUpdatedAt]);

  useEffect(() => realtimeSubscribe("legs", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => realtimeSubscribe("trailer_loads", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => realtimeSubscribe("tenders", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function planLeg(input: {
  legId: string;
  driverId: string | null;
  equipmentId: string | null;
}) {
  const { data, error } = await sb.rpc("plan_leg", {
    p_leg_id: input.legId,
    p_driver_id: input.driverId,
    p_equipment_id: input.equipmentId,
  });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Carriers + tendering
// ---------------------------------------------------------------------------

export type Carrier = {
  id: string;
  name: string;
  scac_code: string | null;
  mc_number: string | null;
  dot_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
};

export function useCarriers() {
  const query = useQuery({
    queryKey: ["carriers"],
    queryFn: async (): Promise<Carrier[]> => {
      const { data, error } = await sb
        .from("carriers")
        .select(
          "id, name, scac_code, mc_number, dot_number, contact_name, contact_email, contact_phone, status",
        )
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Carrier[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("carriers", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function createCarrier(input: {
  name: string;
  scacCode: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}) {
  const { error } = await sb.from("carriers").insert({
    name: input.name,
    scac_code: input.scacCode,
    mc_number: input.mcNumber,
    dot_number: input.dotNumber,
    contact_name: input.contactName ?? null,
    contact_email: input.contactEmail ?? null,
    contact_phone: input.contactPhone ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Direct table update — RLS's existing "company write carriers" policy
 * already permits this for dispatcher/admin, so no new RPC is needed. */
export async function updateCarrier(
  id: string,
  patch: Partial<{
    name: string;
    scacCode: string | null;
    mcNumber: string | null;
    dotNumber: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    status: string;
  }>,
) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.scacCode !== undefined) row.scac_code = patch.scacCode;
  if (patch.mcNumber !== undefined) row.mc_number = patch.mcNumber;
  if (patch.dotNumber !== undefined) row.dot_number = patch.dotNumber;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
  if (patch.status !== undefined) row.status = patch.status;

  const { error } = await sb.from("carriers").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export type TenderStatus = "OFFERED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "RESCINDED";
export type Tender = {
  id: string;
  leg_id: string;
  carrier_id: string;
  status: TenderStatus;
  offered_rate: number | null;
  offered_at: string;
  responded_at: string | null;
  response_token?: string | null;
};

export async function createTender(input: {
  legId: string;
  carrierId: string;
  offeredRate: number | null;
}): Promise<{ responseToken: string | null }> {
  const { data, error } = await sb.rpc("create_tender", {
    p_leg_id: input.legId,
    p_carrier_id: input.carrierId,
    p_offered_rate: input.offeredRate,
    p_expires_at: null,
  });
  if (error) throw new Error(error.message);
  const row = data as { response_token?: string | null } | null;
  return { responseToken: row?.response_token ?? null };
}

export async function respondToTender(input: {
  tenderId: string;
  response: "ACCEPTED" | "REJECTED";
}) {
  const { error } = await sb.rpc("respond_to_tender", {
    p_tender_id: input.tenderId,
    p_response: input.response,
    p_response_notes: null,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Carrier-owned fleet: tractors, brokers, and rate confirmations.
//
// None of these are required to complete a load — a load is fully valid
// with only driver_id/equipment_id set (the in-house path plan_leg already
// supports). These exist so an in-house haul can also record its tractor,
// who brokered the freight in, and the rate-confirmation document, without
// touching the carriers/tenders screens at all.
// ---------------------------------------------------------------------------

export type Tractor = {
  id: string;
  unit_number: string;
  vin: string | null;
  plate_number: string | null;
  status: string;
};

export function useTractors() {
  const query = useQuery({
    queryKey: ["tractors"],
    queryFn: async (): Promise<Tractor[]> => {
      const { data, error } = await sb
        .from("tractors")
        .select("id, unit_number, vin, plate_number, status")
        .order("unit_number");
      if (error) throw new Error(error.message);
      return (data ?? []) as Tractor[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("tractors", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function createTractor(input: {
  unitNumber: string;
  vin?: string | null;
  plateNumber?: string | null;
}) {
  const { error } = await sb.from("tractors").insert({
    unit_number: input.unitNumber,
    vin: input.vin ?? null,
    plate_number: input.plateNumber ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Direct table update — RLS's "company write tractors" policy already
 * permits this for dispatcher/admin, so no new RPC is needed. */
export async function updateTractor(
  id: string,
  patch: Partial<{
    unitNumber: string;
    vin: string | null;
    plateNumber: string | null;
    status: string;
  }>,
) {
  const row: Record<string, unknown> = {};
  if (patch.unitNumber !== undefined) row.unit_number = patch.unitNumber;
  if (patch.vin !== undefined) row.vin = patch.vin;
  if (patch.plateNumber !== undefined) row.plate_number = patch.plateNumber;
  if (patch.status !== undefined) row.status = patch.status;

  const { error } = await sb.from("tractors").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export type Broker = {
  id: string;
  name: string;
  mc_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
};

/** Brokers who tender freight TO this company — distinct from trailer_clients
 * (this company's own direct shipper) and from carriers (who this company
 * tenders loads OUT to). */
export function useBrokers() {
  const query = useQuery({
    queryKey: ["brokers"],
    queryFn: async (): Promise<Broker[]> => {
      const { data, error } = await sb
        .from("brokers")
        .select("id, name, mc_number, contact_name, contact_email, contact_phone, active")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Broker[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("brokers", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function createBroker(input: {
  name: string;
  mcNumber?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}) {
  const { error } = await sb.from("brokers").insert({
    name: input.name,
    mc_number: input.mcNumber ?? null,
    contact_name: input.contactName ?? null,
    contact_email: input.contactEmail ?? null,
    contact_phone: input.contactPhone ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Direct table update — RLS's "company write brokers" policy already
 * permits this for dispatcher/admin, so no new RPC is needed. */
export async function updateBroker(
  id: string,
  patch: Partial<{
    name: string;
    mcNumber: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    active: boolean;
  }>,
) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.mcNumber !== undefined) row.mc_number = patch.mcNumber;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
  if (patch.active !== undefined) row.active = patch.active;

  const { error } = await sb.from("brokers").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export type RateConfirmation = {
  id: string;
  rc_number: string | null;
  broker_id: string | null;
  client_id: string | null;
  operating_carrier_name: string | null;
  operating_mc_number: string | null;
  operating_dot_number: string | null;
  total_rate: number | null;
  issued_at: string;
  document_url: string | null;
};

export function useRateConfirmations() {
  const query = useQuery({
    queryKey: ["rate-confirmations"],
    queryFn: async (): Promise<RateConfirmation[]> => {
      const { data, error } = await sb
        .from("rate_confirmations")
        .select(
          "id, rc_number, broker_id, client_id, operating_carrier_name, operating_mc_number, operating_dot_number, total_rate, issued_at, document_url",
        )
        .order("issued_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as RateConfirmation[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("rate_confirmations", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

/** operatingMcNumber/operatingDotNumber/operatingCarrierName left unset fall
 * back to this company's own MC/DOT via the database trigger — the default
 * for the carrier-owned-fleet model. */
export async function createRateConfirmation(input: {
  rcNumber?: string | null;
  brokerId?: string | null;
  clientId?: string | null;
  operatingCarrierName?: string | null;
  operatingMcNumber?: string | null;
  operatingDotNumber?: string | null;
  totalRate?: number | null;
  documentUrl?: string | null;
}): Promise<string> {
  const { data, error } = await sb
    .from("rate_confirmations")
    .insert({
      rc_number: input.rcNumber ?? null,
      broker_id: input.brokerId ?? null,
      client_id: input.clientId ?? null,
      operating_carrier_name: input.operatingCarrierName ?? null,
      operating_mc_number: input.operatingMcNumber ?? null,
      operating_dot_number: input.operatingDotNumber ?? null,
      total_rate: input.totalRate ?? null,
      document_url: input.documentUrl ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Attaches a tractor, broker and/or rate confirmation to an existing load —
 * validated server-side so none of them can belong to another company. Any
 * argument left null leaves that field on the load unchanged. */
export async function assignLoadParties(input: {
  loadId: string;
  tractorId?: string | null;
  brokerId?: string | null;
  rateConfirmationId?: string | null;
}) {
  const { error } = await sb.rpc("assign_load_parties", {
    p_load_id: input.loadId,
    p_tractor_id: input.tractorId ?? null,
    p_broker_id: input.brokerId ?? null,
    p_rate_confirmation_id: input.rateConfirmationId ?? null,
  });
  if (error) throw new Error(error.message);
}
