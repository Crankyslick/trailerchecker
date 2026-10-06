import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, MapPin, Clock, AlertTriangle, CheckCircle2, PackageX, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Branded public shipper tracking page. No session required — reads go
// through get_tracking_by_token / get_tracking_milestones_by_token, each
// granted to anon but scoped to an exact, unguessable token match (see the
// migration for the full rationale). Nothing here exposes rates, internal
// notes, or anything beyond one leg's status and milestone history.
const sb = supabase as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type TrackingInfo = {
  found: boolean;
  schedule_id: string | null;
  status: string | null;
  origin_name: string | null;
  destination_name: string | null;
  eta_at: string | null;
  expected_pickup: string | null;
  expected_delivery: string | null;
  is_exception: boolean | null;
  updated_at: string | null;
};

type Milestone = { event_type: string; note: string | null; created_at: string };

export const Route = createFileRoute("/track/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Track your shipment — Me Do Logistics" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackingPage,
});

function TrackingPage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<TrackingInfo | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [infoRes, milestonesRes] = await Promise.all([
        sb.rpc("get_tracking_by_token", { p_token: token }),
        sb.rpc("get_tracking_milestones_by_token", { p_token: token }),
      ]);
      if (cancelled) return;
      if (infoRes.error) {
        setError(infoRes.error.message);
        setLoading(false);
        return;
      }
      const row = (Array.isArray(infoRes.data) ? infoRes.data[0] : infoRes.data) as
        | TrackingInfo
        | undefined;
      if (!row?.found) {
        setError("We couldn't find a shipment for this tracking link.");
        setLoading(false);
        return;
      }
      setInfo(row);
      setMilestones(((milestonesRes.data as Milestone[] | null) ?? []).slice().reverse());
      setLoading(false);
    }
    void load();
    const interval = setInterval(load, 30_000); // live ETA/status refresh
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-surface-2">
      <header className="border-b border-border bg-surface px-4 py-3 flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <span className="font-semibold">Me Do Logistics — Shipment Tracking</span>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading shipment…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <PackageX className="h-8 w-8 text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {!loading && !error && info && (
          <>
            <div className="rounded-xl border border-border bg-surface shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{info.schedule_id}</span>
                <span className="chip border bg-primary/10 text-primary border-primary/30">
                  {info.status}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {info.origin_name ?? "—"} → {info.destination_name ?? "—"}
                </span>
              </div>
              {info.eta_at && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    Live ETA: <strong>{new Date(info.eta_at).toLocaleString()}</strong>
                  </span>
                </div>
              )}
              {info.is_exception && (
                <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 rounded-md p-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  This shipment has an open exception. Your contact at Me Do Logistics has been
                  notified.
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Last updated {info.updated_at ? new Date(info.updated_at).toLocaleString() : "—"} ·
                refreshes automatically
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface shadow-sm p-5">
              <h2 className="text-sm font-semibold mb-3">Milestone history</h2>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones recorded yet.</p>
              ) : (
                <ol className="space-y-3">
                  {milestones.map((m, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium">{m.event_type}</div>
                        {m.note && <div className="text-muted-foreground text-xs">{m.note}</div>}
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
