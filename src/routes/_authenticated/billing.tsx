import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Receipt, Upload } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useCurrentUser } from "@/hooks/use-auth";
import { QuickBooksPanel } from "@/components/QuickBooksPanel";
import { syncInvoicesToQbo } from "@/lib/qbo.functions";
import {
  useBillableLoads,
  setLoadFinancials,
  generateCustomerInvoice,
  generateCarrierSettlement,
  useCustomerInvoices,
  useCarrierSettlements,
  type BillableLoad,
} from "@/hooks/use-billing";

export const Route = createFileRoute("/_authenticated/billing")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Billing — Me Do Logistics" }] }),
  component: BillingPage,
});

function margin(l: BillableLoad) {
  if (l.customer_rate == null && l.carrier_pay == null) return null;
  return (l.customer_rate ?? 0) + (l.fuel_surcharge_amount ?? 0) - (l.carrier_pay ?? 0);
}

function BillingPage() {
  const { data: loads, isLoading } = useBillableLoads();
  const { data: invoices } = useCustomerInvoices();
  const { data: settlements } = useCarrierSettlements();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = loads ?? [];
  const totalMargin = rows.reduce((sum, l) => sum + (margin(l) ?? 0), 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedLoads = rows.filter((l) => selected.has(l.id));
  const selectedClientIds = new Set(selectedLoads.map((l) => l.client_id).filter(Boolean));
  const selectedCarrierIds = new Set(selectedLoads.map((l) => l.carrier_id).filter(Boolean));

  async function invoiceSelected() {
    if (selectedClientIds.size !== 1) {
      toast.error("Select loads for exactly one customer to invoice together");
      return;
    }
    const clientId = [...selectedClientIds][0] as string;
    try {
      await generateCustomerInvoice(clientId, [...selected]);
      toast.success("Invoice generated");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate invoice");
    }
  }

  async function settleSelected() {
    if (selectedCarrierIds.size !== 1) {
      toast.error("Select loads for exactly one carrier to settle together");
      return;
    }
    const carrierId = [...selectedCarrierIds][0] as string;
    try {
      await generateCarrierSettlement(carrierId, [...selected]);
      toast.success("Settlement generated");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate settlement");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Margin shown is linehaul + fuel surcharge − carrier pay; it does not include
            accessorials.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Linehaul margin, all loads shown</div>
          <div
            className={`text-lg font-semibold ${totalMargin >= 0 ? "text-success" : "text-danger"}`}
          >
            ${totalMargin.toFixed(2)}
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button
            onClick={invoiceSelected}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium"
          >
            <FileText className="h-3.5 w-3.5" /> Generate Invoice
          </button>
          <button
            onClick={settleSelected}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            <Receipt className="h-3.5 w-3.5" /> Generate Settlement
          </button>
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2">Load</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Carrier</th>
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">Fuel SC</th>
              <th className="text-right px-3 py-2">Carrier Pay</th>
              <th className="text-right px-3 py-2">Margin</th>
              <th className="text-left px-3 py-2">Invoice</th>
              <th className="text-left px-3 py-2">Settlement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <LoadFinancialRow
                key={l.id}
                load={l}
                selected={selected.has(l.id)}
                onToggle={() => toggle(l.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold mb-2">Customer invoices</h2>
          <div className="space-y-1.5">
            {(invoices ?? []).map((inv) => (
              <div
                key={inv.id}
                className="rounded-md border border-border p-2 flex items-center justify-between text-sm"
              >
                <span>
                  <span className="font-mono text-xs">{inv.invoice_number}</span> —{" "}
                  {inv.trailer_clients?.name ?? "—"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="chip border bg-surface-2 text-foreground border-border text-xs">
                    {inv.status}
                  </span>
                  <span className="font-medium">${inv.total_amount.toFixed(2)}</span>
                </span>
              </div>
            ))}
            {(invoices ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">None yet.</div>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-2">Carrier settlements</h2>
          <div className="space-y-1.5">
            {(settlements ?? []).map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-border p-2 flex items-center justify-between text-sm"
              >
                <span>
                  <span className="font-mono text-xs">{s.settlement_number}</span> —{" "}
                  {s.carriers?.name ?? "—"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="chip border bg-surface-2 text-foreground border-border text-xs">
                    {s.status}
                  </span>
                  <span className="font-medium">${s.total_amount.toFixed(2)}</span>
                </span>
              </div>
            ))}
            {(settlements ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">None yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadFinancialRow({
  load,
  selected,
  onToggle,
}: {
  load: BillableLoad;
  selected: boolean;
  onToggle: () => void;
}) {
  const [rate, setRate] = useState(load.customer_rate?.toString() ?? "");
  const [fuel, setFuel] = useState(load.fuel_surcharge_amount?.toString() ?? "0");
  const [pay, setPay] = useState(load.carrier_pay?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const m = useMemo(() => {
    const r = Number(rate) || 0;
    const f = Number(fuel) || 0;
    const p = Number(pay) || 0;
    return r + f - p;
  }, [rate, fuel, pay]);

  async function save() {
    setSaving(true);
    try {
      await setLoadFinancials({
        loadId: load.id,
        customerRate: rate ? Number(rate) : null,
        fuelSurchargeAmount: fuel ? Number(fuel) : 0,
        carrierPay: pay ? Number(pay) : null,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-border hover:bg-surface-2/50">
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={load.invoice_status === "INVOICED" && load.settlement_status === "SETTLED"}
        />
      </td>
      <td className="px-3 py-1.5 font-mono text-xs">{load.schedule_id}</td>
      <td className="px-3 py-1.5 text-xs">{load.trailer_clients?.name ?? "—"}</td>
      <td className="px-3 py-1.5 text-xs">{load.carriers?.name ?? "own fleet"}</td>
      <td className="px-3 py-1.5">
        <input
          className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-xs text-right"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={save}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          className="w-16 rounded border border-border bg-surface px-1.5 py-1 text-xs text-right"
          value={fuel}
          onChange={(e) => setFuel(e.target.value)}
          onBlur={save}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-xs text-right"
          value={pay}
          onChange={(e) => setPay(e.target.value)}
          onBlur={save}
        />
      </td>
      <td
        className={`px-3 py-1.5 text-right text-xs font-medium ${m >= 0 ? "text-success" : "text-danger"}`}
      >
        {saving ? "…" : `$${m.toFixed(2)}`}
      </td>
      <td className="px-3 py-1.5">
        <span className="chip border bg-surface-2 text-foreground border-border text-[10px]">
          {load.invoice_status}
        </span>
      </td>
      <td className="px-3 py-1.5">
        <span className="chip border bg-surface-2 text-foreground border-border text-[10px]">
          {load.settlement_status}
        </span>
      </td>
    </tr>
  );
}
