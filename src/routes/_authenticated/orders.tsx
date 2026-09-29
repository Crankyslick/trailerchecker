import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, X, ArrowRight } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useOrders, useClients, createOrder, type OrderWithShipment } from "@/hooks/use-orders";

export const Route = createFileRoute("/_authenticated/orders")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Orders — Me Do Logistics" }] }),
  component: OrdersPage,
});

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-surface-2 text-foreground border-border",
  PARTIALLY_ALLOCATED: "bg-warning/15 text-warning border-warning/30",
  ALLOCATED: "bg-primary/15 text-primary border-primary/30",
  CANCELLED: "bg-danger/15 text-danger border-danger/30",
  CLOSED: "bg-success/15 text-success border-success/30",
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

function OrdersPage() {
  const { data: orders, isLoading } = useOrders();
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Customer intent — shipper, consignee, commodity, weight/pieces/pallets. Each order gets
            its own shipment, stops, and leg automatically.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Order
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Order #</th>
              <th className="text-left px-3 py-2">Origin → Destination</th>
              <th className="text-left px-3 py-2">Commodity</th>
              <th className="text-right px-3 py-2">Weight</th>
              <th className="text-right px-3 py-2">Pcs / Plts</th>
              <th className="text-left px-3 py-2">Service</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Shipment</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && (orders ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No orders yet. Create one to generate its shipment, stops, and leg.
                </td>
              </tr>
            )}
            {(orders ?? []).map((o: OrderWithShipment) => {
              const shipment = o.shipment_orders?.[0]?.shipments;
              const stops = shipment
                ? [...shipment.stops].sort((a, b) => a.stop_sequence - b.stop_sequence)
                : [];
              const pickup = stops.find((st) => st.stop_type === "PICKUP");
              const delivery = stops.find((st) => st.stop_type === "DELIVERY");
              return (
                <tr key={o.id} className="border-t border-border hover:bg-surface-2/50">
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-flex items-center gap-1">
                      {pickup?.location_name ?? "—"}
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      {delivery?.location_name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{o.commodity_description ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {o.total_weight != null ? `${o.total_weight} lb` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {o.total_pieces ?? "—"} / {o.total_pallets ?? "—"}
                  </td>
                  <td className="px-3 py-2">{o.service_level ?? "Standard"}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-3 py-2">
                    {shipment ? (
                      <Link
                        to="/shipments"
                        search={{ open: shipment.id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                      >
                        {shipment.shipment_number} →
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && <NewOrderModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewOrderModal({ onClose }: { onClose: () => void }) {
  const { data: clients } = useClients();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientId: "",
    commodityDescription: "",
    totalWeight: "",
    totalPieces: "",
    totalPallets: "",
    serviceLevel: "Standard",
    readyDatetime: "",
    requestedDeliveryDatetime: "",
    shipperName: "",
    shipperCode: "",
    consigneeName: "",
    consigneeCode: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.shipperName.trim() || !form.consigneeName.trim()) {
      toast.error("Shipper and consignee are required");
      return;
    }
    setSaving(true);
    try {
      await createOrder({
        clientId: form.clientId || null,
        commodityDescription: form.commodityDescription || null,
        totalWeight: form.totalWeight ? Number(form.totalWeight) : null,
        totalPieces: form.totalPieces ? Number(form.totalPieces) : null,
        totalPallets: form.totalPallets ? Number(form.totalPallets) : null,
        serviceLevel: form.serviceLevel || null,
        readyDatetime: form.readyDatetime ? new Date(form.readyDatetime).toISOString() : null,
        requestedDeliveryDatetime: form.requestedDeliveryDatetime
          ? new Date(form.requestedDeliveryDatetime).toISOString()
          : null,
        shipperName: form.shipperName,
        shipperCode: form.shipperCode || null,
        consigneeName: form.consigneeName,
        consigneeCode: form.consigneeCode || null,
      });
      toast.success("Order created — shipment, stops, and leg generated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold">New Order</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Customer</label>
            <select
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={form.clientId}
              onChange={(e) => set("clientId", e.target.value)}
            >
              <option value="">— none —</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Shipper (pickup) *</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.shipperName}
                onChange={(e) => set("shipperName", e.target.value)}
                placeholder="Name / DC"
              />
              <input
                className="w-full mt-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                value={form.shipperCode}
                onChange={(e) => set("shipperCode", e.target.value)}
                placeholder="Code (optional)"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Consignee (delivery) *
              </label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.consigneeName}
                onChange={(e) => set("consigneeName", e.target.value)}
                placeholder="Name / store"
              />
              <input
                className="w-full mt-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                value={form.consigneeCode}
                onChange={(e) => set("consigneeCode", e.target.value)}
                placeholder="Code (optional)"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Commodity</label>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={form.commodityDescription}
              onChange={(e) => set("commodityDescription", e.target.value)}
              placeholder="e.g. Grocery — dry goods"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Weight (lb)</label>
              <input
                type="number"
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.totalWeight}
                onChange={(e) => set("totalWeight", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Pieces</label>
              <input
                type="number"
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.totalPieces}
                onChange={(e) => set("totalPieces", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Pallets</label>
              <input
                type="number"
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.totalPallets}
                onChange={(e) => set("totalPallets", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Ready (pickup window)
              </label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.readyDatetime}
                onChange={(e) => set("readyDatetime", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Requested delivery</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={form.requestedDeliveryDatetime}
                onChange={(e) => set("requestedDeliveryDatetime", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Service level</label>
            <select
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={form.serviceLevel}
              onChange={(e) => set("serviceLevel", e.target.value)}
            >
              <option>Standard</option>
              <option>Expedited</option>
              <option>White Glove</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
