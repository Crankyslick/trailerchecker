import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLoads } from "@/hooks/use-loads";
import { StatusChip } from "@/components/Chips";
import { Store } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stores")({
  head: () => ({ meta: [{ title: "Store Board — VTCD Dispatch" }] }),
  component: StoreBoard,
});

function StoreBoard() {
  const { data: loads = [] } = useLoads();
  const today = new Date().toISOString().slice(0, 10);

  const groups = useMemo(() => {
    const map = new Map<string, { number: string; name: string; loads: typeof loads }>();
    loads.forEach((l) => {
      if (!l.str_number) return;
      const key = l.str_number;
      if (!map.has(key)) map.set(key, { number: l.str_number, name: l.str_name ?? "", loads: [] });
      map.get(key)!.loads.push(l);
    });
    return Array.from(map.values()).sort((a, b) => a.number.localeCompare(b.number));
  }, [loads]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Store Board</h1>
        <p className="text-sm text-muted-foreground">Per-store snapshot — today's loads, drivers, return trailers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((g) => {
          const todays = g.loads.filter((l) => l.schedule_date === today);
          const active = g.loads.find((l) => !["Completed", "Returned To DC"].includes(l.status ?? ""));
          return (
            <div key={g.number} className="kpi-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-md bg-primary/15 text-primary grid place-items-center shrink-0">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Store</div>
                    <div className="font-bold text-lg leading-tight truncate">{g.number}</div>
                    <div className="text-xs text-muted-foreground truncate">{g.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Today</div>
                  <div className="text-2xl font-bold tabular-nums">{todays.length}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Assigned Driver</div>
                  <div className="font-medium truncate">{active?.driver ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Return Trailer</div>
                  <div className="font-mono text-xs">{active?.return_trailer ?? "—"}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1.5">Current Status</div>
                {active?.status ? <StatusChip status={active.status} /> : <span className="text-xs text-muted-foreground">No active load</span>}
              </div>

              <div className="border-t border-border pt-3 text-xs text-muted-foreground flex justify-between">
                <span>{g.loads.length} total loads</span>
                <span>{g.loads.filter((l) => l.status === "Completed").length} completed</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
