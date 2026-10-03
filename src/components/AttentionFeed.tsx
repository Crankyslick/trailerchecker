import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { LoadRow } from "@/lib/loads";
import { usePendingAccessorials, useInvoiceAging } from "@/hooks/use-commercial";

export type AttentionItem = {
  key: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  to: string;
};

/** Pure: derive operational attention items from live loads. */
export function buildAttentionItems(
  loads: LoadRow[],
  opts: { now: number; today: string; tomorrow: string; deadlineHours: number; criticalHours: number },
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const l of loads) {
    if (l.status === "Completed") continue;
    const id = l.schedule_id ?? l.id.slice(0, 8);
    if (l.status === "Exception" || (l.is_exception && !l.exception_resolved_at)) {
      items.push({ key: `ex-${l.id}`, severity: "critical", title: `Exception on ${id}`, detail: l.exception_reason ?? "Needs review", to: "/exceptions" });
    } else if (l.status === "Delayed") {
      items.push({ key: `dl-${l.id}`, severity: "warning", title: `${id} is delayed`, detail: l.str_name ?? "Check with driver", to: "/loads" });
    }
    const day = l.schedule_date ?? l.cutoff_date;
    if ((day === opts.today || day === opts.tomorrow) && l.status === "Assigned") {
      const urgent = day === opts.today;
      if (!l.driver) items.push({ key: `nd-${l.id}`, severity: urgent ? "critical" : "warning", title: `No driver on ${id}`, detail: `Due ${urgent ? "today" : "tomorrow"}`, to: "/loads" });
      if (!l.outbound_trailer) items.push({ key: `nt-${l.id}`, severity: urgent ? "critical" : "warning", title: `No trailer on ${id}`, detail: `Due ${urgent ? "today" : "tomorrow"}`, to: "/loads" });
    }
    const yardAt = l.return_trailer_location === "Yard" ? (l.yard_arrival_at ?? l.str_return_trailer_started_at) : null;
    if (yardAt) {
      const h = (opts.now - new Date(yardAt).getTime()) / 3_600_000;
      if (h >= opts.criticalHours) items.push({ key: `yc-${l.id}`, severity: "critical", title: `Trailer ${l.return_trailer ?? "?"} in yard ${Math.floor(h)}h`, detail: `Past the ${opts.criticalHours}h limit`, to: "/yard" });
      else if (h >= opts.deadlineHours) items.push({ key: `yw-${l.id}`, severity: "warning", title: `Trailer ${l.return_trailer ?? "?"} in yard ${Math.floor(h)}h`, detail: `Past the ${opts.deadlineHours}h turnaround`, to: "/yard" });
    }
  }
  return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

export function AttentionFeed({ items, showMoney }: { items: AttentionItem[]; showMoney: boolean }) {
  const { data: pending = [] } = usePendingAccessorials();
  const { data: aging = [] } = useInvoiceAging();
  const all = [...items];
  if (showMoney) {
    if (pending.length) all.push({ key: "acc", severity: "warning", title: `${pending.length} extra charge${pending.length > 1 ? "s" : ""} waiting for approval`, detail: "They won't be billed until approved", to: "/billing" });
    const overdue = aging.filter((a) => a.aging_bucket !== "current");
    if (overdue.length) {
      const sum = overdue.reduce((s, a) => s + Number(a.total_amount), 0);
      all.push({ key: "ar", severity: overdue.some((a) => a.aging_bucket === "90+" || a.aging_bucket === "61-90") ? "critical" : "warning", title: `${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""}`, detail: `$${sum.toFixed(2)} past due`, to: "/billing" });
    }
    const disputed = aging.filter((a) => a.status === "DISPUTED").length;
    if (disputed) all.push({ key: "dsp", severity: "warning", title: `${disputed} disputed invoice${disputed > 1 ? "s" : ""}`, detail: "Waiting on resolution", to: "/billing" });
  }
  const crit = all.filter((i) => i.severity === "critical").length;

  return (
    <div className="kpi-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> What needs my attention
        </h2>
        <span className="text-xs text-muted-foreground">{crit} critical · {all.length - crit} warning</span>
      </div>
      {all.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> All clear — nothing needs action right now.</div>
      ) : (
        <ul className="divide-y divide-border max-h-72 overflow-y-auto">
          {all.slice(0, 40).map((i) => (
            <li key={i.key}>
              <Link to={i.to as "/loads"} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-2/50 px-1 rounded">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${i.severity === "critical" ? "bg-danger" : "bg-warning"}`} />
                  <span className="text-sm truncate">{i.title}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{i.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
