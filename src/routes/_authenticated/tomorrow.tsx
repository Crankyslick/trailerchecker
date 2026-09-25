import { createFileRoute, Link } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { useMemo, useRef, useState, useEffect } from "react";
import { useLoads, useNowTick, useYardCheckIns } from "@/hooks/use-loads";
import { useDrivers, type Driver } from "@/hooks/use-drivers";
import { supabase } from "@/integrations/supabase/client";
import { fireWebhook } from "@/lib/webhook";
import type { LoadRow, LoadUpdate } from "@/lib/loads";
import { TRAILER_LOCATIONS, activeYardPolicy, yardBadge } from "@/lib/loads";
import { useDataWritable } from "@/lib/data-health";
import { toEstIsoDate, departureDateFromCandidates } from "@/lib/dates";
import { isRoundTripSweep, sweepCell } from "@/lib/sweep";
import { useDrainSheetOutbox } from "@/hooks/use-sheet-sync";
import { useYardCheckIn, useYardCheckOut, newIdempotencyKey } from "@/hooks/use-yard";
import { toast } from "sonner";
import { guard } from "@/lib/route-guard";
import { useServerFn } from "@tanstack/react-start";
import { readSyncConfig, readAdminSyncConfig, saveSyncConfig } from "@/lib/sync-config";
import { testSyncWebhook } from "@/lib/webhook.functions";
import {
  Truck,
  Warehouse,
  ClipboardPaste,
  DoorOpen,
  LogOut,
  Settings,
  RefreshCw,
  AlertTriangle,
  Clock,
  Users,
  Plus,
  Archive,
  MapPin,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/tomorrow")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({
    meta: [
      { title: "VTC Dispatch Control — Yard 589" },
      {
        name: "description",
        content:
          "Vital Transportation dispatch board, 24-hour STR RTRN TRL# ticker, driver assignment, and Google Sheet sync.",
      },
    ],
  }),
  component: DispatchControl,
});

type Tab = "dispatch" | "yard" | "drivers" | "ingest";

function DispatchControl() {
  const [tab, setTab] = useState<Tab>("dispatch");
  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dispatch", label: "Daily Dispatch Board", icon: Truck },
    { id: "yard", label: "24-Hour Yard Ticker", icon: Warehouse },
    { id: "drivers", label: "Drivers", icon: Users },
    { id: "ingest", label: "Ingestion & Sync", icon: ClipboardPaste },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispatch Control</h1>
          <p className="text-sm text-muted-foreground">
            Live STR RTRN TRL# timers · next-day driver deadline (16:00 EST) · Google Sheet
            auto-sync.
          </p>
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
      {tab === "drivers" && <DriversTab />}
      {tab === "ingest" && <IngestionTool />}
    </div>
  );
}

/* ---------------- Shared mutation helpers ---------------- */

/** Throws on failure so callers can roll back optimistic UI state. */
async function updateLoadOrThrow(id: string, patch: Partial<LoadRow>) {
  const { data, error } = await supabase
    .from("trailer_loads")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  fireWebhook("load.update", { id, patch, row: data });
  return data;
}

async function updateLoad(id: string, patch: Partial<LoadRow>) {
  try {
    await updateLoadOrThrow(id, patch);
    toast.success("Saved");
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/* ---------------- EST helpers ---------------- */

// Get "today" and "tomorrow" as YYYY-MM-DD strings in America/New_York.
function estDateParts(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}
// Current hour in EST (0-23)
function estHour(): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(h, 10) % 24;
}

/* ---------------- Editable cells ---------------- */

/**
 * Inline cell with an explicit commit. Clicking away cancels; Enter (or the
 * check button) saves. Repeat commits of an unchanged value are dropped, and
 * the cell shows saving / saved / failed so an edit is never silently lost.
 */
function EditCell({
  value,
  onSave,
  placeholder,
  mono,
  className,
  disabled,
}: {
  value: string | null;
  onSave: (v: string | null) => Promise<unknown> | unknown;
  placeholder?: string;
  mono?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inFlight = useRef(false);
  useEffect(() => {
    setV(value ?? "");
  }, [value]);

  async function commit() {
    const next = v.trim() || null;
    setEditing(false);
    if (next === value || inFlight.current) return;
    inFlight.current = true;
    setState("saving");
    const previous = value;
    try {
      await onSave(next);
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch (e) {
      setV(previous ?? ""); // optimistic rollback
      setState("error");
      toast.error((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        title={
          disabled
            ? "Editing is paused while live data can't be loaded"
            : "Click to edit, Enter to save"
        }
        className={`text-left w-full rounded px-1.5 py-1 disabled:opacity-60 ${state === "error" ? "border border-danger/50" : "hover:bg-surface-2"} ${mono ? "font-mono text-xs" : "text-sm"} ${className ?? ""}`}
      >
        {value ?? <span className="text-muted-foreground/60">{placeholder ?? "—"}</span>}
        {state === "saving" && (
          <span className="ml-1 text-[10px] text-muted-foreground">saving…</span>
        )}
        {state === "saved" && <span className="ml-1 text-[10px] text-success">saved</span>}
        {state === "error" && <span className="ml-1 text-[10px] text-danger">not saved</span>}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setV(value ?? "");
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            setV(value ?? "");
            setEditing(false);
          }
        }}
        className={`w-full bg-surface-2 border border-primary/40 rounded px-1.5 py-1 outline-none ${mono ? "font-mono text-xs" : "text-sm"} ${className ?? ""}`}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          void commit();
        }}
        title="Save (Enter)"
        className="shrink-0 rounded border border-primary/40 px-1.5 py-1 text-[10px] text-primary hover:bg-primary/10"
      >
        ✓
      </button>
    </div>
  );
}

function DriverSelect({
  value,
  drivers,
  onSave,
  danger,
}: {
  value: string | null;
  drivers: Driver[];
  onSave: (v: string | null) => void;
  danger?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value || null)}
      className={`w-full rounded px-1.5 py-1 text-sm outline-none border ${
        danger
          ? "bg-danger/20 border-danger/60 text-danger font-semibold"
          : value
            ? "bg-surface-2 border-border"
            : "bg-surface-2 border-warning/40 text-warning"
      }`}
    >
      <option value="">— Unassigned —</option>
      {drivers
        .filter((d) => d.active || d.name === value)
        .map((d) => (
          <option key={d.id} value={d.name}>
            {d.name}
          </option>
        ))}
    </select>
  );
}

function LocationSelect({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  return (
    <select
      value={value ?? "DC"}
      onChange={(e) => onSave(e.target.value)}
      className="w-full bg-surface-2 border border-border rounded px-1.5 py-1 text-sm outline-none"
    >
      {TRAILER_LOCATIONS.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

/* ---------------- Dispatch Board ---------------- */

function fmtDate(date: string | null) {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m`;
}

function fmtGroupLabel(date: string | null, today: string, tomorrow: string): string {
  if (!date) return "Unscheduled";
  const long = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (date === today) return `Today — ${long}`;
  if (date === tomorrow) return `Tomorrow — ${long}`;
  return long;
}

type BoardRowProps = {
  load: LoadRow;
  drivers: Driver[];
  tomorrow: string;
  pastDeadline: boolean;
};

function BoardRow({ load: l, drivers, tomorrow, pastDeadline }: BoardRowProps) {
  const writable = useDataWritable();
  const started = (l as LoadRow & { str_return_trailer_started_at: string | null })
    .str_return_trailer_started_at;
  const hours = started ? (Date.now() - new Date(started).getTime()) / 3_600_000 : null;
  const timerOverdue = hours !== null && hours >= activeYardPolicy().deadlineHours;
  const scheduleDate = l.schedule_date ?? l.cutoff_date;
  const isTomorrow = scheduleDate === tomorrow;
  const driverOverdue = isTomorrow && !l.driver && pastDeadline;
  const rowRed = timerOverdue || driverOverdue;
  return (
    <tr
      className={`border-b border-border/40 last:border-0 transition-colors ${
        rowRed ? "bg-danger/15 hover:bg-danger/20 animate-pulse" : "hover:bg-surface-2/30"
      }`}
    >
      <td className="py-2 px-3 text-xs tabular-nums whitespace-nowrap">
        {fmtDate(scheduleDate)}
        {isTomorrow && <span className="ml-1 text-[10px] uppercase text-warning">tmrw</span>}
      </td>
      <td className="py-2 px-3 font-mono text-xs">{l.schedule_id}</td>
      <td className="py-2 px-3">
        <DriverSelect
          value={l.driver}
          drivers={drivers}
          danger={driverOverdue}
          onSave={(v) => updateLoad(l.id, { driver: v })}
        />
      </td>
      <td className="py-2 px-3">
        <EditCell
          mono
          value={l.outbound_trailer}
          placeholder="Trailer #"
          disabled={!writable}
          onSave={(v) => updateLoadOrThrow(l.id, { outbound_trailer: v })}
        />
      </td>
      <td className="py-2 px-3 text-xs">
        <span className="font-mono">{l.origin_id}</span> ·{" "}
        <span className="text-muted-foreground">{l.origin_name}</span>
      </td>
      <td className="py-2 px-3 text-xs">
        <span className="font-mono">{l.str_number}</span> ·{" "}
        <span className="text-muted-foreground">{l.str_name}</span>
      </td>
      <td className="py-2 px-3">
        <EditCell
          mono
          value={l.return_trailer}
          placeholder="Type trailer #"
          disabled={!writable}
          className={l.return_trailer ? "text-primary font-semibold" : ""}
          onSave={(v) => updateLoadOrThrow(l.id, { return_trailer: v })}
        />
      </td>
      <td className="py-2 px-3">
        <LocationSelect
          value={l.return_trailer_location}
          onSave={(v) =>
            updateLoad(l.id, { return_trailer_location: v as LoadRow["return_trailer_location"] })
          }
        />
      </td>
      <td className="py-2 px-3">
        {started ? (
          <span className={`chip border tabular-nums font-mono text-xs ${yardBadge(hours).cls}`}>
            <Clock className="h-3 w-3" /> {fmtElapsed(started)}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

function BoardHead() {
  return (
    <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
      <tr className="border-b border-border">
        <th className="text-left font-medium py-2.5 px-3">Schedule Date</th>
        <th className="text-left font-medium py-2.5 px-3">Schedule ID</th>
        <th className="text-left font-medium py-2.5 px-3 min-w-[160px]">Driver Assigned</th>
        <th className="text-left font-medium py-2.5 px-3">RDC Trailer</th>
        <th className="text-left font-medium py-2.5 px-3">Origin</th>
        <th className="text-left font-medium py-2.5 px-3">Destination</th>
        <th className="text-left font-medium py-2.5 px-3 min-w-[140px]">STR RTRN TRL# (T)</th>
        <th className="text-left font-medium py-2.5 px-3">TRL Location (U)</th>
        <th className="text-left font-medium py-2.5 px-3 min-w-[130px]">Active Timer</th>
      </tr>
    </thead>
  );
}

function DispatchBoard() {
  useNowTick(30_000);
  const { data: loads = [], isLoading } = useLoads();
  const { data: drivers = [] } = useDrivers();

  const today = estDateParts(0);
  const tomorrow = estDateParts(1);
  const pastDeadline = estHour() >= 16;

  const { groups, archivedCount } = useMemo(() => {
    const map = new Map<string, LoadRow[]>();
    let archived = 0;
    for (const l of loads) {
      const key = l.schedule_date ?? l.cutoff_date ?? "";
      // Today onward only — past days live in /history
      if (key && key < today) {
        archived++;
        continue;
      }
      const arr = map.get(key);
      if (arr) arr.push(l);
      else map.set(key, [l]);
    }
    const list = [...map.entries()]
      .map(([date, rows]) => ({
        date: date || null,
        rows,
        unassigned: rows.filter((r) => !r.driver).length,
        missingTrailer: rows.filter((r) => !r.outbound_trailer).length,
      }))
      .sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
    return { groups: list, archivedCount: archived };
  }, [loads, today]);

  const activeCount = useMemo(() => groups.reduce((n, g) => n + g.rows.length, 0), [groups]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const defaultOpen = (date: string | null) => date === today || date === tomorrow;
  const isOpen = (date: string | null) => {
    const key = date ?? "__none__";
    if (key in collapsed) return !collapsed[key];
    return defaultOpen(date);
  };
  const toggle = (date: string | null) => {
    const key = date ?? "__none__";
    setCollapsed((c) => ({ ...c, [key]: isOpen(date) }));
  };

  return (
    <div className="space-y-3">
      <div className="kpi-card px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold">Daily Dispatch Board</h2>
          <p className="text-xs text-muted-foreground">
            Showing today onward — past days are archived in{" "}
            <Link to="/history" className="text-primary hover:underline">
              History
            </Link>
            .
            {pastDeadline && (
              <span className="text-danger ml-2">
                · Past 16:00 EST — tomorrow&apos;s unassigned loads shown in red.
              </span>
            )}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {activeCount} active loads · {groups.length} days
          {archivedCount > 0 && <> · {archivedCount} archived</>}
        </span>
      </div>

      {groups.map((g) => {
        const open = isOpen(g.date);
        const key = g.date ?? "__none__";
        const isToday = g.date === today;
        const isTomorrowGroup = g.date === tomorrow;
        return (
          <div key={key} className="kpi-card overflow-hidden">
            <button
              onClick={() => toggle(g.date)}
              className={`w-full sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors border-b ${
                open ? "border-border" : "border-transparent"
              } ${isToday ? "bg-primary/10" : isTomorrowGroup ? "bg-warning/10" : "bg-surface-2/60"} hover:bg-surface-2`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                />
                <span className={`text-sm font-semibold truncate ${isToday ? "text-primary" : ""}`}>
                  {fmtGroupLabel(g.date, today, tomorrow)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end text-[11px]">
                <span className="chip border bg-surface-2 border-border text-muted-foreground">
                  {g.rows.length} loads
                </span>
                {g.unassigned > 0 && (
                  <span
                    className={`chip border ${
                      isTomorrowGroup && pastDeadline
                        ? "bg-danger/20 text-danger border-danger/50"
                        : "bg-warning/15 text-warning border-warning/40"
                    }`}
                  >
                    <AlertTriangle className="h-3 w-3" /> {g.unassigned} unassigned
                  </span>
                )}
                {g.missingTrailer > 0 && (
                  <span className="chip border bg-info/15 text-info border-info/30">
                    {g.missingTrailer} missing trailer
                  </span>
                )}
              </div>
            </button>

            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <BoardHead />
                    <tbody>
                      {g.rows.map((l) => (
                        <BoardRow
                          key={l.id}
                          load={l}
                          drivers={drivers}
                          tomorrow={tomorrow}
                          pastDeadline={pastDeadline}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {!isLoading && groups.length === 0 && (
        <div className="kpi-card py-12 text-center text-muted-foreground">
          No loads scheduled for today or later.
          {archivedCount > 0 && (
            <>
              {" "}
              <Link to="/history" className="text-primary hover:underline">
                View {archivedCount} archived loads
              </Link>
              .
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Drivers Tab ---------------- */

function DriversTab() {
  const { data: drivers = [] } = useDrivers();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const { data, error } = await supabase
      .from("drivers")
      .insert({ name: name.trim(), phone: phone.trim() || null })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Added ${name}`);
    setName("");
    setPhone("");
    fireWebhook("driver.create", { row: data });
  }

  async function toggleActive(d: Driver) {
    const { data, error } = await supabase
      .from("drivers")
      .update({ active: !d.active })
      .eq("id", d.id)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    fireWebhook("driver.update", { id: d.id, row: data });
  }

  /**
   * Drivers are never hard-deleted: historical loads reference them and the
   * reporting identity must survive. Retiring simply deactivates the record.
   */
  async function retireDriver(d: Driver) {
    if (!d.active) {
      toast.info(`${d.name} is already inactive.`);
      return;
    }
    const { count, error: countError } = await supabase
      .from("trailer_loads")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", d.id);
    if (countError) {
      toast.error(countError.message);
      return;
    }
    const referenced = count ?? 0;
    if (
      !confirm(
        referenced > 0
          ? `${d.name} is linked to ${referenced} load${referenced === 1 ? "" : "s"}. They'll be retired (hidden from dispatch) but kept on those loads. Continue?`
          : `Retire ${d.name}? They'll be hidden from the dispatch dropdown.`,
      )
    )
      return;
    const { data, error } = await supabase
      .from("drivers")
      .update({ active: false })
      .eq("id", d.id)
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${d.name} retired`);
    fireWebhook("driver.update", { id: d.id, row: data });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addDriver} className="kpi-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Driver Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ahmed Beshir"
            className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Phone (optional)
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 …"
            className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Driver
        </button>
      </form>

      <div className="kpi-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Active Drivers</h2>
          <span className="text-xs text-muted-foreground">
            {drivers.filter((d) => d.active).length} of {drivers.length} active
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-4">Name</th>
                <th className="text-left font-medium py-3 px-4">Phone</th>
                <th className="text-left font-medium py-3 px-4">Status</th>
                <th className="text-right font-medium py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border/40 last:border-0 hover:bg-surface-2/30"
                >
                  <td className="py-3 px-4 font-medium">{d.name}</td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                    {d.phone ?? "—"}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`chip border ${d.active ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`}
                    >
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => toggleActive(d)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-surface-2 border border-border hover:bg-surface"
                    >
                      {d.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => retireDriver(d)}
                      disabled={!d.active}
                      title="Hides the driver from dispatch but keeps their load history"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 disabled:opacity-40"
                    >
                      <Archive className="h-3.5 w-3.5" /> Retire
                    </button>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    No drivers yet. Add one above to populate the dispatch dropdown.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 24-Hour Yard Ticker ---------------- */

// Single shared aging policy — see YARD_POLICY in src/lib/loads.ts.
const tierForHours = (h: number) => yardBadge(h);
function fmtHM(hoursElapsed: number) {
  const totalMin = Math.max(0, Math.floor(hoursElapsed * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m`;
}
function fmtCountdown(hoursElapsed: number) {
  const deadline = activeYardPolicy().deadlineHours;
  const remaining = (deadline - hoursElapsed) * 60;
  if (remaining <= 0) return `+${fmtHM(hoursElapsed - deadline)} OVER`;
  return `${fmtHM(remaining / 60)} left`;
}

function YardTicker() {
  useNowTick(15_000);
  const { data: items = [] } = useYardCheckIns();
  const { data: loads = [] } = useLoads();
  const [open, setOpen] = useState(false);
  const [trailer, setTrailer] = useState("");
  const [loadId, setLoadId] = useState("");
  const [note, setNote] = useState("");
  const checkInMutation = useYardCheckIn();
  const checkOutMutation = useYardCheckOut();
  const idemRef = useRef(newIdempotencyKey());

  // Active STR RTRN TRL# timers pulled from loads (Column T timestamps)
  const activeReturnTrailers = useMemo(
    () =>
      loads
        .filter(
          (l) =>
            l.return_trailer &&
            (l as LoadRow & { str_return_trailer_started_at: string | null })
              .str_return_trailer_started_at,
        )
        .map((l) => {
          const started = (l as LoadRow & { str_return_trailer_started_at: string | null })
            .str_return_trailer_started_at!;
          const hours = (Date.now() - new Date(started).getTime()) / 3_600_000;
          return { load: l, started, hours };
        })
        .sort((a, b) => b.hours - a.hours),
    [loads],
  );

  async function checkIn(e: React.FormEvent) {
    e.preventDefault();
    if (!trailer.trim()) {
      toast.error("Trailer # required");
      return;
    }
    const typed = loadId.trim().toUpperCase();
    const match = typed
      ? loads.find(
          (l) =>
            (l.schedule_id ?? "").toUpperCase() === typed ||
            (l.target_load_id ?? "").toUpperCase() === typed ||
            (l.trip_id ?? "").toUpperCase() === typed,
        )
      : undefined;
    if (typed && !match) {
      toast.error(`No load matches ${typed}`);
      return;
    }
    try {
      const row = await checkInMutation.mutateAsync({
        trailer: trailer.trim(),
        loadId: match?.id ?? null,
        note: note.trim() || null,
        idempotencyKey: idemRef.current,
      });
      idemRef.current = newIdempotencyKey();
      toast.success(`Trailer ${trailer} checked in at gate`);
      fireWebhook("yard.check_in", { row });
      setTrailer("");
      setLoadId("");
      setNote("");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function checkOut(id: string, trailerNum: string) {
    try {
      const row = await checkOutMutation.mutateAsync(id);
      toast.success(`Trailer ${trailerNum} dispatched out of yard`);
      fireWebhook("yard.check_out", { id, row });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const enriched = useMemo(
    () =>
      items
        .map((i) => {
          const hours = (Date.now() - new Date(i.arrival_at).getTime()) / 3_600_000;
          return { ...i, hours };
        })
        .sort((a, b) => b.hours - a.hours),
    [items],
  );

  return (
    <div className="space-y-4">
      {activeReturnTrailers.length > 0 && (
        <div className="kpi-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Live STR RTRN TRL# Timers (from dispatch
              board Column T)
            </h2>
            <p className="text-xs text-muted-foreground">
              Started the second the trailer # was saved. Overdue rows blink red.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
                <tr className="border-b border-border">
                  <th className="text-left font-medium py-3 px-4">Trailer #</th>
                  <th className="text-left font-medium py-3 px-4">Load / Store</th>
                  <th className="text-left font-medium py-3 px-4">Location (U)</th>
                  <th className="text-left font-medium py-3 px-4">Started</th>
                  <th className="text-left font-medium py-3 px-4">Elapsed</th>
                  <th className="text-left font-medium py-3 px-4">State</th>
                </tr>
              </thead>
              <tbody>
                {activeReturnTrailers.map(({ load, started, hours }) => {
                  const t = tierForHours(hours);
                  return (
                    <tr
                      key={load.id}
                      className={`border-b border-border/40 last:border-0 ${hours >= 24 ? "bg-danger/15 animate-pulse" : "hover:bg-surface-2/30"}`}
                    >
                      <td className="py-3 px-4 font-mono font-semibold">{load.return_trailer}</td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-mono">{load.schedule_id}</span> · {load.str_number}{" "}
                        {load.str_name}
                      </td>
                      <td className="py-3 px-4 text-xs">{load.return_trailer_location ?? "—"}</td>
                      <td className="py-3 px-4 text-xs tabular-nums">
                        {new Date(started).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-sm">{fmtHM(hours)}</td>
                      <td className="py-3 px-4">
                        <span className={`chip border ${t.cls}`}>
                          <Clock className="h-3 w-3" /> {t.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Manual Gate Check-Ins</h2>
          <p className="text-xs text-muted-foreground">
            For trailers arriving without a scheduled load. 24-hour turnaround still enforced.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
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
                  <tr
                    key={i.id}
                    className={`border-b border-border/40 last:border-0 ${i.hours >= 24 ? "bg-danger/10 animate-pulse" : "hover:bg-surface-2/30"}`}
                  >
                    <td className="py-3 px-4 font-mono font-semibold">{i.trailer_number}</td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {i.inbound_load_id ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-xs tabular-nums">
                      {new Date(i.arrival_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className={`h-full ${t.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="tabular-nums text-xs font-mono w-[110px] text-right">
                          {fmtCountdown(i.hours)}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`chip border ${t.cls}`}>
                        <Clock className="h-3 w-3" /> {t.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => checkOut(i.id, i.trailer_number)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-surface-2 border border-border hover:bg-surface text-foreground"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Check-Out
                      </button>
                    </td>
                  </tr>
                );
              })}
              {enriched.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No active manual check-ins.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={checkIn}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface border border-border rounded-lg p-5 space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <DoorOpen className="h-4 w-4" /> Gate Check-In
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Arrival timestamp is captured automatically.
              </p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Trailer #
                </span>
                <input
                  autoFocus
                  value={trailer}
                  onChange={(e) => setTrailer(e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50"
                  placeholder="e.g. 482917"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Inbound Load ID
                </span>
                <input
                  value={loadId}
                  onChange={(e) => setLoadId(e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50"
                  placeholder="Optional"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Note</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm outline-none focus:border-primary/50"
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
              >
                Log Arrival
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ---------------- Weekly Ingestion + Sync ---------------- */

const DLM_HEADERS = [
  "Load ID",
  "Schedule ID",
  "Trip ID",
  "Pro #",
  "Trailer #",
  "Status",
  "Alert Status",
  "Unload Type",
  "Origin",
  "Destination",
  "Total Distance",
  "Expected Pickup",
  "Expected Delivery",
  "Delivery Sequence",
  "Pickup Defect Reason",
  "Delivery Defect Reason",
  "Carrier Comments",
  "Category",
  "Updated By",
] as const;
type DlmKey = (typeof DLM_HEADERS)[number];
type ParsedRow = Partial<Record<DlmKey, string>> & { __raw: string[]; __key: string };

// Aliases: multiple sheet headers that map to the same canonical DLM column.
// "RDC TRAILER" (Format B) and "Trailer #" (Format A) share one visual column.
const HEADER_ALIASES: Partial<Record<DlmKey, string[]>> = {
  "Trailer #": ["Trailer #", "RDC TRAILER", "RDC Trailer", "Trailer"],
  "Load ID": ["Load ID", "LoadID"],
  "Schedule ID": ["Schedule ID", "ScheduleID", "Schedule"],
  "Trip ID": ["Trip ID", "TripID"],
};

function normalizeHeader(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitLine(line: string): string[] {
  // Prefer tabs; fall back to 2+ whitespace
  if (line.includes("\t")) return line.split(/\t/).map((c) => c.trim());
  return line.split(/\s{2,}|\t/).map((c) => c.trim());
}

/** Resolve a canonical header to its source column index, trying aliases. */
function resolveHeaderIdx(h: DlmKey, firstNorm: string[]): number {
  const candidates = HEADER_ALIASES[h] ?? [h];
  for (const c of candidates) {
    const idx = firstNorm.indexOf(normalizeHeader(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Placeholder values dispatchers commonly leave in the Load ID column. These
 * are never a real Load ID and must be corrected before anything is saved.
 */
const PLACEHOLDER_LOAD_IDS = new Set([
  "N/A",
  "NA",
  "TLS",
  "TBD",
  "NULL",
  "NONE",
  "PENDING",
  "-",
  "--",
]);

/** A real Target Load ID is numeric and at least 6 digits. */
export function isValidLoadId(v?: string | null): boolean {
  const s = (v ?? "").trim();
  if (!s || PLACEHOLDER_LOAD_IDS.has(s.toUpperCase())) return false;
  return /^\d{6,}$/.test(s);
}

/** Deterministic-ish numeric Load ID used when the paste has no usable one. */
export function generateLoadId(seed = 0): string {
  const base = Date.now() % 100_000_000;
  return `9${String((base + seed * 7) % 100_000_000).padStart(8, "0")}`;
}

/** Build a stable unique key: Load ID when present & not N/A, else Schedule ID-Trip ID. */
function buildRowKey(row: Partial<Record<DlmKey, string>>): string {
  const lid = (row["Load ID"] ?? "").trim();
  if (isValidLoadId(lid)) return lid;
  const sid = (row["Schedule ID"] ?? "").trim();
  const tid = (row["Trip ID"] ?? "").trim();
  if (sid && tid) return `${sid}-${tid}`;
  if (sid) return sid;
  if (tid) return tid;
  return "";
}

function parseBlock(text: string): { rows: ParsedRow[]; headerMap: number[]; usedHeader: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headerMap: [], usedHeader: false };

  const firstCols = splitLine(lines[0]);
  const firstNorm = firstCols.map(normalizeHeader);
  // Detect header via any known alias
  const hits = DLM_HEADERS.reduce((n, h) => n + (resolveHeaderIdx(h, firstNorm) >= 0 ? 1 : 0), 0);
  const looksLikeHeader = hits >= 4;

  // Headerless fallback. The raw Target DLM export has 18 columns and does NOT
  // include "Schedule ID"; mapping positions straight onto DLM_HEADERS shifted
  // every column by one (Trip ID landed in Schedule ID, and so on). Only use
  // the 19-column identity map when the pasted rows are actually that wide.
  const widest = lines
    .slice(looksLikeHeader ? 1 : 0)
    .reduce((m, l) => Math.max(m, splitLine(l).length), 0);
  const POSITIONAL: DlmKey[] = DLM_HEADERS.filter((h) => h !== "Schedule ID");
  let headerMap: number[] =
    widest >= DLM_HEADERS.length
      ? DLM_HEADERS.map((_, i) => i)
      : DLM_HEADERS.map((h) => POSITIONAL.indexOf(h));
  let usedHeader = false;
  let dataStart = 0;

  if (looksLikeHeader) {
    headerMap = DLM_HEADERS.map((h) => resolveHeaderIdx(h, firstNorm));
    usedHeader = true;
    dataStart = 1;
  }

  const rows: ParsedRow[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (cols.length < 2) continue;
    const row: Partial<Record<DlmKey, string>> = {};
    DLM_HEADERS.forEach((h, idx) => {
      const srcIdx = headerMap[idx];
      if (srcIdx >= 0 && srcIdx < cols.length) {
        const val = cols[srcIdx];
        // Treat "N/A" and empty as absent
        if (val && val.toUpperCase() !== "N/A") row[h] = val;
      }
    });
    const key = buildRowKey(row);
    // Skip completely unidentifiable rows (no key AND no trailer)
    if (!key && !row["Trailer #"]) continue;
    rows.push({ ...row, __raw: cols, __key: key });
  }
  return { rows, headerMap, usedHeader };
}

// Date handling lives in src/lib/dates.ts (unit-tested). Schedule date always
// comes from the DEPARTURE timestamp, never delivery/arrival.
/**
 * Round Trip Sweep / Backhaul detection over every field a dispatcher may put
 * the load type in. Drives column R of the Daily dispatch sheet.
 */
function rowIsSweep(r: ParsedRow): boolean {
  const extra = r as unknown as Record<string, string | undefined>;
  return isRoundTripSweep(
    r["Unload Type"],
    r["Category"],
    r["Status"],
    r["Carrier Comments"],
    r["Destination"],
    r["Origin"],
    extra["Load Type"],
    extra["Description"],
  );
}

function departureDate(r: ParsedRow): string | null {
  const extra = r as unknown as Record<string, string | undefined>;
  return departureDateFromCandidates(
    r["Expected Pickup"],
    extra["Departure"],
    extra["Cutoff Time"],
  );
}

function IngestionTool() {
  const { data: loads = [] } = useLoads();
  const drainOutbox = useDrainSheetOutbox();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [idFixes, setIdFixes] = useState<Record<number, string>>({});
  const { rows: rawParsed, usedHeader } = useMemo(() => parseBlock(text), [text]);

  // Strict Load ID validation: a placeholder ("TLS", "N/A") or a missing value
  // must be corrected — typed in or auto-generated — before anything is saved.
  const parsed = useMemo(
    () =>
      rawParsed.map((r, i) => {
        const fix = (idFixes[i] ?? "").trim();
        const raw = (r["Load ID"] ?? "").trim();
        const loadId = isValidLoadId(fix) ? fix : isValidLoadId(raw) ? raw : "";
        return {
          ...r,
          "Load ID": loadId || undefined,
          __key: loadId || r.__key,
          __needsId: !loadId,
          __rawLoadId: raw,
        } as ParsedRow & { __needsId: boolean; __rawLoadId: string };
      }),
    [rawParsed, idFixes],
  );
  const needsId = parsed.filter((r) => r.__needsId).length;

  function autoGenerateIds() {
    setIdFixes((prev) => {
      const next = { ...prev };
      parsed.forEach((r, i) => {
        if (r.__needsId) next[i] = generateLoadId(i + 1);
      });
      return next;
    });
  }

  const existingIds = useMemo(
    () =>
      new Set(
        loads
          .map((l) => (l as LoadRow & { target_load_id: string | null }).target_load_id)
          .filter(Boolean) as string[],
      ),
    [loads],
  );
  const updates = parsed.filter((r) => r.__key && existingIds.has(r.__key)).length;
  const inserts = parsed.filter((r) => r.__key && !existingIds.has(r.__key)).length;
  const skipped = parsed.length - updates - inserts;

  /** Normalize a parsed row into a uniform JSON shape for the outbound webhook. */
  function normalizeForWebhook(r: ParsedRow) {
    const out: Record<string, string | boolean | null> = { __key: r.__key || null };
    for (const h of DLM_HEADERS) {
      out[h] = r[h] ?? null;
    }
    // Unified trailer column — Format A "Trailer #" and Format B "RDC TRAILER"
    // both live under "Trailer #" after parsing; expose as "Trailer" too.
    out["Trailer"] = r["Trailer #"] ?? null;
    out["is_round_trip_sweep"] = rowIsSweep(r);
    return out;
  }

  async function executeSync() {
    if (parsed.length === 0) {
      toast.error("Nothing to sync");
      return;
    }
    if (needsId > 0) {
      toast.error(
        `${needsId} row(s) have a missing or invalid Load ID — correct them or auto-generate first.`,
      );
      return;
    }
    setBusy(true);
    let ok = 0,
      fail = 0;

    for (const r of parsed) {
      const key = r.__key;
      if (!key) {
        fail++;
        continue;
      }
      const patch: Record<string, unknown> = {
        target_load_id: key,
        trip_id: r["Trip ID"] ?? null,
        pro_number: r["Pro #"] ?? null,
        outbound_trailer: r["Trailer #"] ?? null,
        origin_name: r["Origin"] ?? null,
        str_name: r["Destination"] ?? null,
        delivery_sequence: r["Delivery Sequence"] ? Number(r["Delivery Sequence"]) || null : null,
        comments: r["Carrier Comments"] ?? null,
        schedule_date: departureDate(r),
        arrival_date: toEstIsoDate(r["Expected Delivery"]),
      };
      Object.keys(patch).forEach((k) => patch[k] === null && delete patch[k]);

      const existing = loads.find(
        (l) => (l as LoadRow & { target_load_id: string | null }).target_load_id === key,
      );
      if (existing) {
        const { error } = await supabase
          .from("trailer_loads")
          .update(patch as LoadUpdate)
          .eq("id", existing.id);
        if (error) fail++;
        else ok++;
      } else {
        const insertRow = { schedule_id: r["Schedule ID"] ?? key, ...patch } as LoadUpdate & {
          schedule_id: string;
        };
        // order_id / shipment_id / leg_id are filled by the auto-provision trigger.
        const { error } = await supabase
          .from("trailer_loads")
          .insert(insertRow as Database["public"]["Tables"]["trailer_loads"]["Insert"]);
        if (error) fail++;
        else ok++;
      }
    }
    // One consolidated webhook push with uniformly-shaped rows (prevents
    // serialization errors from ragged/missing keys downstream).
    const normalizedRows = parsed.map(normalizeForWebhook);
    fireWebhook("dlm.sync", { count: parsed.length, updates, inserts, rows: normalizedRows });

    // Bidirectional writeback to Google Sheet — queued per Load ID so a slow or
    // unavailable sheet never loses an ingest; the queue retries in the background.
    try {
      const { queueSheetUpdates } = await import("@/lib/sheet-outbox");
      const rows = parsed
        .filter((r) => r["Load ID"])
        .map((r) => ({
          matchValue: r["Load ID"]!,
          updates: {
            // Load ID and Trip ID are always sent so an appended (upserted)
            // row carries its identifiers, not just the operational columns.
            "Load ID": r["Load ID"] ?? "",
            "Trip ID": r["Trip ID"] ?? "",
            "Round Trip Sweep": sweepCell(rowIsSweep(r)),
            "Schedule ID": r["Schedule ID"] ?? "",
            "Trailer #": r["Trailer #"] ?? "",
            "RDC Trailer": r["Trailer #"] ?? "",
            Status: r["Status"] ?? "",
            "Alert Status": r["Alert Status"] ?? "",
            Driver: r["Updated By"] ?? "",
            "Carrier Comments": r["Carrier Comments"] ?? "",
          },
        }));

      if (rows.length > 0) {
        const queued = await queueSheetUpdates("Load ID", rows);
        toast.success(`Sheet writeback queued · ${queued} row(s)`);
        void drainOutbox.mutateAsync().catch(() => undefined);
      }
    } catch (e) {
      toast.warning(`Sheet writeback could not be queued: ${(e as Error).message}`);
    }

    setBusy(false);
    toast.success(`Synced ${ok} row(s)${fail ? ` · ${fail} failed` : ""}`);
    setText("");
  }

  return (
    <div className="space-y-5">
      <div className="kpi-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Weekly Data Ingestion Portal</h2>
          <p className="text-xs text-muted-foreground">
            Paste the full 18-column Target DLM dump (with or without headers). Columns split by
            tabs or 2+ spaces. Upsert key: <code className="font-mono">Load ID</code>. Dates parsed
            as America/New_York.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
            {DLM_HEADERS.join(" · ")}
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={
            "Load ID\tTrip ID\tPro #\tTrailer #\tStatus\tAlert Status\tUnload Type\tOrigin\tDestination\tTotal Distance\tExpected Pickup\tExpected Delivery\tDelivery Sequence\tPickup Defect Reason\tDelivery Defect Reason\tCarrier Comments\tCategory\tUpdated By"
          }
          className="w-full bg-surface-2 border border-border rounded p-3 font-mono text-xs outline-none focus:border-primary/50"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded border border-border bg-surface-2 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Parsed Rows</div>
            <div className="text-lg font-semibold tabular-nums">{parsed.length}</div>
          </div>
          <div className="rounded border border-success/30 bg-success/10 px-3 py-2">
            <div className="text-[10px] uppercase text-success">New Inserts</div>
            <div className="text-lg font-semibold tabular-nums text-success">{inserts}</div>
          </div>
          <div className="rounded border border-primary/30 bg-primary/10 px-3 py-2">
            <div className="text-[10px] uppercase text-primary">Updates</div>
            <div className="text-lg font-semibold tabular-nums text-primary">{updates}</div>
          </div>
          <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2">
            <div className="text-[10px] uppercase text-warning">Skipped (no key)</div>
            <div className="text-lg font-semibold tabular-nums text-warning">{skipped}</div>
          </div>
        </div>

        {needsId > 0 && (
          <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 flex items-center justify-between gap-3">
            <div className="text-xs text-warning">
              <b>{needsId}</b> row(s) have a missing or invalid Load ID (placeholders like{" "}
              <code className="font-mono">TLS</code> or <code className="font-mono">N/A</code> are
              not accepted). Type the correct Load ID in the preview below, or auto-generate one.
            </div>
            <button
              onClick={autoGenerateIds}
              className="shrink-0 px-3 py-1.5 rounded-md border border-warning/40 text-warning text-xs font-medium hover:bg-warning/15"
            >
              Auto-generate Load IDs
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {usedHeader
              ? "Header row detected — column order auto-mapped."
              : "No header row — assumed positional order."}
          </div>
          <button
            onClick={executeSync}
            disabled={busy || parsed.length === 0 || needsId > 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <ClipboardPaste className="h-4 w-4" /> {busy ? "Syncing…" : "Execute Sync"}
          </button>
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="kpi-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold">
              Preview — first {Math.min(50, parsed.length)} row(s)
            </h2>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-surface-2/40 sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left font-medium py-2 px-2">Action</th>
                  {DLM_HEADERS.map((h) => (
                    <th key={h} className="text-left font-medium py-2 px-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map((r, i) => {
                  const isUpdate = r.__key && existingIds.has(r.__key);
                  return (
                    <tr
                      key={i}
                      className="border-b border-border/40 last:border-0 hover:bg-surface-2/30"
                    >
                      <td className="py-1.5 px-2">
                        {r.__needsId ? (
                          <div className="flex items-center gap-1.5">
                            <span className="chip border text-[10px] bg-warning/15 text-warning border-warning/30">
                              NEEDS ID
                            </span>
                            <input
                              value={idFixes[i] ?? ""}
                              onChange={(e) => setIdFixes((p) => ({ ...p, [i]: e.target.value }))}
                              placeholder={r.__rawLoadId || "Load ID"}
                              className="w-28 bg-surface-2 border border-warning/40 rounded px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-primary/50"
                            />
                          </div>
                        ) : (
                          <span
                            className={`chip border text-[10px] ${isUpdate ? "bg-primary/15 text-primary border-primary/30" : "bg-success/15 text-success border-success/30"}`}
                            title={`Load ID: ${r.__key}`}
                          >
                            {isUpdate ? "UPDATE" : "INSERT"}
                          </span>
                        )}
                      </td>

                      {DLM_HEADERS.map((h) => (
                        <td
                          key={h}
                          className="py-1.5 px-2 font-mono text-[11px] whitespace-nowrap max-w-[180px] truncate"
                          title={r[h] ?? ""}
                        >
                          {r[h] ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SyncPanel />
    </div>
  );
}

function SyncPanel() {
  const [endpoint, setEndpoint] = useState("");
  const [webhook, setWebhook] = useState("");
  const [canEditWebhook, setCanEditWebhook] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ping = useServerFn(testSyncWebhook);

  useEffect(() => {
    (async () => {
      const cfg = await readSyncConfig();
      if (cfg) {
        setEndpoint(cfg.spreadsheet_id ?? "");
        setLastSync(cfg.last_synced_at);
      }
      // The webhook address is admin-only; dispatchers and guards get an
      // empty result and see a locked field instead.
      const admin = await readAdminSyncConfig();
      if (admin) {
        setWebhook(admin.webhook_url ?? "");
        setCanEditWebhook(true);
      }
    })();
  }, []);

  async function save() {
    try {
      await saveSyncConfig({
        spreadsheet_id: endpoint || null,
        ...(canEditWebhook ? { webhook_url: webhook || null } : {}),
      });
      toast.success("Sync settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function testWebhook() {
    setBusy(true);
    try {
      const res = await ping();
      if (!res.sent) {
        toast.error("No webhook URL is configured yet");
        return;
      }
      const cfg = await readSyncConfig();
      setLastSync(cfg?.last_synced_at ?? new Date().toISOString());
      toast.success("Ping sent (check your Sheet)");
    } catch (e) {
      toast.error(`Ping failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kpi-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Google Sheet Auto-Sync</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Every dispatch, driver, or yard change is pushed to your Sheet webhook in real-time.
        Recommended: publish a Google Apps Script Web App on your master sheet (
        <a
          href="https://docs.google.com/spreadsheets/d/19r-9bBQCk55hNG12H6ankgTEa3i6fg-3/edit"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          open sheet
        </a>
        ) and paste its <code>/exec</code> URL below.
      </p>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Sheet Webhook URL (writes to sheet)
        </label>
        <input
          value={canEditWebhook ? webhook : ""}
          onChange={(e) => setWebhook(e.target.value)}
          disabled={!canEditWebhook}
          placeholder={
            canEditWebhook ? "https://script.google.com/macros/s/AKfyc.../exec" : "Admins only"
          }
          title={canEditWebhook ? undefined : "Only admins can view or change the webhook URL"}
          className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50 disabled:opacity-60"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Read-back Endpoint (optional REST/JSON)
        </label>
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.sheety.co/.../sheet1"
          className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono outline-none focus:border-primary/50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface-2"
        >
          Save
        </button>
        <button
          onClick={testWebhook}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Send Test Ping
        </button>
        <div className="text-xs text-muted-foreground flex items-center gap-2 ml-auto">
          <AlertTriangle className="h-3.5 w-3.5" />
          Last push:{" "}
          <span className="font-mono">
            {lastSync ? new Date(lastSync).toLocaleString() : "never"}
          </span>
        </div>
      </div>

      <details className="text-xs text-muted-foreground border border-border/60 rounded p-3">
        <summary className="cursor-pointer font-medium text-foreground">
          Apps Script snippet for your Sheet
        </summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{`function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActive().getSheetByName('Dispatch') || SpreadsheetApp.getActive().getSheets()[0];
  sheet.appendRow([new Date(), data.event, JSON.stringify(data.payload)]);
  return ContentService.createTextOutput('ok');
}`}</pre>
        <p className="mt-2">
          Deploy → New deployment → Web app → Execute as <em>Me</em>, Access <em>Anyone</em>. Paste
          the <code>/exec</code> URL above.
        </p>
      </details>
    </div>
  );
}
