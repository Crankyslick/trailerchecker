import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useRateAgreements, createRateAgreement, type RateAgreement } from "@/hooks/use-billing";
import { useClients } from "@/hooks/use-orders";
import { CustomerModal } from "@/components/CustomerModal";

export const Route = createFileRoute("/_authenticated/rates")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Rates — Me Do Logistics" }] }),
  component: RatesPage,
});

function RatesPage() {
  const { data: rates, isLoading } = useRateAgreements();
  const { data: clients } = useClients();
  const [open, setOpen] = useState(false);
  const clientName = (id: string | null) =>
    clients?.find((c) => c.id === id)?.name ?? "Any customer";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Rate Agreements</h1>
          <p className="text-sm text-muted-foreground">
            Reusable lane pricing — apply one to a load from Billing.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Rate
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (rates ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">No rate agreements yet.</div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Lane</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">Fuel SC %</th>
            </tr>
          </thead>
          <tbody>
            {(rates ?? []).map((r: RateAgreement) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{clientName(r.client_id)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.origin_code ?? "Any"} → {r.destination_code ?? "Any"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.rate_type === "PER_MILE" ? "Per mile" : "Flat"}
                </td>
                <td className="px-3 py-2 text-right">${r.linehaul_rate.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{r.fuel_surcharge_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <NewRateModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewRateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: clients } = useClients();
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [clientId, setClientId] = useState("");
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [rateType, setRateType] = useState<"FLAT" | "PER_MILE">("FLAT");
  const [rate, setRate] = useState("");
  const [fuelPct, setFuelPct] = useState("0");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!rate || Number.isNaN(Number(rate))) {
      toast.error("A rate is required");
      return;
    }
    setSaving(true);
    try {
      await createRateAgreement({
        clientId: clientId || null,
        originCode: origin || null,
        destinationCode: dest || null,
        rateType,
        linehaulRate: Number(rate),
        fuelSurchargePct: Number(fuelPct) || 0,
      });
      await qc.invalidateQueries({ queryKey: ["rate_agreements"] });
      toast.success("Rate agreement created");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create rate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          New Rate Agreement
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-muted-foreground">Customer</label>
              <button
                type="button"
                onClick={() => setAddingCustomer(true)}
                className="text-xs text-primary hover:underline"
              >
                + Add customer
              </button>
            </div>
            <select
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">— any —</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Origin code</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Destination code</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Type</label>
              <select
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={rateType}
                onChange={(e) => setRateType(e.target.value as "FLAT" | "PER_MILE")}
              >
                <option value="FLAT">Flat</option>
                <option value="PER_MILE">Per mile</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rate $</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Fuel SC %</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={fuelPct}
                onChange={(e) => setFuelPct(e.target.value)}
              />
            </div>
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
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
