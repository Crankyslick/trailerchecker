import { createFileRoute } from "@tanstack/react-router";
import { guard } from "@/lib/route-guard";
import { useReconciliation, type ReconciliationLoad } from "@/hooks/use-integrations";

export const Route = createFileRoute("/_authenticated/reconciliation")({
  beforeLoad: guard({ roles: ["owner", "admin", "dispatcher"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Reconciliation — Me Do Logistics" }] }),
  component: ReconciliationPage,
});

function combine(date: string | null, time: string | null): Date | null {
  if (!date) return null;
  const d = new Date(`${date}T${time ?? "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtVariance(minutes: number | null) {
  if (minutes === null) return { label: "—", tone: "muted" as const };
  const abs = Math.abs(Math.round(minutes));
  const label = `${minutes > 0 ? "+" : minutes < 0 ? "−" : ""}${abs}m`;
  if (abs <= 30) return { label, tone: "good" as const };
  if (abs <= 120) return { label, tone: "warn" as const };
  return { label, tone: "bad" as const };
}

const TONE_CLASS: Record<string, string> = {
  good: "bg-success/10 text-success border-success/30",
  warn: "bg-warning/10 text-warning border-warning/30",
  bad: "bg-danger/10 text-danger border-danger/30",
  muted: "bg-surface-2 text-muted-foreground border-border",
};

function ReconciliationPage() {
  const { data: loads, isLoading } = useReconciliation();

  const rows = (loads ?? []).map((l: ReconciliationLoad) => {
    const plannedDelivery = combine(l.arrival_date, l.arrival_time);
    const actualDelivery = l.proof_of_delivery?.[0]?.signed_at
      ? new Date(l.proof_of_delivery[0].signed_at)
      : null;
    const eta = l.eta_at ? new Date(l.eta_at) : null;

    const varianceMinutes =
      plannedDelivery && actualDelivery
        ? (actualDelivery.getTime() - plannedDelivery.getTime()) / 60000
        : null;

    return {
      load: l,
      plannedDelivery,
      actualDelivery,
      eta,
      variance: fmtVariance(varianceMinutes),
    };
  });

  const lateOrOpen = rows.filter(
    (r) =>
      r.variance.tone === "bad" ||
      r.variance.tone === "warn" ||
      (!r.actualDelivery && r.plannedDelivery && r.plannedDelivery < new Date()),
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Planned delivery time vs. actual (from proof of delivery) or estimated (from a tracking
          feed, if connected). {lateOrOpen.length} load{lateOrOpen.length === 1 ? "" : "s"} need
          attention.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-3 py-2">Load</th>
              <th className="text-left px-3 py-2">Route</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Planned Delivery</th>
              <th className="text-left px-3 py-2">ETA</th>
              <th className="text-left px-3 py-2">Actual Delivery</th>
              <th className="text-left px-3 py-2">Variance</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No loads yet.
                </td>
              </tr>
            )}
            {rows.map(({ load, plannedDelivery, actualDelivery, eta, variance }) => (
              <tr key={load.id} className="border-t border-border hover:bg-surface-2/50">
                <td className="px-3 py-2 font-mono text-xs">{load.schedule_id}</td>
                <td className="px-3 py-2 text-xs">
                  {load.origin_name ?? "—"} → {load.str_name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="chip border bg-primary/10 text-primary border-primary/30">
                    {load.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {plannedDelivery ? plannedDelivery.toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {eta
                    ? `${eta.toLocaleString()}${load.eta_source ? ` (${load.eta_source})` : ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {actualDelivery ? actualDelivery.toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`chip border text-xs ${TONE_CLASS[variance.tone]}`}>
                    {variance.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
