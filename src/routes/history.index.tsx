import { createFileRoute, Link } from "@tanstack/react-router";
import { useLoads } from "@/hooks/use-loads";
import { History } from "lucide-react";

export const Route = createFileRoute("/history/")({
  head: () => ({ meta: [{ title: "Trailer History — VTCD Dispatch" }] }),
  component: HistoryIndex,
});

function HistoryIndex() {
  const { data: loads = [] } = useLoads();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trailer History</h1>
        <p className="text-sm text-muted-foreground">Pick a load to view its full audit timeline.</p>
      </div>
      <div className="kpi-card divide-y divide-border">
        {loads.map((l) => (
          <Link key={l.id} to="/history/$loadId" params={{ loadId: l.id }}
            className="flex items-center gap-4 p-3 hover:bg-surface-2/40">
            <div className="h-9 w-9 rounded-md bg-primary/15 text-primary grid place-items-center shrink-0">
              <History className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <div className="font-mono text-xs truncate">{l.schedule_id}</div>
              <div className="truncate">{l.driver ?? "—"}</div>
              <div className="truncate">{l.str_number} · {l.str_name}</div>
              <div className="font-mono text-xs truncate">OB {l.outbound_trailer}</div>
              <div className="font-mono text-xs truncate">RT {l.return_trailer ?? "—"}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
