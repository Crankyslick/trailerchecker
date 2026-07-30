import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLoads } from "@/hooks/use-loads";
import { StatusChip, LocationChip } from "@/components/Chips";
import { User } from "lucide-react";

export const Route = createFileRoute("/drivers")({
  head: () => ({ meta: [{ title: "Driver Board — VTCD Dispatch" }] }),
  component: DriverBoard,
});

function DriverBoard() {
  const { data: loads = [] } = useLoads();
  const drivers = useMemo(() => {
    const map = new Map<string, typeof loads>();
    loads.forEach((l) => {
      if (!l.driver) return;
      if (!map.has(l.driver)) map.set(l.driver, []);
      map.get(l.driver)!.push(l);
    });
    return Array.from(map.entries()).map(([name, list]) => {
      const sorted = [...list].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
      const current = sorted.find((l) => !["Completed", "Returned To DC"].includes(l.status ?? "")) ?? sorted[0];
      return { name, count: list.length, current };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [loads]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Driver Board</h1>
        <p className="text-sm text-muted-foreground">Current assignment and last activity for every driver.</p>
      </div>

      <div className="kpi-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-4">Driver</th>
                <th className="text-left font-medium py-3 px-4">Current Load</th>
                <th className="text-left font-medium py-3 px-4">Store</th>
                <th className="text-left font-medium py-3 px-4">Current Trailer</th>
                <th className="text-left font-medium py-3 px-4">Location</th>
                <th className="text-left font-medium py-3 px-4">Status</th>
                <th className="text-left font-medium py-3 px-4">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.name} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/15 text-primary grid place-items-center"><User className="h-4 w-4" /></div>
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-[11px] text-muted-foreground">{d.count} loads</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{d.current?.schedule_id ?? "—"}</td>
                  <td className="py-3 px-4">{d.current ? <>{d.current.str_number} · <span className="text-muted-foreground">{d.current.str_name}</span></> : "—"}</td>
                  <td className="py-3 px-4 font-mono text-xs">{d.current?.return_trailer ?? d.current?.outbound_trailer ?? "—"}</td>
                  <td className="py-3 px-4">{d.current?.return_trailer_location && <LocationChip location={d.current.return_trailer_location} />}</td>
                  <td className="py-3 px-4">{d.current?.status && <StatusChip status={d.current.status} />}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                    {d.current?.updated_at ? new Date(d.current.updated_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No drivers currently assigned.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
