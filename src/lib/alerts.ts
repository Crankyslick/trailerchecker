/**
 * Mirrors the alert text produced by the database notification triggers
 * (notify_driver_assignment, notify_on_pod, notify_on_delayed) so the wording
 * can be asserted in tests and reused by the UI without a round trip.
 */

export type AlertType = "load_assigned" | "pod_captured" | "load_delayed";

export type Alert = {
  type: AlertType;
  title: string;
  body: string;
  link: string;
};

function suffix(label: string, value: string | null | undefined) {
  return value ? ` - ${label}${value}` : "";
}

export function assignmentAlert(load: {
  schedule_id: string;
  origin_name?: string | null;
  str_name?: string | null;
  outbound_trailer?: string | null;
}): Alert {
  return {
    type: "load_assigned",
    title: `New load assigned: ${load.schedule_id}`,
    body:
      `${load.origin_name ?? "Origin"} to ${load.str_name ?? "Destination"}` +
      suffix("trailer ", load.outbound_trailer),
    link: "/driver",
  };
}

export function podAlert(input: {
  load_id: string;
  schedule_id?: string | null;
  recipient_name: string;
  driver?: string | null;
  outbound_trailer?: string | null;
}): Alert {
  return {
    type: "pod_captured",
    title: `POD captured: ${input.schedule_id ?? "load"}`,
    body:
      `Signed by ${input.recipient_name}` +
      suffix("driver ", input.driver) +
      suffix("trailer ", input.outbound_trailer),
    link: `/history/${input.load_id}`,
  };
}

export function delayedAlert(load: {
  schedule_id: string;
  origin_name?: string | null;
  str_name?: string | null;
  driver?: string | null;
  exception_reason?: string | null;
}): Alert {
  return {
    type: "load_delayed",
    title: `Load delayed: ${load.schedule_id}`,
    body:
      `${load.origin_name ?? "Origin"} to ${load.str_name ?? "Destination"}` +
      suffix("driver ", load.driver) +
      suffix("", load.exception_reason),
    link: "/loads",
  };
}

/** A driver only gets an assignment alert when the driver actually changed. */
export function shouldAlertAssignment(
  previousDriverId: string | null,
  nextDriverId: string | null,
  driverUserId: string | null,
): boolean {
  if (!nextDriverId) return false;
  if (previousDriverId === nextDriverId) return false;
  return Boolean(driverUserId);
}

/** Dispatchers are alerted only on a real transition into Delayed. */
export function shouldAlertDelayed(previousStatus: string | null, nextStatus: string): boolean {
  return nextStatus === "Delayed" && previousStatus !== "Delayed";
}
