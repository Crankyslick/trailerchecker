import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated Database types don't know this table/RPC yet
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

function realtimeSubscribe(table: string, onChange: () => void) {
  let ch: ReturnType<typeof supabase.channel> | undefined;
  try {
    ch = supabase.channel(`${table}-stream-${Math.random().toString(36).slice(2)}`);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => void onChange(),
    ).subscribe();
  } catch (e) {
    console.error(`[realtime:${table}] subscribe failed`, e);
  }
  return () => {
    try {
      if (ch) supabase.removeChannel(ch);
    } catch {
      /* noop */
    }
  };
}

// ---------------------------------------------------------------------------
// Driver mobile: the signed-in driver's own assigned loads.
// ---------------------------------------------------------------------------

export type MyLoad = {
  id: string;
  schedule_id: string;
  origin_name: string | null;
  str_name: string | null;
  status: string;
  is_exception: boolean;
  exception_reason: string | null;
  outbound_trailer: string | null;
};

export function useMyLoads() {
  const query = useQuery({
    queryKey: ["loads", "mine"],
    queryFn: async (): Promise<MyLoad[]> => {
      // "My loads" means the loads assigned to the signed-in person's own
      // driver record. Dispatchers and admins can read every row, so the
      // filter has to be explicit here rather than left to the access rules.
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return [];

      const { data: driverRow, error: driverErr } = await sb
        .from("drivers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (driverErr) throw new Error(driverErr.message);
      if (!driverRow?.id) return [];

      const { data, error } = await sb
        .from("trailer_loads")
        .select(
          "id, schedule_id, origin_name, str_name, status, is_exception, exception_reason, outbound_trailer",
        )
        .eq("driver_id", driverRow.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as MyLoad[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("trailer_loads", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function driverUpdateStatus(loadId: string, newStatus: string) {
  const { error } = await sb.rpc("driver_update_status", {
    p_load_id: loadId,
    p_new_status: newStatus,
  });
  if (error) throw new Error(error.message);
}

export async function flagException(loadId: string, reason: string) {
  const { error } = await sb.rpc("flag_exception", { p_load_id: loadId, p_reason: reason });
  if (error) throw new Error(error.message);
  // Fire-and-forget: an alert failure must never fail the driver's action.
  void triggerAlert("exception", loadId);
}


export async function resolveException(loadId: string, resolutionNote: string | null) {
  const { error } = await sb.rpc("resolve_exception", {
    p_load_id: loadId,
    p_resolution_note: resolutionNote,
  });
  if (error) throw new Error(error.message);
}

export async function capturePod(input: {
  loadId: string;
  recipientName: string;
  signatureSvg: string | null;
  photoPath: string | null;
  notes: string | null;
}) {
  const { error } = await sb.rpc("capture_pod", {
    p_load_id: input.loadId,
    p_recipient_name: input.recipientName,
    p_signature_svg: input.signatureSvg,
    p_photo_path: input.photoPath,
    p_notes: input.notes,
  });
  if (error) throw new Error(error.message);
  void triggerAlert("pod", input.loadId);
}


/** Uploads a POD photo to the private pod-photos bucket; returns its storage path. */
export async function uploadPodPhoto(
  loadId: string,
  companyId: string,
  file: File,
): Promise<string> {
  const path = `${companyId}/${loadId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("pod-photos").upload(path, file);
  if (error) throw new Error(error.message);
  return path;
}

// ---------------------------------------------------------------------------
// Exceptions dashboard (dispatcher/admin).
// ---------------------------------------------------------------------------

export type ExceptionLoad = {
  id: string;
  schedule_id: string;
  origin_name: string | null;
  str_name: string | null;
  driver: string | null;
  status: string;
  exception_reason: string | null;
  exception_at: string | null;
};

export function useExceptions() {
  const query = useQuery({
    queryKey: ["loads", "exceptions"],
    queryFn: async (): Promise<ExceptionLoad[]> => {
      const { data, error } = await sb
        .from("trailer_loads")
        .select(
          "id, schedule_id, origin_name, str_name, driver, status, exception_reason, exception_at",
        )
        .eq("is_exception", true)
        .order("exception_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ExceptionLoad[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("trailer_loads", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await sb
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as NotificationRow[];
    },
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => realtimeSubscribe("notifications", () => query.refetch()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export async function markNotificationRead(id: string) {
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Driver session + activity tracking
// ---------------------------------------------------------------------------

export type DriverSession = { id: string };

/**
 * Starts a driver_sessions row on mount, ends it on unmount and (best-effort)
 * on the browser tab closing. Deliberately scoped to the /driver route only,
 * not the global auth flow, so it never touches dispatcher/admin/guard
 * sign-in.
 */
export function useDriverSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentId: string | null = null;

    async function start() {
      try {
        const { data, error } = await sb.rpc("start_driver_session", {
          p_device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
          p_app_version: null,
          p_user_agent: navigator.userAgent,
        });
        if (error) throw new Error(error.message);
        if (cancelled) return;
        currentId = (data as DriverSession).id;
        setSessionId(currentId);
      } catch (e) {
        console.error("[driver session] failed to start", e);
      }
    }
    void start();

    function endBeacon() {
      if (!currentId) return;
      // Best-effort only: browsers don't guarantee an async fetch/rpc call
      // completes after beforeunload fires, and sendBeacon can't carry the
      // Supabase auth header this RPC needs. The reliable path is the
      // unmount cleanup below, which covers in-app navigation away from
      // /driver; an actual tab close may leave the session marked active
      // until it naturally goes stale (last_seen_at stops advancing).
      void sb.rpc("end_driver_session", { p_session_id: currentId }).catch(() => {});
    }
    window.addEventListener("beforeunload", endBeacon);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", endBeacon);
      if (currentId) {
        void sb.rpc("end_driver_session", { p_session_id: currentId }).catch(() => {});
      }
    };
  }, []);

  return sessionId;
}

export async function logDriverActivity(input: {
  sessionId: string;
  activityType: "status_update" | "exception_reported" | "pod_submitted" | "location_ping";
  loadId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await sb.from("driver_activity_log").insert({
      user_id: user.id,
      session_id: input.sessionId,
      activity_type: input.activityType,
      load_id: input.loadId ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("[driver activity] log failed", error.message);
  } catch (e) {
    // Activity logging is best-effort; it should never block the action it's logging.
    console.error("[driver activity] log failed", e);
  }
}

export async function sendDriverLocation(
  loadId: string,
): Promise<{ latitude: number; longitude: number }> {
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  });

  const { latitude, longitude } = position.coords;
  const { error } = await sb.rpc("driver_send_location", {
    p_load_id: loadId,
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw new Error(error.message);

  return { latitude, longitude };
}
