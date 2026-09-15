import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLoads } from "@/hooks/use-loads";
import { StatusChip, LocationChip, YardChip } from "@/components/Chips";
import { yardHours } from "@/lib/loads";
import { Search as SearchIcon } from "lucide-react";
import { guard } from "@/lib/route-guard";

export const Route = createFileRoute("/_authenticated/search")({
  beforeLoad: guard({ product: "trailer" }),
  head: () => ({ meta: [{ title: "Trailer Search — VTCD Dispatch" }] }),
  component: SearchPage,
});

function SearchPage() {
  const { data: loads = [] } = useLoads();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return loads.filter((l) =>
      [l.schedule_id, l.driver, l.outbound_trailer, l.return_trailer, l.str_number, l.str_name]
        .filter(Boolean).some((v) => v!.toString().toLowerCase().includes(s)));
  }, [loads, q]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trailer Search</h1>
        <p className="text-sm text-muted-foreground">Search by trailer #, schedule ID, driver or store.</p>
      </div>

      <div className="kpi-card p-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Type a trailer number, schedule ID, driver name, store…"
            className="w-full pl-10 pr-3 py-2.5 bg-surface-2 border border-border rounded-md text-sm outline-none focus:border-primary/50" />
        </div>
      </div>

      <div className="kpi-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-2/40">
              <tr className="border-b border-border">
                <th className="text-left font-medium py-3 px-4">Sch ID</th>
                <th className="text-left font-medium py-3 px-4">Date</th>
                <th className="text-left font-medium py-3 px-4">Driver</th>
                <th className="text-left font-medium py-3 px-4">Store</th>
                <th className="text-left font-medium py-3 px-4">Outbound</th>
                <th className="text-left font-medium py-3 px-4">Return</th>
                <th className="text-left font-medium py-3 px-4">Location</th>
                <th className="text-left font-medium py-3 px-4">Yard Time</th>
                <th className="text-left font-medium py-3 px-4">Status</th>
                <th className="text-right font-medium py-3 px-4">History</th>
              </tr>
            </thead>
            <tbody>
              {q.trim() === "" && (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Start typing to search.</td></tr>
              )}
              {q.trim() !== "" && results.length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">No matches.</td></tr>
              )}
              {results.map((l) => (
                <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-surface-2/30">
                  <td className="py-2.5 px-4 font-mono text-xs">{l.schedule_id}</td>
                  <td className="py-2.5 px-4 text-xs tabular-nums">{l.schedule_date}</td>
                  <td className="py-2.5 px-4">{l.driver ?? "—"}</td>
                  <td className="py-2.5 px-4">{l.str_number} · <span className="text-muted-foreground">{l.str_name}</span></td>
                  <td className="py-2.5 px-4 font-mono text-xs">{l.outbound_trailer}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{l.return_trailer ?? "—"}</td>
                  <td className="py-2.5 px-4">{l.return_trailer_location && <LocationChip location={l.return_trailer_location} />}</td>
                  <td className="py-2.5 px-4"><YardChip hours={yardHours(l.yard_arrival_at)} /></td>
                  <td className="py-2.5 px-4">{l.status && <StatusChip status={l.status} />}</td>
                  <td className="py-2.5 px-4 text-right">
                    <Link to="/history/$loadId" params={{ loadId: l.id }} className="text-xs text-primary hover:underline">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
