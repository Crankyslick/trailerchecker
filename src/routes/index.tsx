import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useLoads, useNowTick, useYardCheckIns } from "@/hooks/use-loads";
import { supabase } from "@/integrations/supabase/client";
import type { LoadRow } from "@/lib/loads";
import { toast } from "sonner";
import {
  Truck, Warehouse, ClipboardPaste, DoorOpen, LogOut, Settings,
  RefreshCw, AlertTriangle, Clock,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VTC Dispatch Control — Yard 589" },
      { name: "description", content: "Vital Transportation dispatch board, 24-hour yard ticker, and weekly Target DLM ingestion." },
    ],
  }),
  component: DispatchControl,
});

type Tab = "dispatch" | "yard" | "ingest";

function DispatchControl() {
  const [tab, setTab] = useState<Tab>("dispatch");

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dispatch", label: "Daily Dispatch Board", icon: Truck },
    { id: "yard", label: "24-Hour Yard Ticker", icon: Warehouse },
    { id: "ingest", label: "Weekly Ingestion Tool", icon: ClipboardPaste },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispatch Control</h1>
          <p className="text-sm text-muted-foreground">Weekly freight pipeline · daily driver/trailer assignments · strict 24-hour yard turnaround.</p>
        </div>
      </div>

      <div className="border-b border-border flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {tab === "dispatch" && <DispatchBoard />}
      {tab === "yard" && <YardTicker />}
      {tab === "ingest" && <IngestionTool />}
    </div>
  );
}

/* ---------------- Dispatch Board ---------------- */

async function updateLoad(id: string, patch: Partial<LoadRow>) {
  const { error } = await supabase.from("loads").update(patch).eq("id", id);
  if (error) toast.error(error.message); else toast.success("Saved");
}

function EditCell({ value, onSave, placeholder, mono }: {
  value: string | null; onSave: (v: string | null) => void;
  placeholder?: string; mono?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  useEffect(() => { setV(value ?? ""); }, [value]);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        className={`text-left w-full hover:bg-surface-2 rounded px-1.5 py-1 ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value ?? <span className="text-muted-foreground/60">{placeholder ?? "—"}</span>}
      </button>
    );
  }
  return (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => { setEditing(false); if ((v || null) !== value) onSave(v || null); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setV(value ?? ""); setEditing(false); }
      }}
      className={`w-full bg-surface-2 border border-primary/40 rounded px-1.5 py-1 outline-none ${mono ? "font-mono text-xs" : "text-sm"}`}
    />
  );
}

function fmtCutoff(date: string | null, time: string | null) {
  if (!date && !time) return "—";
  const d = date ? new Date(date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const t = time ? time.slice(0, 5) : "";
  return `${d}${t ? " · " + t : ""}`;
}

function DispatchBoard() {
  const { data: loads = [], isLoading } = useLoads();

  return (
    <div className="kpi-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Daily Dispatch Board</h2>
          <p className="text-xs text-muted-foreground">Inline-edit Driver, Trailer #, Load ID, and Trip ID.</p>
        </div>
        <span className="text-xs text-muted-foreground">{loads.length} loads</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
            <tr className="border-b border-border">
              <th className="text-left font-medium py-3 px-3">Schedule ID</th>
              <th className="text-left font-medium py-3 px-3">CutOff Date/Time</th>
              <th className="text-left font-medium py-3 px-3">Driver</th>
              <th className="text-left font-medium py-3 px-3">Trailer #</th>
              <th className="text-left font-medium py-3 px-3">Load ID</th>
              <th className="text-left font-medium py-3 px-3">Trip ID</th>
              <th className="text-left font-medium py-3 px-3">Origin</th>
              <th className="text-left font-medium py-3 px-3">Destination Store</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                <td className="py-2 px-3 font-mono text-xs">{l.schedule_id}</td>
                <td className="py-2 px-3 text-xs tabular-nums">{fmtCutoff(l.cutoff_date, l.cutoff_time)}</td>
                <td className="py-2 px-3"><EditCell value={l.driver} placeholder="Assign driver" onSave={(v) => updateLoad(l.id, { driver: v })} /></td>
                <td className="py-2 px-3"><EditCell mono value={l.outbound_trailer} placeholder="Trailer #" onSave={(v) => updateLoad(l.id, { outbound_trailer: v })} /></td>
                <td className="py-2 px-3"><EditCell mono value={(l as LoadRow & { target_load_id: string | null }).target_load_id} placeholder="Load ID" onSave={(v) => updateLoad(l.id, { target_load_id: v } as Partial<LoadRow>)} /></td>
                <td className="py-2 px-3"><EditCell mono value={(l as LoadRow & { trip_id: string | null }).trip_id} placeholder="Trip ID" onSave={(v) => updateLoad(l.id, { trip_id: v } as Partial<LoadRow>)} /></td>
                <td className="py-2 px-3 text-xs"><span className="font-mono">{l.origin_id}</span> · <span className="text-muted-foreground">{l.origin_name}</span></td>
                <td className="py-2 px-3 text-xs"><span className="font-mono">{l.str_number}</span> · <span className="text-muted-foreground">{l.str_name}</span></td>
              </tr>
            ))}
            {!isLoading && loads.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No loads scheduled yet. Use the Weekly Ingestion Tool to import.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 24-Hour Yard Ticker ---------------- */

function tierForHours(h: number) {
  if (h >= 24) return { label: "OVERDUE", cls: "bg-danger/20 text-danger border-danger/40 animate-pulse", bar: "bg-danger" };
  if (h >= 18) return { label: "WARNING", cls: "bg-warning/20 text-warning border-warning/40", bar: "bg-warning" };
  if (h >= 12) return { label: "ALERT",   cls: "bg-warning/15 text-warning border-warning/30", bar: "bg-warning/70" };
  return { label: "OK", cls: "bg-success/15 text-success border-success/30", bar: "bg-success" };
}

function fmtHM(hoursElapsed: number) {
  const totalMin = Math.max(0, Math.floor(hoursElapsed * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m`;
}
function fmtCountdown(hoursElapsed: number) {
  const remaining = (24 - hoursElapsed) * 60;
  if (remaining <= 0) return `+${fmtHM(hoursElapsed - 24)} OVER`;
  return `${fmtHM(remaining / 60)} left`;
}

function YardTicker() {
  useNowTick(15_000);
  const { data: items = [] } = useYardCheckIns();
  const [open, setOpen] = useState(false);
  const [trailer, setTrailer] = useState("");
  const [loadId, setLoadId] = useState("");
  const [note, setNote] = useState("");

  async function checkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!trailer.trim()) { toast.error("Trailer # required"); return; }
    const { error } = await supabase.from("yard_check_ins").insert({
      trailer_number: trailer.trim(),
      inbound_load_id: loadId.trim() || null,
      note: note.trim() || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Trailer ${trailer} checked in at gate`);
      setTrailer(""); setLoadId(""); setNote(""); setOpen(false);
    }
  }

  async function checkOut(id: string, trailerNum: string) {
    const { error } = await supabase.from("yard_check_ins").update({ checked_out_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(`Trailer ${trailerNum} dispatched out of yard`);
  }

  const enriched = useMemo(() => items.map((i) => {
    const hours = (Date.now() - new Date(i.arrival_at).getTime()) / 3_600_000;
    return { ...i, hours };
  }).sort((a, b) => b.hours - a.hours), [items]);

  const counts = useMemo(() => {
    let ok = 0, alert = 0, warn = 0, over = 0;
    enriched.forEach((i) => {
      if (i.hours >= 24) over++;
      else if (i.hours >= 18) warn++;
      else if (i.hours >= 12) alert++;
      else ok++;
    });
    return { ok, alert, warn, over };
  }, [enriched]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="< 12h (Green)" value={counts.ok} tone="success" />
        <Stat label="12–18h" value={counts.alert} tone="warning" />
        <Stat label="18–24h" value={counts.warn} tone="warning" />
        <Stat label="> 24h Overdue" value={counts.over} tone="danger" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Active Yard Inventory</h2>
          <p className="text-xs text-muted-foreground">Every empty trailer must clear Yard 589 within 24 hours.</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          <DoorOpen className="h-4 w-4" /> Gate Check-In
        </button>
      </div>

      <div className="kpi-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-4">Trailer #</th>
                <th className="text-left font-medium py-3 px-4">Inbound Load ID</th>
                <th className="text-left font-medium py-3 px-4">Arrival Time</th>
                <th className="text-left font-medium py-3 px-4 w-[28%]">Countdown to 24h</th>
                <th className="text-left font-medium py-3 px-4">State</th>
                <th className="text-right font-medium py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((i) => {
                const t = tierForHours(i.hours);
                const pct = Math.min(100, (i.hours / 24) * 100);
                return (
                  <tr key={i.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                    <td className="py-3 px-4 font-mono font-semibold">{i.trailer_number}</td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{i.inbound_load_id ?? "—"}</td>
                    <td className="py-3 px-4 text-xs tabular-nums">{new Date(i.arrival_at).toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className={`h-full ${t.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="tabular-nums text-xs font-mono w-[110px] text-right">{fmtCountdown(i.hours)}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`chip border ${t.cls}`}>
                        <Clock className="h-3 w-3" /> {t.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => checkOut(i.id, i.trailer_number)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-surface-2 border border-border hover:bg-surface text-foreground">
                        <LogOut className="h-3.5 w-3.5" /> Check-Out / Dispatch
                      </button>
                    </td>
                  </tr>
                );
              })}
              {enriched.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No active trailers in yard. Use Gate Check-In to log an arrival.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <form onSubmit={checkIn} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface border border-border rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2"><DoorOpen className="h-4 w-4" /> Gate Check-In</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Arrival timestamp is captured automatically.</p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Trailer #</span>
                <input autoFocus value={trailer} onChange={(e) => setTrailer(e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" placeholder="e.g. 482917" />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Inbound Load ID</span>
                <input value={loadId} onChange={(e) => setLoadId(e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" placeholder="Optional" />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Note</span>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/50" placeholder="Optional" />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface-2">Cancel</button>
              <button type="submit"
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90">Log Arrival</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const cls = { success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <div className="kpi-card p-4">
      <div className={`text-[11px] uppercase tracking-widest ${cls}`}>{label}</div>
      <div className="text-3xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

/* ---------------- Weekly Ingestion ---------------- */

type ParsedRow = {
  load_id?: string;
  trip_id?: string;
  trailer?: string;
  pro?: string;
  origin?: string;
  destination?: string;
};

function parseBlock(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // split on tabs first, then 2+ spaces, then any whitespace
    let cols = line.split(/\t/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) cols = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) cols = line.split(/\s+/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;

    // Heuristic detection
    const row: ParsedRow = {};
    for (const c of cols) {
      if (/^\d{7,9}$/.test(c) && !row.load_id) { row.load_id = c; continue; }
      if (/^\d{6,7}$/.test(c) && !row.trip_id) { row.trip_id = c; continue; }
      if (/^\d{4,6}$/.test(c) && !row.trailer) { row.trailer = c; continue; }
      if (/dc|chambersburg|589/i.test(c) && !row.origin) { row.origin = c; continue; }
      if (!row.destination) row.destination = c;
    }
    if (row.load_id || row.trip_id || row.trailer) out.push(row);
  }
  return out;
}

function IngestionTool() {
  const { data: loads = [] } = useLoads();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseBlock(text), [text]);

  async function applyToLoads() {
    if (parsed.length === 0) { toast.error("Nothing to apply"); return; }
    setBusy(true);
    let matched = 0;
    for (const row of parsed) {
      const dest = (row.destination ?? "").toLowerCase();
      const target = loads.find((l) =>
        (l.str_name && dest.includes(l.str_name.toLowerCase().split(" ")[0])) ||
        (row.load_id && (l as LoadRow & { target_load_id: string | null }).target_load_id === row.load_id) ||
        (row.trip_id && (l as LoadRow & { trip_id: string | null }).trip_id === row.trip_id)
      );
      if (!target) continue;
      const patch: Partial<LoadRow> = {};
      if (row.load_id) (patch as LoadRow & { target_load_id?: string }).target_load_id = row.load_id;
      if (row.trip_id) (patch as LoadRow & { trip_id?: string }).trip_id = row.trip_id;
      if (row.trailer) patch.outbound_trailer = row.trailer;
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabase.from("loads").update(patch).eq("id", target.id);
      if (!error) matched++;
    }
    setBusy(false);
    toast.success(`Linked ${matched} of ${parsed.length} rows to existing loads`);
  }

  return (
    <div className="space-y-5">
      <div className="kpi-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Paste Target DLM Weekly Data</h2>
          <p className="text-xs text-muted-foreground">Paste raw rows copied from the Target App. We accept tab- or space-separated values containing Load ID, Trip ID, Trailer #, Origin, and Destination.</p>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
          placeholder={"75483812\t5261691\t482917\t589 - Chambersburg Pa Dc\t2247 - Riverdale Rt 23 And Falston\n75483912\t5261741\t482918\t589 - Chambersburg Pa Dc\t1886 - Jersey City"}
          className="w-full bg-surface-2 border border-border rounded p-3 font-mono text-xs outline-none focus:border-primary/50" />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{parsed.length} row(s) detected</div>
          <button onClick={applyToLoads} disabled={busy || parsed.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
            <ClipboardPaste className="h-4 w-4" /> {busy ? "Linking…" : "Link to Dispatch Board"}
          </button>
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="kpi-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">Parse preview</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
                <tr className="border-b border-border">
                  <th className="text-left font-medium py-2 px-3">Load ID</th>
                  <th className="text-left font-medium py-2 px-3">Trip ID</th>
                  <th className="text-left font-medium py-2 px-3">Trailer</th>
                  <th className="text-left font-medium py-2 px-3">Origin</th>
                  <th className="text-left font-medium py-2 px-3">Destination</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 px-3 font-mono">{r.load_id ?? "—"}</td>
                    <td className="py-1.5 px-3 font-mono">{r.trip_id ?? "—"}</td>
                    <td className="py-1.5 px-3 font-mono">{r.trailer ?? "—"}</td>
                    <td className="py-1.5 px-3">{r.origin ?? "—"}</td>
                    <td className="py-1.5 px-3">{r.destination ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SyncPanel />
    </div>
  );
}

/* ---------------- Sync Panel ---------------- */

function SyncPanel() {
  const [endpoint, setEndpoint] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sync_config").select("endpoint_url,last_synced_at").eq("id", 1).maybeSingle();
      if (data) { setEndpoint(data.endpoint_url ?? ""); setLastSync(data.last_synced_at); }
    })();
  }, []);

  async function saveEndpoint() {
    const { error } = await supabase.from("sync_config").update({ endpoint_url: endpoint || null, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Endpoint saved");
  }

  async function fetchNow() {
    if (!endpoint) { toast.error("Configure a Sheet API endpoint first"); return; }
    setBusy(true);
    try {
      const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const rows = Array.isArray(body) ? body : (body.values ?? body.rows ?? body.data ?? []);
      toast.success(`Fetched ${Array.isArray(rows) ? rows.length : 0} rows from sheet`);
      const now = new Date().toISOString();
      await supabase.from("sync_config").update({ last_synced_at: now, updated_at: now }).eq("id", 1);
      setLastSync(now);
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kpi-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">External Sheet Auto-Sync</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Point this at a REST endpoint that mirrors your Google Sheet (Stein, Sheety, SheetDB, or a custom backend).
        Status indicator at the top of the page reflects this configuration.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.sheety.co/.../sheet1"
          className="flex-1 min-w-[260px] bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50" />
        <button onClick={saveEndpoint}
          className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface-2">Save</button>
        <button onClick={fetchNow} disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Fetch now
        </button>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        Last successful fetch: <span className="font-mono">{lastSync ? new Date(lastSync).toLocaleString() : "never"}</span>
      </div>
    </div>
  );
}


