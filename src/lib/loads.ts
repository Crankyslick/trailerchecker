import type { Database } from "@/integrations/supabase/types";

export type LoadRow = Database["public"]["Tables"]["loads"]["Row"];
export type LoadUpdate = Database["public"]["Tables"]["loads"]["Update"];
export type LoadStatus = Database["public"]["Enums"]["load_status"];
export type TrailerLocation = Database["public"]["Enums"]["trailer_location"];

export const LOAD_STATUSES: LoadStatus[] = [
  "Assigned","Heading To DC","Loaded","En Route","Delivered",
  "Picked Up Return Trailer","Returning","At Yard","Returned To DC",
  "Completed","Delayed","Exception",
];

export const TRAILER_LOCATIONS: TrailerLocation[] = [
  "DC","Store","Returning","Yard","Returned To DC",
];

export function yardHours(yardArrivalAt: string | null): number | null {
  if (!yardArrivalAt) return null;
  return (Date.now() - new Date(yardArrivalAt).getTime()) / 3_600_000;
}

export function yardTier(hours: number | null): "green" | "yellow" | "red" | "none" {
  if (hours == null) return "none";
  if (hours < 24) return "green";
  if (hours < 48) return "yellow";
  return "red";
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
    case "Yard": return "bg-warning/15 text-warning border-warning/30";
    case "Returning": return "bg-info/15 text-info border-info/30";
    case "Store": return "bg-primary/15 text-primary border-primary/30";
    case "Returned To DC": return "bg-success/15 text-success border-success/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
