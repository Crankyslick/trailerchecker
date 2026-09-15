import { useEffect, useMemo, useState } from "react";
import { X, Send, UserPlus, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLoads } from "@/hooks/use-loads";
import { useDrivers } from "@/hooks/use-drivers";
import { queueSheetUpdate } from "@/lib/sheet-outbox";
import { useDrainSheetOutbox } from "@/hooks/use-sheet-sync";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySites } from "@/hooks/use-sites";

type Props = {
  open: boolean;
  onClose: () => void;
  trailer: string;
  yard: string;
  previousDriver?: string | null;
  onDispatched: () => void;
};

function estDate(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function DispatchModal({
  open,
  onClose,
  trailer,
  yard,
  previousDriver,
  onDispatched,
}: Props) {
  const { data: loads = [] } = useLoads();
  const { data: rosterDrivers = [] } = useDrivers();
  const drain = useDrainSheetOutbox();
  const { defaultSite } = useCompanySites();
  // Destination comes from the company's default site, never hard-coded.
  const nextDestination = defaultSite?.name ?? "the default yard";

  const [selected, setSelected] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Scheduled candidates: drivers scheduled today or tomorrow, prioritized
  const candidates = useMemo(() => {
    const today = estDate(0);
    const tomorrow = estDate(1);
    const seen = new Map<
      string,
      {
        name: string;
        load_id: string;
        schedule_id: string | null;
        trip_id: string | null;
        cutoff: string | null;
        date: string | null;
      }
    >();
    for (const l of loads) {
      const d = l.schedule_date ?? l.cutoff_date;
      if (d !== today && d !== tomorrow) continue;
      if (!l.driver) continue;
      const key = l.driver.trim();
      if (seen.has(key)) continue;
      seen.set(key, {
        name: l.driver,
        load_id: l.id,
        schedule_id: l.schedule_id ?? null,
        trip_id: (l as unknown as { trip_id: string | null }).trip_id ?? null,
        cutoff: l.cutoff_time ?? null,
        date: d ?? null,
      });
    }
    return [...seen.values()];
  }, [loads]);

  useEffect(() => {
    if (open) {
      setSelected("");
      setCustomName("");
    }
  }, [open]);

  if (!open) return null;

  const custom = selected === "__custom__";
  const chosen = custom ? null : candidates.find((c) => c.name === selected);
  const driverName = custom ? customName.trim() : (chosen?.name ?? "");

  async function submit() {
    if (!driverName) {
      toast.error("Pick a driver or enter a custom name.");
      return;
    }
    setSubmitting(true);
    try {
      // Look up matching load row (if scheduled) to capture Load ID / Trip ID
      const captured = chosen ?? null;

      // Persist assignment locally: try to update the scheduled load row if found;
      // otherwise create an ad-hoc dispatch note in trailer_events.
      if (captured?.load_id) {
        await supabase
          .from("trailer_loads")
          .update({
            outbound_trailer: trailer,
            driver: driverName,
            return_trailer_location: "Store",
            status: "Assigned",
          })
          .eq("id", captured.load_id);
      }

      await supabase.from("trailer_events").insert({
        load_id: captured?.load_id ?? null,
        trailer_number: trailer,
        event_type: "Dispatched",
        note: `Trailer ${trailer} dispatched from ${yard} → ${nextDestination}. Driver: ${driverName}${previousDriver ? ` · Returned by ${previousDriver}` : ""}${custom ? " (custom)" : ""}`,
      });

      // Queue the Sheet writeback (durable: retried until it lands)
      if (captured?.load_id && (captured.schedule_id || captured.trip_id)) {
        await queueSheetUpdate("Load ID", captured.load_id, {
          Driver: driverName,
          "RDC Trailer": trailer,
          "Pickup Cutoff Time": captured.cutoff ?? "",
        });
        void drain.mutateAsync().catch(() => undefined);
      }

      toast.success(`Trailer ${trailer} dispatched to ${nextDestination}`);
      onDispatched();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            <h3 className="font-semibold">Dispatch Trailer</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Info
              label="Trailer #"
              value={<span className="font-mono font-semibold text-primary">{trailer}</span>}
            />
            <Info label="Current Yard" value={yard} />
            <Info
              label="Next Destination"
              value={<span className="font-semibold">{nextDestination}</span>}
            />
            <Info label="Returned By" value={previousDriver ?? "—"} />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Assigned Driver
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/60"
            >
              <option value="">— Select scheduled driver —</option>
              {candidates.length > 0 && (
                <optgroup label={`Scheduled to ${nextDestination} (Today / Tomorrow)`}>
                  {candidates.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                      {c.date ? ` · ${c.date}` : ""}
                      {c.cutoff ? ` · cutoff ${c.cutoff}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {rosterDrivers.length > 0 && (
                <optgroup label="Roster">
                  {rosterDrivers
                    .filter((d) => !candidates.some((c) => c.name === d.name))
                    .map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                </optgroup>
              )}
              <option value="__custom__">＋ Add new / custom driver…</option>
            </select>
            {custom && (
              <div className="mt-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                <input
                  autoFocus
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Enter driver name (ad-hoc)"
                  className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
              </div>
            )}
            {chosen && (
              <div className="mt-2 rounded border border-primary/30 bg-primary/5 p-2 text-xs">
                <div className="text-muted-foreground">
                  Captured from schedule (will publish to Sheet):
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                  <span>
                    Load ID: <b className="text-primary">{chosen.load_id.slice(0, 8)}…</b>
                  </span>
                  {chosen.schedule_id && <span>Sched: {chosen.schedule_id}</span>}
                  {chosen.trip_id && <span>Trip: {chosen.trip_id}</span>}
                  {chosen.cutoff && <span>Cutoff: {chosen.cutoff}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || (!chosen && !customName.trim())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Dispatch to {nextDestination}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}
