import { cn } from "@/lib/utils";
import type { LoadStatus, TrailerLocation } from "@/lib/loads";
import { statusColor, locationColor, yardTier } from "@/lib/loads";

export function StatusChip({ status }: { status: LoadStatus }) {
  return <span className={cn("chip border", statusColor(status))}>{status}</span>;
}

export function LocationChip({ location }: { location: TrailerLocation }) {
  return <span className={cn("chip border", locationColor(location))}>{location}</span>;
}

export function YardChip({ hours }: { hours: number | null }) {
  const tier = yardTier(hours);
  if (tier === "none") return <span className="text-muted-foreground text-xs">—</span>;
  const cls = tier === "green"
    ? "bg-success/15 text-success border-success/30"
    : tier === "yellow"
    ? "bg-warning/15 text-warning border-warning/30"
    : "bg-danger/15 text-danger border-danger/30";
  const total = Math.floor((hours ?? 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return (
    <span className={cn("chip border tabular-nums", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        tier === "green" ? "bg-success" : tier === "yellow" ? "bg-warning" : "bg-danger animate-pulse")} />
      {h}h {m.toString().padStart(2, "0")}m
    </span>
  );
}
