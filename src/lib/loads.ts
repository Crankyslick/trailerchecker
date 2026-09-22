import type { Database } from "@/integrations/supabase/types";

export type LoadRow = Database["public"]["Tables"]["trailer_loads"]["Row"];
export type LoadUpdate = Database["public"]["Tables"]["trailer_loads"]["Update"];
export type LoadStatus = Database["public"]["Enums"]["trailer_load_status"];
export type TrailerLocation = Database["public"]["Enums"]["trailer_location"];

export const LOAD_STATUSES: LoadStatus[] = [
  "Assigned",
  "Heading To DC",
  "Loaded",
  "En Route",
  "Delivered",
  "Picked Up Return Trailer",
  "Returning",
  "At Yard",
  "Returned To DC",
  "Completed",
  "Delayed",
  "Exception",
];

export const TRAILER_LOCATIONS: TrailerLocation[] = [
  "DC",
  "Store",
  "Returning",
  "Yard",
  "Returned To DC",
];

export type YardPolicy = {
  /** Contractual turnaround deadline, in hours. */
  deadlineHours: number;
  /** Past this, the trailer is critically overdue. */
  criticalHours: number;
};

/**
 * Shipped default yard aging policy. The live value is per company and comes
 * from `company_settings` (see useYardPolicy) — every screen (board, yard
 * page, ticker, reports) derives colours and labels from the same numbers.
 */
export const YARD_POLICY: YardPolicy = {
  deadlineHours: 24,
  criticalHours: 48,
};

export function yardHours(yardArrivalAt: string | null): number | null {
  if (!yardArrivalAt) return null;
  return (Date.now() - new Date(yardArrivalAt).getTime()) / 3_600_000;
}

export function yardTier(
  hours: number | null,
  policy: YardPolicy = YARD_POLICY,
): "green" | "yellow" | "red" | "none" {
  if (hours == null) return "none";
  if (hours < policy.deadlineHours) return "green";
  if (hours < policy.criticalHours) return "yellow";
  return "red";
}

export type YardBadge = { label: string; cls: string; bar: string };

/** Ticker/priority presentation derived from the same thresholds as yardTier. */
export function yardBadge(hours: number | null, policy: YardPolicy = YARD_POLICY): YardBadge {
  switch (yardTier(hours, policy)) {
    case "red":
      return {
        label: "CRITICAL",
        cls: "bg-danger/20 text-danger border-danger/40 animate-pulse",
        bar: "bg-danger",
      };
    case "yellow":
      return {
        label: "OVERDUE",
        cls: "bg-warning/20 text-warning border-warning/40",
        bar: "bg-warning",
      };
    case "green":
      return {
        label: "OK",
        cls: "bg-success/15 text-success border-success/30",
        bar: "bg-success",
      };
    default:
      return { label: "—", cls: "bg-muted text-muted-foreground border-border", bar: "bg-muted" };
  }
}

export function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  const totalMin = Math.floor(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function statusColor(status: LoadStatus): string {
  switch (status) {
    case "Completed":
    case "Returned To DC":
      return "bg-success/15 text-success border-success/30";
    case "Delayed":
    case "Exception":
      return "bg-danger/15 text-danger border-danger/30";
    case "At Yard":
      return "bg-warning/15 text-warning border-warning/30";
    case "En Route":
    case "Returning":
      return "bg-info/15 text-info border-info/30";
    case "Delivered":
    case "Picked Up Return Trailer":
      return "bg-primary/15 text-primary border-primary/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function locationColor(loc: TrailerLocation): string {
  switch (loc) {
    case "Yard":
      return "bg-warning/15 text-warning border-warning/30";
    case "Returning":
      return "bg-info/15 text-info border-info/30";
    case "Store":
      return "bg-primary/15 text-primary border-primary/30";
    case "Returned To DC":
      return "bg-success/15 text-success border-success/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
