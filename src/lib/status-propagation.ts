/**
 * Status propagation: load -> leg -> shipment -> order.
 *
 * This mirrors, in TypeScript, the rules enforced by the database trigger
 * `propagate_load_status()` on `public.trailer_loads`. The database is the
 * source of truth; this module exists so the UI can predict and explain the
 * roll-up, and so the rules are covered by the test suite.
 */

import type { Database } from "@/integrations/supabase/types";

export type LoadStatus = Database["public"]["Enums"]["trailer_load_status"];
export type LegStatus = Database["public"]["Enums"]["leg_status"];
export type ShipmentStatus = Database["public"]["Enums"]["shipment_status"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** Load statuses that mean work is under way on the leg. */
const ACTIVE_STATUSES: LoadStatus[] = [
  "Heading To DC",
  "Loaded",
  "En Route",
  "Picked Up Return Trailer",
  "Returning",
  "At Yard",
  "Delivered",
  "Returned To DC",
];

/** Load statuses that finish the leg. */
const COMPLETING_STATUSES: LoadStatus[] = ["Completed"];

/**
 * Leg status a load status implies. `null` means "leave the hierarchy alone"
 * (an exception is a flag on the load, not a step backwards for the plan).
 */
export function legStatusForLoad(status: LoadStatus): LegStatus | null {
  if (COMPLETING_STATUSES.includes(status)) return "COMPLETED";
  if (ACTIVE_STATUSES.includes(status)) return "ACTIVE";
  if (status === "Assigned") return "PLANNED";
  return null; // Delayed / Exception are overlays
}

/** A completed leg is never pushed back to active by a later load update. */
export function nextLegStatus(current: LegStatus, loadStatus: LoadStatus): LegStatus {
  if (current === "CANCELLED") return current;
  const target = legStatusForLoad(loadStatus);
  if (target === null) return current;
  return target; // derived from the load: a reopened load reopens the leg
}

/** Pickup stop clears once the trailer is loaded; delivery stop on delivery. */
export function stopsCompletedBy(status: LoadStatus): {
  origin: boolean;
  destination: boolean;
} {
  const destination = ["Delivered", "Returned To DC", "Completed"].includes(status);
  const origin = destination || status === "Loaded" || status === "En Route";
  return { origin, destination };
}


/** A shipment is complete only when every one of its legs is done. */
export function rollUpShipmentStatus(
  current: ShipmentStatus,
  legStatuses: LegStatus[],
): ShipmentStatus {
  if (current === "CANCELLED") return current;
  if (legStatuses.length === 0) return current;
  const live = legStatuses.filter((s) => s !== "CANCELLED");
  if (live.length === 0) return current;
  if (live.every((s) => s === "COMPLETED")) return "COMPLETED";
  if (live.some((s) => s === "ACTIVE" || s === "COMPLETED")) return "IN_PROGRESS";
  return current === "IN_PROGRESS" || current === "COMPLETED" ? "PLANNED" : current;
}

/** An order closes only when every shipment carrying it is done. */
export function rollUpOrderStatus(
  current: OrderStatus,
  shipmentStatuses: ShipmentStatus[],
): OrderStatus {
  if (current === "CANCELLED") return current;
  if (shipmentStatuses.length === 0) return current;
  const live = shipmentStatuses.filter((s) => s !== "CANCELLED");
  if (live.length === 0) return current;
  if (live.every((s) => s === "COMPLETED")) return "CLOSED";
  return current === "CLOSED" ? "ALLOCATED" : current;
}
