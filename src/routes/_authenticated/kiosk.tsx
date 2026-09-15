import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { LogIn, LogOut, Search, Warehouse, Loader2, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { useLoads, useYardCheckIns, type YardCheckIn } from "@/hooks/use-loads";
import { useYardCheckIn, useYardCheckOut, newIdempotencyKey } from "@/hooks/use-yard";
import { useCurrentUser } from "@/hooks/use-auth";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/kiosk")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({
    meta: [
      { title: "Gate Kiosk — Me Do Logistics" },
      { name: "description", content: "High-contrast gate guard kiosk for trailer check-in, check-out, and lookup." },
    ],
  }),
  component: Kiosk,
});

type Mode = "home" | "in" | "out" | "search";

function hoursIn(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function Kiosk() {
  const { data: active = [], refetch } = useYardCheckIns();
  const { data: loads = [] } = useLoads();
  const { profile } = useCurrentUser();
  const checkInMutation = useYardCheckIn();
  const checkOutMutation = useYardCheckOut();
  const idemRef = useRef(newIdempotencyKey());
  const [mode, setMode] = useState<Mode>("home");
  const [trailer, setTrailer] = useState("");
  const [loadId, setLoadId] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = Array.isArray(active) ? active : [];
  const matches = useMemo(() => {
    const q = trailer.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => (r?.trailer_number ?? "").toUpperCase().includes(q) || (r?.note ?? "").toUpperCase().includes(q));
  }, [rows, trailer]);

  const reset = () => { setTrailer(""); setLoadId(""); setMode("home"); };

  async function checkIn() {
    const t = trailer.trim().toUpperCase();
    if (!t) { toast.error("Enter a trailer #"); return; }
    setBusy(true);
    try {
      const typed = loadId.trim().toUpperCase();
      const match = typed
        ? loads.find((l) =>
            (l.schedule_id ?? "").toUpperCase() === typed ||
            (l.target_load_id ?? "").toUpperCase() === typed ||
            (l.trip_id ?? "").toUpperCase() === typed)
        : undefined;
      if (typed && !match) { toast.error(`No load matches ${typed}`); setBusy(false); return; }

      await checkInMutation.mutateAsync({
        trailer: t,
        loadId: match?.id ?? null,
        note: `Kiosk check-in by ${profile?.full_name ?? profile?.email ?? "gate"}`,
        idempotencyKey: idemRef.current,
      });
      toast.success(`${t} checked in`);
      idemRef.current = newIdempotencyKey();
      void refetch();
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function checkOut(row: YardCheckIn) {
    setBusy(true);
    try {
      await checkOutMutation.mutateAsync(row.id);
      toast.success(`${row.trailer_number} dispatched`);
      void refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black tracking-tight">Gate Kiosk</h1>
          <p className="text-xs text-muted-foreground">{rows.length} trailers on the yard</p>
        </div>
        {mode !== "home" && (
          <button onClick={reset} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm">
            <X className="h-4 w-4" /> Back
          </button>
        )}
      </header>

      {mode === "home" && (
        <div className="grid gap-3">
          <BigButton icon={LogIn} label="Check-in Trailer" tone="primary" onClick={() => setMode("in")} />
          <BigButton icon={LogOut} label="Check-out / Dispatch" tone="warn" onClick={() => setMode("out")} />
          <BigButton icon={Search} label="Search Trailer #" tone="plain" onClick={() => setMode("search")} />
        </div>
      )}

      {mode === "in" && (
        <div className="kpi-card space-y-3 p-5">
          <KioskInput label="Trailer #" value={trailer} onChange={(v) => setTrailer(v.toUpperCase())} placeholder="244783" autoFocus />
          <KioskInput label="Inbound Load ID (optional)" value={loadId} onChange={setLoadId} placeholder="75483812" />
          <button onClick={checkIn} disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-5 text-lg font-black text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Warehouse className="h-5 w-5" />} Log Arrival
          </button>
        </div>
      )}

      {(mode === "out" || mode === "search") && (
        <div className="space-y-3">
          <KioskInput label="Search trailer # or load ID" value={trailer} onChange={(v) => setTrailer(v.toUpperCase())} placeholder="Scan or type" autoFocus />
          {matches.length === 0 && <p className="kpi-card p-5 text-center text-sm text-muted-foreground">No active trailers match.</p>}
          {matches.map((r) => (
            <div key={r.id} className="kpi-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate font-mono text-xl font-black text-primary">{r?.trailer_number ?? "—"}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {hoursIn(r?.arrival_at)} on yard
                  
                </div>
              </div>
              {mode === "out" && (
                <button onClick={() => checkOut(r)} disabled={busy}
                  className="shrink-0 rounded-lg bg-warning px-4 py-3 text-sm font-black text-background disabled:opacity-60">
                  Dispatch
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BigButton({
  icon: Icon, label, onClick, tone,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; tone: "primary" | "warn" | "plain" }) {
  const cls = tone === "primary"
    ? "bg-primary text-primary-foreground"
    : tone === "warn"
      ? "bg-warning text-background"
      : "border border-border bg-surface-2/60 text-foreground";
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-3 rounded-xl px-4 py-8 text-xl font-black ${cls}`}>
      <Icon className="h-6 w-6" /> {label}
    </button>
  );
}

function KioskInput({
  label, value, onChange, placeholder, autoFocus,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-4 py-4 font-mono text-xl outline-none focus:border-primary/60"
      />
    </label>
  );
}
