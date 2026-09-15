import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLoads, useNowTick } from "@/hooks/use-loads";
import { yardHours, yardTier } from "@/lib/loads";
import { YardChip } from "@/components/Chips";
import { toast } from "sonner";
import { useReturnToDC } from "@/hooks/use-yard";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/yard")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Yard Inventory — VTCD Dispatch" }] }),
  component: YardPage,
});

function YardPage() {
  useNowTick(30_000);
  const { data: loads = [] } = useLoads();
  const returnMutation = useReturnToDC();

  const yardLoads = useMemo(() => {
    return loads
      .filter((l) => l.return_trailer_location === "Yard")
      .map((l) => ({ ...l, _hours: yardHours(l.yard_arrival_at) }))
      .sort((a, b) => (b._hours ?? 0) - (a._hours ?? 0));
  }, [loads]);

  const counts = useMemo(() => {
    let g = 0, y = 0, r = 0;
    yardLoads.forEach((l) => {
      const t = yardTier(l._hours);
      if (t === "green") g++; else if (t === "yellow") y++; else if (t === "red") r++;
    });
    return { g, y, r };
  }, [yardLoads]);

  function returnToDC(id: string) {
    returnMutation.mutate(id, {
      onSuccess: (row) => toast.success(`Trailer ${row.return_trailer ?? ""} returned to DC`.trim()),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yard Inventory</h1>
        <p className="text-sm text-muted-foreground">Return trailers currently sitting at Chambersburg yard.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="kpi-card p-4">
          <div className="text-[11px] uppercase tracking-widest text-success">&lt; 24h</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{counts.g}</div>
        </div>
        <div className="kpi-card p-4">
          <div className="text-[11px] uppercase tracking-widest text-warning">24–48h</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{counts.y}</div>
        </div>
        <div className="kpi-card p-4">
          <div className="text-[11px] uppercase tracking-widest text-danger">48h+</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{counts.r}</div>
        </div>
      </div>

      <div className="kpi-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-4">Return Trailer</th>
                <th className="text-left font-medium py-3 px-4">Store</th>
                <th className="text-left font-medium py-3 px-4">Driver</th>
                <th className="text-left font-medium py-3 px-4">Arrival</th>
                <th className="text-left font-medium py-3 px-4">Time In Yard</th>
                <th className="text-left font-medium py-3 px-4">Priority</th>
                <th className="text-right font-medium py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {yardLoads.map((l) => {
                const tier = yardTier(l._hours);
                const priority = tier === "red" ? "Critical" : tier === "yellow" ? "High" : "Normal";
                const pillCls = tier === "red"
                  ? "bg-danger/15 text-danger border-danger/30"
                  : tier === "yellow"
                  ? "bg-warning/15 text-warning border-warning/30"
                  : "bg-success/15 text-success border-success/30";
                return (
                  <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                    <td className="py-3 px-4 font-mono font-semibold">{l.return_trailer}</td>
                    <td className="py-3 px-4">{l.str_number} · <span className="text-muted-foreground">{l.str_name}</span></td>
                    <td className="py-3 px-4">{l.driver ?? "—"}</td>
                    <td className="py-3 px-4 text-xs tabular-nums">
                      {l.yard_arrival_at ? new Date(l.yard_arrival_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 px-4"><YardChip hours={l._hours} /></td>
                    <td className="py-3 px-4"><span className={`chip border ${pillCls}`}>{priority}</span></td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => returnToDC(l.id)} disabled={returnMutation.isPending}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                        {returnMutation.isPending ? "Working…" : "Return to DC"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {yardLoads.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No trailers currently in yard.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
