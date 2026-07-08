import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Truck, Warehouse, AlertTriangle, Clock, Activity, ShieldCheck,
  CalendarDays, Users, PackageX, Gauge, MapPin, Send,
} from "lucide-react";
import { useLoads } from "@/hooks/use-loads";
import { useDrivers } from "@/hooks/use-drivers";
import type { LoadRow } from "@/lib/loads";
import { toast } from "sonner";
import { DispatchModal } from "@/components/DispatchModal";
import { GuardCheckInModal } from "@/components/GuardCheckInModal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Control Tower — Trailer Checker" },
      { name: "description", content: "Real-time yard compliance, 24h turnaround enforcement, and live trailer dispatch control." },
    ],
  }),
  component: ControlTower,
});

/* -------------------- Types & seed -------------------- */

type ActiveTrailer = {
  id: string;
  trailer: string;
  store: string;
  destination: string;
  yard: "Yard 91" | "Yard 301" | "Paterson Yard";
  returnTime: number; // epoch ms
  nextDriver: string | null;
  nextRdcTrailer: string | null;
  nextSchedule: string | null;
  pickupCutoff: string | null; // HH:MM
  source: "live" | "seed";
};

const YARDS: ActiveTrailer["yard"][] = ["Yard 91", "Yard 301", "Paterson Yard"];
const COMPLIANCE_HOURS = 24;
const WARN_HOURS = 18;

function hoursAgo(h: number) { return Date.now() - h * 3_600_000; }

const SEED: ActiveTrailer[] = [
  { id: "s1", trailer: "482917", store: "2247", destination: "Riverdale Rt 23", yard: "Yard 91",
    returnTime: hoursAgo(4.9), nextDriver: "Ahmed Beshir", nextRdcTrailer: "551204", nextSchedule: "SCH-2181", pickupCutoff: "14:30", source: "seed" },
  { id: "s2", trailer: "553108", store: "1888", destination: "Bethlehem PA", yard: "Yard 301",
    returnTime: hoursAgo(14.25), nextDriver: null, nextRdcTrailer: "480127", nextSchedule: "SCH-2189", pickupCutoff: "16:00", source: "seed" },
  { id: "s3", trailer: "617502", store: "3391", destination: "Paterson NJ", yard: "Paterson Yard",
    returnTime: hoursAgo(19.7), nextDriver: "Miguel Ortiz", nextRdcTrailer: null, nextSchedule: "SCH-2192", pickupCutoff: "12:15", source: "seed" },
  { id: "s4", trailer: "701845", store: "1120", destination: "Wilkes-Barre PA", yard: "Yard 91",
    returnTime: hoursAgo(24.8), nextDriver: null, nextRdcTrailer: "552901", nextSchedule: "SCH-2198", pickupCutoff: "10:45", source: "seed" },
];

/* -------------------- 1s ticker -------------------- */

function useSecondTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(t);
  }, []);
}

function fmtHMS(totalSec: number): string {
  const sign = totalSec < 0 ? "-" : "";
  const s = Math.abs(Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${sign}${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`;
}
function fmtHM(totalSec: number): string {
  const s = Math.abs(Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
function estDateParts(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/* -------------------- Component -------------------- */

function ControlTower() {
  useSecondTick();
  const { data: loads = [] } = useLoads();
  const { data: drivers = [] } = useDrivers();
  const [dispatched, setDispatched] = useState<Set<string>>(new Set());

  // Merge live loads with return_trailer_location = "Yard" alongside seed mocks.
  const activeTrailers = useMemo<ActiveTrailer[]>(() => {
    const live: ActiveTrailer[] = loads
      .filter((l) => {
        const t = l as LoadRow & { str_return_trailer_started_at: string | null };
        return l.return_trailer && t.str_return_trailer_started_at && l.return_trailer_location === "Yard";
      })
      .map((l, i) => {
        const t = l as LoadRow & { str_return_trailer_started_at: string | null };
        return {
          id: l.id,
          trailer: l.return_trailer!,
          store: l.str_number ?? "—",
          destination: l.str_name ?? "—",
          yard: YARDS[i % YARDS.length],
          returnTime: new Date(t.str_return_trailer_started_at!).getTime(),
          nextDriver: l.driver,
          nextRdcTrailer: l.outbound_trailer,
          nextSchedule: l.schedule_id,
          pickupCutoff: l.cutoff_time,
          source: "live" as const,
        };
      });
    return [...live, ...SEED].filter((t) => !dispatched.has(t.id));
  }, [loads, dispatched]);

  const tomorrow = estDateParts(1);
  const today = estDateParts(0);
  const todaysLoads = loads.filter((l) => (l.schedule_date ?? l.cutoff_date) === today).length;
  const tomorrowsLoads = loads.filter((l) => (l.schedule_date ?? l.cutoff_date) === tomorrow);
  const driversMissing = tomorrowsLoads.filter((l) => !l.driver).length;
  const trailersMissing = tomorrowsLoads.filter((l) => !l.outbound_trailer).length;
  const coveragePct = tomorrowsLoads.length === 0
    ? 100
    : Math.round(((tomorrowsLoads.length - Math.max(driversMissing, trailersMissing)) / tomorrowsLoads.length) * 100);

  // Compute per-trailer status (recomputes each tick because component re-renders)
  const now = Date.now();
  const enriched = activeTrailers.map((t) => {
    const elapsedSec = Math.floor((now - t.returnTime) / 1000);
    const remainingSec = COMPLIANCE_HOURS * 3600 - elapsedSec;
    const elapsedH = elapsedSec / 3600;
    return { ...t, elapsedSec, remainingSec, elapsedH };
  });

  const returnedTotal = enriched.length;
  const yardCount = (name: ActiveTrailer["yard"]) => enriched.filter((t) => t.yard === name).length;
  const over18 = enriched.filter((t) => t.elapsedH >= WARN_HOURS && t.elapsedH < COMPLIANCE_HOURS).length;
  const over24 = enriched.filter((t) => t.elapsedH >= COMPLIANCE_HOURS);
  const avgSec = enriched.length ? enriched.reduce((s, t) => s + t.elapsedSec, 0) / enriched.length : 0;
  const compliancePct = enriched.length === 0 ? 100 : Math.round(((enriched.length - over24.length) / enriched.length) * 100);

  const [modal, setModal] = useState<{ id: string; trailer: string; yard: string; prevDriver: string | null } | null>(null);
  const [guardOpen, setGuardOpen] = useState(false);

  const dispatch = (id: string, trailer: string, yard: string, prevDriver: string | null) => {
    setModal({ id, trailer, yard, prevDriver });
  };
  const confirmDispatched = () => {
    if (modal) setDispatched((prev) => new Set(prev).add(modal.id));
  };

  return (
    <div className="space-y-5">
      <DispatchModal
        open={!!modal}
        onClose={() => setModal(null)}
        trailer={modal?.trailer ?? ""}
        yard={modal?.yard ?? ""}
        previousDriver={modal?.prevDriver ?? null}
        onDispatched={confirmDispatched}
      />
      <GuardCheckInModal open={guardOpen} onClose={() => setGuardOpen(false)} />

      {/* Page header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Control Tower
          </h1>
          <p className="text-sm text-muted-foreground">
            Live yard compliance · {COMPLIANCE_HOURS}h turnaround enforced · {enriched.length} active trailers
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Ticking every 1s
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Truck} label="Returned Trailers" value={returnedTotal} />
        <Kpi icon={Warehouse} label="Yard 91" value={yardCount("Yard 91")} />
        <Kpi icon={Warehouse} label="Yard 301" value={yardCount("Yard 301")} />
        <Kpi icon={Warehouse} label="Paterson Yard" value={yardCount("Paterson Yard")} />
        <Kpi icon={Clock} label="Over 18h" value={over18} tone={over18 > 0 ? "warn" : "ok"} />
        <Kpi icon={AlertTriangle} label="Over 24h" value={over24.length} tone={over24.length > 0 ? "danger" : "ok"} />
        <Kpi icon={Gauge} label="Avg Yard Duration" value={enriched.length ? fmtHM(avgSec) : "—"} />
        <Kpi icon={CalendarDays} label="Today's Loads" value={todaysLoads} />
        <Kpi icon={CalendarDays} label="Tomorrow's Loads" value={tomorrowsLoads.length} />
        <Kpi icon={Users} label="Drivers Missing" value={driversMissing} tone={driversMissing > 0 ? "danger" : "ok"} />
        <Kpi icon={PackageX} label="Trailers Missing" value={trailersMissing} tone={trailersMissing > 0 ? "danger" : "ok"} />
        <Kpi icon={ShieldCheck} label="Compliance %" value={`${compliancePct}%`} tone={compliancePct === 100 ? "ok" : "warn"} />
      </div>

      {/* Yard utilization + critical alerts */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="kpi-card p-4 md:col-span-1">
          <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Yard Utilization</h2>
          <div className="mt-3 space-y-2.5">
            {YARDS.map((y) => {
              const c = yardCount(y);
              const pct = Math.min(100, (c / 6) * 100);
              return (
                <div key={y}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{y}</span>
                    <span className="tabular-nums font-mono">{c} active</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Coverage (Tomorrow)</span>
            <span className={`chip border ${coveragePct === 100 ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}`}>
              {coveragePct}%
            </span>
          </div>
        </div>

        <div className={`kpi-card p-4 md:col-span-2 border ${over24.length > 0 ? "!border-danger/50 bg-danger/10" : "!border-success/40 bg-success/5"}`}>
          <div className="flex items-center gap-2">
            {over24.length > 0
              ? <AlertTriangle className="h-5 w-5 text-danger" />
              : <ShieldCheck className="h-5 w-5 text-success" />}
            <h2 className="text-sm font-semibold">Critical Alerts</h2>
          </div>
          {over24.length === 0 ? (
            <p className="mt-2 text-sm text-success">Compliance holding steady — 0 trailers past 24 hours.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-danger font-semibold">
                {over24.length} trailer{over24.length > 1 ? "s" : ""} past {COMPLIANCE_HOURS}h at Yard 589.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {over24.map((t) => (
                  <span key={t.id} className="chip border bg-danger/20 text-danger border-danger/40 font-mono animate-pulse">
                    {t.trailer} · {t.yard} · +{fmtHM(-t.remainingSec)} over
                  </span>
                ))}
              </div>
            </>
          )}
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Plan tomorrow's board to close coverage gaps.</span>
            <Link to="/tomorrow" className="text-primary hover:underline">Open Tomorrow Board →</Link>
          </div>
        </div>
      </div>

      {/* Live Trailer Control table */}
      <div className="kpi-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold">Live Trailer Control</h2>
            <p className="text-xs text-muted-foreground">Hours in yard tick up · time to compliance ticks down · every second.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="chip border bg-success/15 text-success border-success/30">&lt; 18h OK</span>
            <span className="chip border bg-warning/15 text-warning border-warning/30">18–24h Warn</span>
            <span className="chip border bg-danger/15 text-danger border-danger/30">≥ 24h Breach</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-3">Trailer #</th>
                <th className="text-left font-medium py-3 px-3">Store</th>
                <th className="text-left font-medium py-3 px-3">Destination</th>
                <th className="text-left font-medium py-3 px-3">Current Yard</th>
                <th className="text-left font-medium py-3 px-3">Return Time</th>
                <th className="text-left font-medium py-3 px-3 min-w-[150px]">Hours in Yard</th>
                <th className="text-left font-medium py-3 px-3 min-w-[170px]">Time Until Limit</th>
                <th className="text-left font-medium py-3 px-3 min-w-[160px]">Assigned Next Driver</th>
                <th className="text-left font-medium py-3 px-3">Next RDC Trailer</th>
                <th className="text-left font-medium py-3 px-3">Next Schedule</th>
                <th className="text-left font-medium py-3 px-3">Pickup Cutoff</th>
                <th className="text-right font-medium py-3 px-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((t) => {
                const overdue = t.elapsedH >= COMPLIANCE_HOURS;
                const warn = t.elapsedH >= WARN_HOURS && !overdue;
                const chipCls = overdue
                  ? "bg-danger/20 text-danger border-danger/50"
                  : warn
                    ? "bg-warning/20 text-warning border-warning/40"
                    : "bg-success/15 text-success border-success/30";
                const rowCls = overdue
                  ? "bg-danger/10 hover:bg-danger/15 animate-pulse"
                  : warn ? "hover:bg-warning/5" : "hover:bg-surface-2/30";
                return (
                  <tr key={t.id} className={`border-b border-border/40 last:border-0 transition-colors ${rowCls}`}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-primary">{t.trailer}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{t.store}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{t.destination}</td>
                    <td className="py-2.5 px-3 text-xs">{t.yard}</td>
                    <td className="py-2.5 px-3 text-xs tabular-nums whitespace-nowrap">
                      {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t.returnTime))}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs tabular-nums">
                      <span className={`chip border ${chipCls}`}>
                        <Clock className="h-3 w-3" /> {fmtHMS(t.elapsedSec)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs tabular-nums">
                      {overdue
                        ? <span className="text-danger font-semibold">Expired · {fmtHMS(-t.remainingSec)} over</span>
                        : <span className={warn ? "text-warning" : "text-foreground"}>Expires in {fmtHMS(t.remainingSec)}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {t.nextDriver
                        ? <span className="font-medium">{t.nextDriver}</span>
                        : <span className="text-danger font-semibold">— Unassigned —</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs">{t.nextRdcTrailer ?? <span className="text-danger">missing</span>}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{t.nextSchedule ?? "—"}</td>
                    <td className="py-2.5 px-3 font-mono text-xs tabular-nums">{t.pickupCutoff ?? "—"}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button onClick={() => dispatch(t.id, t.trailer, t.yard, t.nextDriver)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90">
                        <Send className="h-3.5 w-3.5" /> Dispatch
                      </button>
                    </td>
                  </tr>
                );
              })}
              {enriched.length === 0 && (
                <tr><td colSpan={12} className="py-12 text-center text-muted-foreground">All trailers dispatched. Yard is clear.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
          <span>{drivers.length} drivers available in roster</span>
          <Link to="/tomorrow" className="text-primary hover:underline">Plan Tomorrow's Board →</Link>
        </div>
      </div>
    </div>
  );
}

/* -------------------- KPI card -------------------- */

function Kpi({ icon: Icon, label, value, tone = "neutral" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger" ? "text-danger" :
    tone === "warn" ? "text-warning" :
    tone === "ok" ? "text-success" : "text-foreground";
  const iconCls =
    tone === "danger" ? "text-danger" :
    tone === "warn" ? "text-warning" :
    tone === "ok" ? "text-success" : "text-primary";
  return (
    <div className="kpi-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        <Icon className={`h-4 w-4 ${iconCls}`} />
      </div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}
