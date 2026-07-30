import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Clock } from "lucide-react";
import { StatusChip, LocationChip } from "@/components/Chips";

export const Route = createFileRoute("/history/$loadId")({
  head: () => ({ meta: [{ title: "Trailer Timeline — VTCD Dispatch" }] }),
  component: HistoryDetail,
});

function HistoryDetail() {
  const { loadId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["history", loadId],
    queryFn: async () => {
      const [{ data: load }, { data: events }] = await Promise.all([
        supabase.from("loads").select("*").eq("id", loadId).maybeSingle(),
        supabase.from("trailer_events").select("*").eq("load_id", loadId).order("created_at", { ascending: true }),
      ]);
      return { load, events: events ?? [] };
    },
  });

  if (!data?.load) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const l = data.load;

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/history" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All loads
      </Link>

      <div className="kpi-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">Schedule</div>
            <div className="font-mono text-lg font-bold">{l.schedule_id}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {l.status && <StatusChip status={l.status} />}
            {l.return_trailer_location && <LocationChip location={l.return_trailer_location} />}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-[10px] uppercase text-muted-foreground">Driver</div><div>{l.driver ?? "—"}</div></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Store</div><div>{l.str_number} · {l.str_name}</div></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Outbound</div><div className="font-mono">{l.outbound_trailer}</div></div>
          <div><div className="text-[10px] uppercase text-muted-foreground">Return</div><div className="font-mono">{l.return_trailer ?? "—"}</div></div>
        </div>
      </div>

      <div className="kpi-card p-5">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-4">Timeline</h2>
        <ol className="relative border-l-2 border-border ml-2 space-y-4">
          {data.events.map((e) => (
            <li key={e.id} className="ml-4">
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-sm">{e.event_type}</span>
                {e.trailer_number && <span className="font-mono text-xs text-muted-foreground">#{e.trailer_number}</span>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <Clock className="h-3 w-3" />
                {new Date(e.created_at).toLocaleString()}
              </div>
              {e.notes && <div className="text-xs text-muted-foreground mt-1">{e.notes}</div>}
            </li>
          ))}
          {data.events.length === 0 && (
            <li className="text-sm text-muted-foreground ml-4">No events yet.</li>
          )}
        </ol>
      </div>
    </div>
  );
}
