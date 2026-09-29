import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BellRing, PackageCheck, Truck, MapPin } from "lucide-react";
import { guard } from "@/lib/route-guard";
import { useCurrentUser } from "@/hooks/use-auth";
import { NotificationBell } from "@/components/NotificationBell";
import {
  useMyLoads,
  useNotifications,
  markNotificationRead,
  driverUpdateStatus,
  flagException,
  capturePod,
  uploadPodPhoto,
  useDriverSession,
  logDriverActivity,
  sendDriverLocation,
  type MyLoad,
} from "@/hooks/use-driver";

export const Route = createFileRoute("/_authenticated/driver")({
  beforeLoad: guard({ roles: ["driver", "admin", "dispatcher", "owner"], product: "trailer" }),
  head: () => ({ meta: [{ title: "My Loads — Me Do Logistics" }] }),
  component: DriverPage,
});

const NEXT_STATUS: Record<string, string | null> = {
  Assigned: "Heading To DC",
  "Heading To DC": "Loaded",
  Loaded: "En Route",
  "En Route": null, // delivery captured via POD, not a plain status click
  "Picked Up Return Trailer": "Returning",
  Returning: "At Yard",
  "At Yard": "Returned To DC",
  "Returned To DC": "Completed",
};

function DriverPage() {
  const { data: loads, isLoading, refetch } = useMyLoads();
  const { profile } = useCurrentUser();
  const sessionId = useDriverSession();
  const { data: notifications } = useNotifications();

  const assignments = (notifications ?? []).filter((n) => n.type === "load_assigned");
  const unreadAssignments = assignments.filter((n) => !n.read_at);
  const seen = useRef<Set<string> | null>(null);

  // Toast (once) for each newly arrived assignment alert and pull in the load.
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(assignments.map((n) => n.id));
      return;
    }
    const fresh = assignments.filter((n) => !seen.current!.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => {
      seen.current!.add(n.id);
      toast.success(n.title, { description: n.body ?? undefined });
    });
    void refetch();
  }, [assignments, refetch]);

  async function dismissAssignments() {
    await Promise.all(unreadAssignments.map((n) => markNotificationRead(n.id).catch(() => {})));
  }

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">My Loads</h1>
          <p className="text-sm text-muted-foreground">
            {profile?.full_name ?? "Signed in"} — today's assignments
          </p>
        </div>
        <NotificationBell />
      </div>

      {unreadAssignments.length > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <BellRing className="h-4 w-4" />
            {unreadAssignments.length === 1
              ? "New load assigned to you"
              : `${unreadAssignments.length} new loads assigned to you`}
          </div>
          <ul className="space-y-1">
            {unreadAssignments.slice(0, 3).map((n) => (
              <li key={n.id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{n.title}</span>
                {n.body ? ` — ${n.body}` : ""}
              </li>
            ))}
          </ul>
          <button
            onClick={dismissAssignments}
            className="text-xs rounded-md border border-border px-2 py-1 hover:bg-surface-2/60"
          >
            Got it
          </button>
        </div>
      )}


      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (loads ?? []).length === 0 && (
        <div className="text-sm text-muted-foreground">No loads assigned to you right now.</div>
      )}

      <div className="space-y-3">
        {(loads ?? []).map((load) => (
          <LoadCard key={load.id} load={load} sessionId={sessionId} />
        ))}
      </div>
    </div>
  );
}

function LoadCard({ load, sessionId }: { load: MyLoad; sessionId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [sendingLoc, setSendingLoc] = useState(false);
  const [showException, setShowException] = useState(false);
  const [showPod, setShowPod] = useState(false);

  const isDone = load.status === "Delivered" || load.status === "Completed";
  const next = NEXT_STATUS[load.status];

  async function advance() {
    if (!next) return;
    setBusy(true);
    try {
      await driverUpdateStatus(load.id, next);
      toast.success(`Updated to ${next}`);
      if (sessionId) {
        void logDriverActivity({
          sessionId,
          activityType: "status_update",
          loadId: load.id,
          metadata: { status: next },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function sendLocation() {
    setSendingLoc(true);
    try {
      const { latitude, longitude } = await sendDriverLocation(load.id);
      toast.success("Location sent");
      if (sessionId) {
        void logDriverActivity({
          sessionId,
          activityType: "location_ping",
          loadId: load.id,
          metadata: { latitude, longitude },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send location");
    } finally {
      setSendingLoc(false);
    }
  }

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        load.is_exception ? "border-danger/40 bg-danger/5" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{load.schedule_id}</span>
        <span className="chip border bg-primary/10 text-primary border-primary/30">
          {load.status}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
        <span>
          {load.origin_name ?? "—"} → {load.str_name ?? "—"}
        </span>
      </div>

      {load.is_exception && (
        <div className="flex items-start gap-2 text-xs text-danger bg-danger/10 rounded-md p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{load.exception_reason}</span>
        </div>
      )}

      {!isDone && (
        <div className="flex flex-wrap gap-2 pt-1">
          {next && (
            <button
              onClick={advance}
              disabled={busy}
              className="flex-1 min-w-[140px] rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Updating…" : `Mark: ${next}`}
            </button>
          )}
          {load.status === "En Route" && (
            <button
              onClick={() => setShowPod(true)}
              className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-md bg-success text-white py-2.5 text-sm font-medium"
            >
              <PackageCheck className="h-4 w-4" /> Deliver
            </button>
          )}
          <button
            onClick={sendLocation}
            disabled={sendingLoc}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2.5 text-sm font-medium disabled:opacity-50"
          >
            <MapPin className="h-4 w-4" /> {sendingLoc ? "Sending…" : "Send Location"}
          </button>
          <button
            onClick={() => setShowException(true)}
            className="rounded-md border border-danger/40 text-danger px-3 py-2.5 text-sm font-medium"
          >
            Report Exception
          </button>
        </div>
      )}

      {showException && (
        <ExceptionForm
          loadId={load.id}
          sessionId={sessionId}
          onClose={() => setShowException(false)}
        />
      )}
      {showPod && <PodForm load={load} sessionId={sessionId} onClose={() => setShowPod(false)} />}
    </div>
  );
}

function ExceptionForm({
  loadId,
  sessionId,
  onClose,
}: {
  loadId: string;
  sessionId: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      toast.error("Describe the issue");
      return;
    }
    setSaving(true);
    try {
      await flagException(loadId, reason);
      toast.success("Exception reported — dispatch has been notified");
      if (sessionId) {
        void logDriverActivity({
          sessionId,
          activityType: "exception_reported",
          loadId,
          metadata: { reason },
        });
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm">What's the issue?</h2>
        <textarea
          className="w-full rounded-md border border-border bg-surface px-2 py-2 text-sm min-h-[90px]"
          placeholder="e.g. Trailer damage, late gate, wrong product…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-md bg-danger text-white py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Sending…" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PodForm({
  load,
  sessionId,
  onClose,
}: {
  load: MyLoad;
  sessionId: string | null;
  onClose: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = pos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    drawing.current = false;
  }
  function clearSig() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
  }

  async function submit() {
    if (!recipient.trim()) {
      toast.error("Recipient name is required");
      return;
    }
    setSaving(true);
    try {
      let photoPath: string | null = null;
      // The RPC resolves company_id server-side from the load itself; the
      // upload path just needs to be unique, so a placeholder segment is fine.
      if (photo) photoPath = await uploadPodPhoto(load.id, "shared", photo);
      const signatureSvg = canvasRef.current?.toDataURL("image/png") ?? null;
      await capturePod({
        loadId: load.id,
        recipientName: recipient,
        signatureSvg,
        photoPath,
        notes: notes || null,
      });
      toast.success("Delivered — proof of delivery recorded");
      if (sessionId) {
        void logDriverActivity({
          sessionId,
          activityType: "pod_submitted",
          loadId: load.id,
          metadata: { recipient, hasPhoto: !!photo },
        });
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record delivery");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface shadow-xl p-4 space-y-3 max-h-[92vh] overflow-y-auto">
        <h2 className="font-semibold text-sm">Proof of delivery</h2>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Recipient name *</label>
          <input
            className="w-full rounded-md border border-border bg-surface px-2 py-2 text-sm"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Signature</label>
          <canvas
            ref={canvasRef}
            width={320}
            height={140}
            className="w-full rounded-md border border-border bg-white touch-none"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <button
            onClick={clearSig}
            className="text-xs text-muted-foreground hover:text-foreground mt-1"
          >
            Clear
          </button>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Notes</label>
          <textarea
            className="w-full rounded-md border border-border bg-surface px-2 py-2 text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-md border border-border py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-md bg-success text-white py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Confirm delivery"}
          </button>
        </div>
      </div>
    </div>
  );
}
