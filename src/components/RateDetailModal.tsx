import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
import type { RateAgreement } from "@/hooks/use-billing";
import {
  useRateHistory,
  useRateBreaks,
  reviseRate,
  addRateBreak,
  deleteRateBreak,
  updateRateExtras,
} from "@/hooks/use-commercial";

const input = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

export function RateDetailModal({ rate, onClose }: { rate: RateAgreement; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: history = [] } = useRateHistory(rate.root_id);
  const { data: breaks = [], refetch: refetchBreaks } = useRateBreaks(rate.id);
  const [newRate, setNewRate] = useState(String(rate.linehaul_rate));
  const [newFuel, setNewFuel] = useState(String(rate.fuel_surcharge_pct));
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [contract, setContract] = useState(rate.contract_number ?? "");
  const [stopRate, setStopRate] = useState(String(rate.additional_stop_rate ?? 0));
  const [br, setBr] = useState({ min: "", max: "", rate: "" });

  async function revise() {
    const r = Number(newRate);
    const f = Number(newFuel);
    if (Number.isNaN(r) || r < 0 || Number.isNaN(f) || f < 0) return toast.error("Enter valid numbers");
    try {
      await reviseRate({ id: rate.id, linehaulRate: r, fuelSurchargePct: f, effectiveStart: start });
      await qc.invalidateQueries({ queryKey: ["rate_agreements"] });
      toast.success(`Saved as version ${rate.version + 1}; previous version kept in history`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revise rate");
    }
  }

  async function saveExtras() {
    const s = Number(stopRate);
    if (Number.isNaN(s) || s < 0) return toast.error("Extra stop charge must be a positive number");
    try {
      await updateRateExtras(rate.id, { contractNumber: contract.trim() || null, additionalStopRate: s });
      await qc.invalidateQueries({ queryKey: ["rate_agreements"] });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function addBreak() {
    const min = Number(br.min || 0);
    const max = br.max.trim() === "" ? null : Number(br.max);
    const r = Number(br.rate);
    if (!br.rate || Number.isNaN(r) || Number.isNaN(min) || (max != null && (Number.isNaN(max) || max <= min)))
      return toast.error("Max weight must be above min weight, and a rate is required");
    try {
      await addRateBreak({ rateId: rate.id, minWeight: min, maxWeight: max, linehaulRate: r });
      setBr({ min: "", max: "", rate: "" });
      await refetchBreaks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add tier");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">
            {rate.origin_code ?? "Any"} → {rate.destination_code ?? "Any"} · v{rate.version}
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-5 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change rate (keeps history)</h3>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-muted-foreground">New rate $</label><input className={input} value={newRate} onChange={(e) => setNewRate(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Fuel SC %</label><input className={input} value={newFuel} onChange={(e) => setNewFuel(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Effective</label><input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></div>
            </div>
            <button onClick={revise} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium">Save new version</button>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract & extra stops</h3>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-muted-foreground">Contract #</label><input className={input} value={contract} onChange={(e) => setContract(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Charge per extra stop $</label><input className={input} value={stopRate} onChange={(e) => setStopRate(e.target.value)} /></div>
            </div>
            <button onClick={saveExtras} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2">Save</button>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight tiers</h3>
            <p className="text-xs text-muted-foreground">Optional. If a load's weight falls in a tier, that rate replaces the base rate.</p>
            {breaks.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs">
                <span>{b.min_weight.toLocaleString()} – {b.max_weight == null ? "∞" : b.max_weight.toLocaleString()} lb</span>
                <span className="flex items-center gap-2">${b.linehaul_rate.toFixed(2)}
                  <button onClick={async () => { await deleteRateBreak(b.id).catch((e) => toast.error(e.message)); void refetchBreaks(); }} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              </div>
            ))}
            <div className="grid grid-cols-4 gap-2">
              <input className={input} placeholder="Min lb" value={br.min} onChange={(e) => setBr({ ...br, min: e.target.value })} />
              <input className={input} placeholder="Max lb" value={br.max} onChange={(e) => setBr({ ...br, max: e.target.value })} />
              <input className={input} placeholder="Rate $" value={br.rate} onChange={(e) => setBr({ ...br, rate: e.target.value })} />
              <button onClick={addBreak} className="rounded-md border border-border text-xs font-medium hover:bg-surface-2">Add tier</button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Version history</h3>
            {history.map((h) => (
              <div key={h.id} className="flex justify-between text-xs border-b border-border py-1 last:border-0">
                <span>v{h.version} · {h.effective_start ?? "—"} → {h.effective_end ?? "now"}</span>
                <span>${h.linehaul_rate.toFixed(2)} · {h.fuel_surcharge_pct}%</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
