import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Truck, Users, Warehouse, CheckCircle2, Clock, AlertTriangle,
  TrendingUp, PackageCheck, ArrowDownToLine
} from "lucide-react";
import { useLoads, useNowTick } from "@/hooks/use-loads";
import { yardHours, formatDuration } from "@/lib/loads";
import { StatusChip, YardChip } from "@/components/Chips";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VTCD Dispatch — Operations Dashboard" },
      { name: "description", content: "Real-time Target trailer operations from Chambersburg PA DC." },
    ],
  }),
  component: Dashboard,
});

function KPI({ label, value, hint, icon: Icon, accent }: {
  label: string; value: string | number; hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "warning" | "danger" | "success" | "info";
}) {
  const ringColor = {
    primary: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    danger: "text-danger bg-danger/10",
    success: "text-success bg-success/10",
    info: "text-info bg-info/10",
  }[accent ?? "primary"];
  return (
    <div className="kpi-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        <div className={`h-9 w-9 rounded-md grid place-items-center ${ringColor}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  useNowTick(30_000);
  const { data: loads = [], isLoading } = useLoads();

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todays = loads.filter((l) => l.schedule_date === today);
    const yardLoads = loads.filter((l) => l.return_trailer_location === "Yard");
    const tiers = yardLoads.map((l) => yardHours(l.yard_arrival_at));
    const u24 = tiers.filter((h) => h != null && h < 24).length;
    const m2448 = tiers.filter((h) => h != null && h >= 24 && h < 48).length;
    const o48 = tiers.filter((h) => h != null && h >= 48).length;
    const drivers = new Set(loads.filter((l) => l.driver).map((l) => l.driver)).size;
    const active = loads.filter((l) =>
      !["Completed", "Returned To DC"].includes(l.status ?? "")).length;
    const completed = loads.filter((l) => l.status === "Completed").length;
    const returning = loads.filter((l) => l.return_trailer_location === "Returning").length;
    const avgYard = tiers.length
      ? tiers.reduce((a, b) => (a as number) + (b ?? 0), 0)! / tiers.length
      : null;
    return {
      todays: todays.length, active, completed, drivers,
      atYard: yardLoads.length, returning, u24, m2448, o48,
      avgYard,
    };
  }, [loads]);

  const alerts = useMemo(() => {
    const arr: { kind: "warn" | "danger"; text: string; to?: string }[] = [];
    loads.forEach((l) => {
      const h = yardHours(l.yard_arrival_at);
      if (h != null && h >= 48) arr.push({ kind: "danger", text: `${l.return_trailer} at yard > 48h — return immediately`, to: "/yard" });
      else if (h != null && h >= 24) arr.push({ kind: "warn", text: `${l.return_trailer} at yard ${formatDuration(h)}`, to: "/yard" });
      if (!l.driver) arr.push({ kind: "warn", text: `${l.schedule_id} has no driver assigned`, to: "/loads" });
      if (l.status === "Delivered" && !l.return_trailer) arr.push({ kind: "warn", text: `${l.schedule_id} missing return trailer #`, to: "/loads" });
      if (l.status === "Delayed") arr.push({ kind: "danger", text: `${l.schedule_id} delayed at ${l.str_name}`, to: "/loads" });
    });
    return arr.slice(0, 8);
  }, [loads]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live view of every driver, trailer and store.</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${loads.length} loads in system`}
        </div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPI label="Today's Loads"      value={stats.todays}     icon={Truck} accent="primary" />
        <KPI label="Active Loads"       value={stats.active}     icon={TrendingUp} accent="info" />
        <KPI label="Completed"          value={stats.completed}  icon={CheckCircle2} accent="success" />
        <KPI label="Drivers Assigned"   value={stats.drivers}    icon={Users} accent="primary" />
        <KPI label="Trailers At Yard"   value={stats.atYard}     icon={Warehouse} accent="warning" />
        <KPI label="Trailers Returning" value={stats.returning}  icon={ArrowDownToLine} accent="info" />
        <KPI label="< 24 Hours"         value={stats.u24}        icon={Clock} accent="success" />
        <KPI label="24–48 Hours"        value={stats.m2448}      icon={Clock} accent="warning" />
        <KPI label="48+ Hours"          value={stats.o48}        icon={AlertTriangle} accent="danger" />
        <KPI label="Avg Yard Time"      value={formatDuration(stats.avgYard)} icon={PackageCheck} accent="primary" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="kpi-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Trailers at Yard</h2>
            <Link to="/yard" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-medium py-2 px-4">Return Trailer</th>
                  <th className="text-left font-medium py-2 px-4">Store</th>
                  <th className="text-left font-medium py-2 px-4">Driver</th>
                  <th className="text-left font-medium py-2 px-4">Time In Yard</th>
                </tr>
              </thead>
              <tbody>
                {loads.filter((l) => l.return_trailer_location === "Yard").slice(0, 6).map((l) => {
                  const h = yardHours(l.yard_arrival_at);
                  return (
                    <tr key={l.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 px-4 font-mono font-semibold">{l.return_trailer}</td>
                      <td className="py-3 px-4">{l.str_number} · <span className="text-muted-foreground">{l.str_name}</span></td>
                      <td className="py-3 px-4">{l.driver ?? "—"}</td>
                      <td className="py-3 px-4"><YardChip hours={h} /></td>
                    </tr>
                  );
                })}
                {!loads.some((l) => l.return_trailer_location === "Yard") && (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">No trailers at yard</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="kpi-card p-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">Live Alerts</h2>
          {alerts.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">All clear ✓</div>
          )}
          <ul className="space-y-2 max-h-[340px] overflow-y-auto">
            {alerts.map((a, i) => (
              <li key={i} className={`flex items-start gap-2 p-2 rounded-md border text-xs ${
                a.kind === "danger"
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-warning/30 bg-warning/10 text-warning"}`}>
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">{a.text}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="kpi-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Today's Schedule</h2>
          <Link to="/loads" className="text-xs text-primary hover:underline">Open load board →</Link>
        </div>
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-2 px-4">Sch ID</th>
                <th className="text-left font-medium py-2 px-4">Store</th>
                <th className="text-left font-medium py-2 px-4">Driver</th>
                <th className="text-left font-medium py-2 px-4">Outbound</th>
                <th className="text-left font-medium py-2 px-4">Return</th>
                <th className="text-left font-medium py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loads.slice(0, 8).map((l) => (
                <tr key={l.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50">
                  <td className="py-2.5 px-4 font-mono text-xs">{l.schedule_id}</td>
                  <td className="py-2.5 px-4">{l.str_number} · <span className="text-muted-foreground">{l.str_name}</span></td>
                  <td className="py-2.5 px-4">{l.driver ?? <span className="text-danger">Unassigned</span>}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{l.outbound_trailer}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{l.return_trailer ?? "—"}</td>
                  <td className="py-2.5 px-4">{l.status && <StatusChip status={l.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
