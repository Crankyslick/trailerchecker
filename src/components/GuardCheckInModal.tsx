import { useState } from "react";
import { X, Warehouse, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queueSheetAppend } from "@/lib/sheet-outbox";
import { useDrainSheetOutbox } from "@/hooks/use-sheet-sync";

type Props = { open: boolean; onClose: () => void; onSaved?: () => void };

const YARDS = ["Yard 91", "Yard 301", "Paterson Yard", "589 Chambersburg"] as const;

export function GuardCheckInModal({ open, onClose, onSaved }: Props) {
  const [trailer, setTrailer] = useState("");
  const [yard, setYard] = useState<typeof YARDS[number]>("589 Chambersburg");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const drain = useDrainSheetOutbox();

  if (!open) return null;

  async function submit() {
    if (!trailer.trim()) { toast.error("Trailer # is required"); return; }
    setSubmitting(true);
    try {
      const arrival = new Date().toISOString();
      const { error } = await supabase.from("yard_check_ins").insert({
        trailer_number: trailer.trim(),
        arrival_at: arrival,
        note: note.trim() || null,
      });
      if (error) throw new Error(error.message);

      // Durable Sheet append — queued, then retried until it lands
      await queueSheetAppend({
        "Trailer #": trailer.trim(),
        "TRL Location": yard,
        "STR RTRN TRL#": trailer.trim(),
        "Status": "Checked In",
        "Alert Status": "Guard Shack",
        "Carrier Comments": note.trim() || `Arrived at ${yard}`,
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
            <select value={yard} onChange={(e) => setYard(e.target.value as typeof YARDS[number])}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/60">
              {YARDS.map((y) => <option key={y} value={y}>{y}</option>)}
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
