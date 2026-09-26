import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, MapPin, Link2 } from "lucide-react";
import { guard } from "@/lib/route-guard";
import {
  useShipments,
  addShipmentStop,
  addShipmentLeg,
  type StopRow,
  type LegRow,
} from "@/hooks/use-orders";

export const Route = createFileRoute("/_authenticated/shipments")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Shipments — VTCD Dispatch" }] }),
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
    <span className={`chip border ${STATUS_STYLE[status] ?? "bg-surface-2 text-foreground border-border"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ShipmentsPage() {
  const { data: shipments, isLoading } = useShipments();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
          Planning unit grouping one or more orders. Expand a shipment to see its stops (multi-stop) and
          legs (multi-leg / relay) and add more of either.
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
            <div key={s.id} className="rounded-lg border border-border overflow-hidden">
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
                    {sortedLegs.length > 1 ? " (relay)" : ""}
                  </span>
                </div>
                <StatusPill status={s.status} />
              </button>

              {isOpen && (
                <div className="border-t border-border px-3 py-3 space-y-4 bg-surface-2/30">
                  <StopsSection shipmentId={s.id} stops={sortedStops} />
                  <LegsSection shipmentId={s.id} legs={sortedLegs} stops={sortedStops} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StopsSection({ shipmentId, stops }: { shipmentId: string; stops: StopRow[] }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("Location name is required");
      return;
    }
    setSaving(true);
    try {
      await addShipmentStop({
        shipmentId,
        stopType: type,
        locationCode: code || null,
        locationName: name,
        earliest: null,
        latest: null,
      });
      toast.success("Stop added");
      setAdding(false);
      setName("");
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add stop");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stops</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Add stop
        </button>
      </div>
      <ol className="space-y-1.5">
        {stops.map((stop) => (
          <li key={stop.id} className="flex items-center gap-2 text-sm">
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
        ))}
      </ol>

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
          <select
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            value={type}
            onChange={(e) => setType(e.target.value as "PICKUP" | "DELIVERY")}
          >
            <option value="PICKUP">Pickup</option>
            <option value="DELIVERY">Delivery</option>
          </select>
          <input
            className="flex-1 min-w-[140px] rounded-md border border-border bg-surface px-2 py-1 text-xs"
            placeholder="Location name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-xs font-mono"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function LegsSection({
  shipmentId,
  legs,
  stops,
}: {
  shipmentId: string;
  legs: LegRow[];
  stops: StopRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [originId, setOriginId] = useState("");
  const [destId, setDestId] = useState("");
  const [saving, setSaving] = useState(false);

  function stopLabel(id: string) {
    const s = stops.find((st) => st.id === id);
    return s ? `${s.stop_sequence}. ${s.stop_type} — ${s.location_name ?? "—"}` : id;
  }

  async function submit() {
    if (!originId || !destId) {
      toast.error("Pick an origin and destination stop");
      return;
    }
    setSaving(true);
    try {
      await addShipmentLeg({ shipmentId, originStopId: originId, destinationStopId: destId });
      toast.success("Leg added — assign driver/trailer/carrier from Dispatch");
      setAdding(false);
      setOriginId("");
      setDestId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add leg");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Legs {legs.length > 1 && <span className="text-primary">(relay)</span>}
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Add leg
        </button>
      </div>
      <ol className="space-y-1.5">
        {legs.map((leg) => (
          <li key={leg.id} className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 shrink-0 rounded-full bg-surface-2 border border-border grid place-items-center text-[10px] font-mono">
              {leg.leg_sequence}
            </span>
            <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">
              {stopLabel(leg.origin_stop_id)} → {stopLabel(leg.destination_stop_id)}
            </span>
            <span className={`chip border text-[10px] ${STATUS_STYLE[leg.status] ?? ""}`}>{leg.status}</span>
          </li>
        ))}
      </ol>

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
          <select
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs min-w-[160px]"
            value={originId}
            onChange={(e) => setOriginId(e.target.value)}
          >
            <option value="">Origin stop…</option>
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.stop_sequence}. {s.stop_type} — {s.location_name}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">→</span>
          <select
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs min-w-[160px]"
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
          >
            <option value="">Destination stop…</option>
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.stop_sequence}. {s.stop_type} — {s.location_name}
              </option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
