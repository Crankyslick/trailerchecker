import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Link2, Truck } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useShipments, type StopRow, type LegWithLoad } from "@/hooks/use-orders";

export const Route = createFileRoute("/_authenticated/shipments")({
  beforeLoad: guard({ product: "trailer" }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  head: () => ({ meta: [{ title: "Shipments — Me Do Logistics" }] }),
  component: ShipmentsPage,
});

const STATUS_STYLE: Record<string, string> = {
  PLANNING: "bg-surface-2 text-foreground border-border",
  PLANNED: "bg-primary/15 text-primary border-primary/30",
  IN_PROGRESS: "bg-warning/15 text-warning border-warning/30",
  COMPLETED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-danger/15 text-danger border-danger/30",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`chip border ${STATUS_STYLE[status] ?? "bg-surface-2 text-foreground border-border"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ShipmentsPage() {
  const { data: shipments, isLoading } = useShipments();
  const { open } = Route.useSearch();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(open ? [open] : []));

  // If we arrived via a link from Orders with ?open=<shipmentId>, make sure
  // that shipment is expanded once the data has loaded.
  useEffect(() => {
    if (open) setExpanded((prev) => new Set(prev).add(open));
  }, [open]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Shipments</h1>
        <p className="text-sm text-muted-foreground">
          The planning unit for an order — its stops, its leg, and the load dispatched against that
          leg.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (shipments ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">
          No shipments yet — creating an order on the Orders page generates one automatically.
        </div>
      )}

      <div className="space-y-2">
        {(shipments ?? []).map((s) => {
          const isOpen = expanded.has(s.id);
          const sortedStops = [...s.stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
          const sortedLegs = [...s.legs].sort((a, b) => a.leg_sequence - b.leg_sequence);
          return (
            <div
              key={s.id}
              className={`rounded-lg border overflow-hidden ${
                open === s.id ? "border-primary" : "border-border"
              }`}
            >
              <button
                onClick={() => toggle(s.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface-2/50 text-left"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs">{s.shipment_number}</span>
                  <span className="text-xs text-muted-foreground">
                    {sortedStops.length} stop{sortedStops.length === 1 ? "" : "s"} ·{" "}
                    {sortedLegs.length} leg{sortedLegs.length === 1 ? "" : "s"}
                  </span>
                </div>
                <StatusPill status={s.status} />
              </button>

              {isOpen && (
                <div className="border-t border-border px-3 py-3 space-y-4 bg-surface-2/30">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Stops
                    </h3>
                    <ol className="space-y-1.5">
                      {sortedStops.map((stop) => (
                        <StopLine key={stop.id} stop={stop} />
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Leg{sortedLegs.length !== 1 ? "s" : ""}
                    </h3>
                    <div className="space-y-2">
                      {sortedLegs.map((leg) => (
                        <LegLine key={leg.id} leg={leg} stops={sortedStops} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StopLine({ stop }: { stop: StopRow }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="w-5 h-5 shrink-0 rounded-full bg-surface-2 border border-border grid place-items-center text-[10px] font-mono">
        {stop.stop_sequence}
      </span>
      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span
        className={`chip border text-[10px] ${
          stop.stop_type === "PICKUP"
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-success/10 text-success border-success/30"
        }`}
      >
        {stop.stop_type}
      </span>
      <span>{stop.location_name ?? "—"}</span>
      {stop.location_code && (
        <span className="font-mono text-xs text-muted-foreground">({stop.location_code})</span>
      )}
    </li>
  );
}

function LegLine({ leg, stops }: { leg: LegWithLoad; stops: StopRow[] }) {
  function stopLabel(id: string) {
    const s = stops.find((st) => st.id === id);
    return s ? `${s.stop_sequence}. ${s.location_name ?? "—"}` : id;
  }
  const load = leg.loads?.[0];

  return (
    <div className="rounded-md border border-border bg-surface p-2.5 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs">
          {stopLabel(leg.origin_stop_id)} → {stopLabel(leg.destination_stop_id)}
        </span>
        <span className={`chip border text-[10px] ${STATUS_STYLE[leg.status] ?? ""}`}>
          {leg.status}
        </span>
      </div>

      <div className="flex items-center gap-2 pl-5 text-xs">
        <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {load ? (
          <>
            <span className="chip border bg-primary/10 text-primary border-primary/30">
              {load.status}
            </span>
            <span className="text-muted-foreground">
              {load.driver ? `Driver: ${load.driver}` : "No driver assigned"}
              {load.outbound_trailer ? ` · Trailer ${load.outbound_trailer}` : ""}
              {load.pro_number ? ` · PRO ${load.pro_number}` : ""}
            </span>
            <Link to="/loads" className="text-primary hover:underline ml-auto">
              View in Load Board →
            </Link>
          </>
        ) : (
          <span className="text-muted-foreground">No load dispatched against this leg yet</span>
        )}
      </div>
    </div>
  );
}
