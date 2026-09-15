import { useRef, useState } from "react";
import { X, Warehouse, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useYardCheckIn, newIdempotencyKey } from "@/hooks/use-yard";
import { useCompanySites } from "@/hooks/use-sites";
import { queueSheetAppend } from "@/lib/sheet-outbox";
import { useDrainSheetOutbox } from "@/hooks/use-sheet-sync";

type Props = { open: boolean; onClose: () => void; onSaved?: () => void };

export function GuardCheckInModal({ open, onClose, onSaved }: Props) {
  const [trailer, setTrailer] = useState("");
  const { names: yards, defaultSite } = useCompanySites();
  const [yard, setYard] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const drain = useDrainSheetOutbox();
  const checkIn = useYardCheckIn();
  const idemRef = useRef(newIdempotencyKey());
  const activeYard = yard || defaultSite?.name || "";

  if (!open) return null;

  async function submit() {
    if (!trailer.trim()) { toast.error("Trailer # is required"); return; }
    setSubmitting(true);
    try {
      const row = await checkIn.mutateAsync({
        trailer: trailer.trim(),
        note: note.trim() ? `${activeYard} · ${note.trim()}` : `Arrived at ${activeYard}`,
        idempotencyKey: idemRef.current,
      });
      const arrival = row.arrival_at;
      idemRef.current = newIdempotencyKey();

      // Durable Sheet append — queued, then retried until it lands
      await queueSheetAppend({
        "Trailer #": trailer.trim(),
        "TRL Location": activeYard,
        "STR RTRN TRL#": trailer.trim(),
        "Status": "Checked In",
        "Alert Status": "Guard Shack",
        "Carrier Comments": note.trim() || `Arrived at ${activeYard}`,
        "Updated By": "Guard Shack",
        "Expected Pickup": arrival,
      });
      void drain.mutateAsync().catch(() => undefined);
      toast.success(`Trailer ${trailer.trim()} logged · queued for the sheet`);

      setTrailer(""); setNote("");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-primary" /><h3 className="font-semibold">Guard Shack Check-In</h3></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Trailer #</label>
            <input autoFocus value={trailer} onChange={(e) => setTrailer(e.target.value.toUpperCase())}
              placeholder="e.g. 244783"
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Arrival Yard</label>
            <select value={activeYard} onChange={(e) => setYard(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/60">
              {yards.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Seal intact, empty, damage, etc."
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/60" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Warehouse className="h-3.5 w-3.5" />} Check In & Append
          </button>
        </div>
      </div>
    </div>
  );
}
