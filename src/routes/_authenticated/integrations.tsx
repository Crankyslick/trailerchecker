import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Plus, MapPin, Radio } from "lucide-react";
import { guard } from "@/lib/route-guard";
import {
  useGeofences,
  createGeofence,
  useInboundToken,
  rotateInboundToken,
  useRecentTrackingEvents,
  useLatestTrackingLocations,
  type Geofence,
  type TrackingEvent,
  type TrackedAsset,
} from "@/hooks/use-integrations";

export const Route = createFileRoute("/_authenticated/integrations")({
  beforeLoad: guard({ roles: ["owner", "admin"], product: "trailer" }),
  head: () => ({ meta: [{ title: "Integrations — Me Do Logistics" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <div className="p-4 md:p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          This is the receiving side for location data. Point Motive, Samsara, Geotab, a driver
          phone app, or any custom source at the tracking endpoint below — the payload shape is
          detected automatically.
        </p>
      </div>

      <WebhookSection />
      <TrackingActivitySection />
      <GeofenceSection />
    </div>
  );
}

function WebhookSection() {
  const { data: token, refetch } = useInboundToken();
  const [busy, setBusy] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/tracking`
      : "/api/public/tracking";

  async function rotate() {
    setBusy(true);
    try {
      await rotateInboundToken();
      await refetch();
      toast.success("Token generated — any previous token stops working immediately");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate token");
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast.success("Copied");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Tracking webhook</h2>
      <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">URL</span>
          <code className="flex-1 truncate bg-surface-2 rounded px-2 py-1 text-xs">{url}</code>
          <button onClick={() => copy(url)} className="text-muted-foreground hover:text-foreground">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">Token</span>
          <code className="flex-1 truncate bg-surface-2 rounded px-2 py-1 text-xs">
            {token ?? "— none generated yet —"}
          </code>
          {token && (
            <button
              onClick={() => copy(token)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={rotate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> {token ? "Rotate token" : "Generate token"}
        </button>
        <p className="text-xs text-muted-foreground pt-1">
          Send <code>Authorization: Bearer &lt;token&gt;</code> with the provider's own payload.
          Motive, Samsara and Geotab bodies are recognised as-is. A custom source can post{" "}
          <code>{`{ external_id, latitude, longitude, speed_mph, recorded_at, eta_at? }`}</code> (or{" "}
          <code>{`{ events: [...] }`}</code> for a batch). <code>external_id</code> is matched
          against the outbound trailer, the return trailer, or the driver on an open load. Repeated
          deliveries of the same ping are stored only once.
        </p>
      </div>
    </section>
  );
}

const MATCH_LABELS: Record<string, { label: string; tone: string }> = {
  outbound_trailer: { label: "Outbound trailer", tone: "bg-emerald-500/15 text-emerald-400" },
  return_trailer: { label: "Return trailer", tone: "bg-sky-500/15 text-sky-400" },
  driver: { label: "Driver", tone: "bg-violet-500/15 text-violet-400" },
  ambiguous: { label: "Unclear match", tone: "bg-amber-500/15 text-amber-400" },
};

function MatchChip({ matchedBy }: { matchedBy: string | null }) {
  const m = matchedBy ? MATCH_LABELS[matchedBy] : undefined;
  if (!m) {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
        No load
      </span>
    );
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.tone}`}>{m.label}</span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function coords(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return "—";
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function TrackingActivitySection() {
  const { data: events, isLoading, error } = useRecentTrackingEvents(25);
  const { data: assets } = useLatestTrackingLocations();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Live tracking activity</h2>
      </div>

      {error && (
        <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Could not load tracking data"}
        </div>
      )}

      {!error && (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
              Assets reporting now ({(assets ?? []).length})
            </div>
            {(assets ?? []).length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                No asset has reported a position yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(assets ?? []).map((a: TrackedAsset) => (
                  <div
                    key={a.external_id}
                    className="px-3 py-2 flex items-center gap-2 text-sm flex-wrap"
                  >
                    <span className="font-mono text-xs font-medium">{a.external_id}</span>
                    <MatchChip matchedBy={a.matched_by} />
                    {a.load_schedule_id && (
                      <span className="text-xs text-muted-foreground">{a.load_schedule_id}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground font-mono">
                      {coords(a.latitude, a.longitude)}
                    </span>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {a.speed_mph === null ? "—" : `${a.speed_mph} mph`}
                    </span>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {timeAgo(a.recorded_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
              Recent pings
            </div>
            {isLoading && <div className="px-3 py-4 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && (events ?? []).length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Nothing received yet. Generate a token above and point a provider or driver phone at
                the tracking URL.
              </div>
            )}
            <div className="divide-y divide-border">
              {(events ?? []).map((e: TrackingEvent) => (
                <div key={e.id} className="px-3 py-2 flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-mono text-xs font-medium">{e.external_id}</span>
                  <MatchChip matchedBy={e.matched_by} />
                  {e.load_schedule_id && (
                    <span className="text-xs text-muted-foreground">{e.load_schedule_id}</span>
                  )}
                  {e.provider && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] bg-surface-2 text-muted-foreground">
                      {e.provider}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {coords(e.latitude, e.longitude)}
                  </span>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {e.speed_mph === null ? "—" : `${e.speed_mph} mph`}
                  </span>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {timeAgo(e.recorded_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}


function GeofenceSection() {
  const { data: geofences, isLoading, refetch } = useGeofences();
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Geofences</h2>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add geofence
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (geofences ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">
          No geofences yet. A tracking ping inside one logs a "Geofence entered" event on the
          matching load.
        </div>
      )}
      <div className="space-y-1.5">
        {(geofences ?? []).map((g: Geofence) => (
          <div
            key={g.id}
            className="rounded-md border border-border p-2.5 flex items-center gap-2 text-sm"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium">{g.name}</span>
            {g.location_code && (
              <span className="font-mono text-xs text-muted-foreground">({g.location_code})</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {g.center_lat.toFixed(4)}, {g.center_lng.toFixed(4)} · {g.radius_meters}m radius
            </span>
          </div>
        ))}
      </div>

      {open && (
        <NewGeofenceModal
          onClose={() => setOpen(false)}
          onCreated={() => {
            void refetch();
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function NewGeofenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("300");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!name.trim() || Number.isNaN(latN) || Number.isNaN(lngN)) {
      toast.error("Name, latitude, and longitude are required");
      return;
    }
    setSaving(true);
    try {
      await createGeofence({
        name,
        locationCode: locationCode || null,
        centerLat: latN,
        centerLng: lngN,
        radiusMeters: Number(radius) || 300,
      });
      toast.success("Geofence created");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create geofence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">New Geofence</div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Name *</label>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Location code (optional)
            </label>
            <input
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Latitude *</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Longitude *</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Radius (m)</label>
              <input
                className="w-full rounded-md border border-border bg-surface px-2 py-1.5"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
