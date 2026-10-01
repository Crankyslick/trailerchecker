import { useEffect } from "react";
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

// ---------------------------------------------------------------------------
// Geofences
// ---------------------------------------------------------------------------

export type Geofence = {
  id: string;
  name: string;
  location_code: string | null;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
};

export function useGeofences() {
  const query = useQuery({
    queryKey: ["geofences"],
    queryFn: async (): Promise<Geofence[]> => {
      const { data, error } = await sb
        .from("geofences")
        .select("id, name, location_code, center_lat, center_lng, radius_meters")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Geofence[];
    },
    placeholderData: keepPreviousData,
  });
  return query;
}

export async function createGeofence(input: {
  name: string;
  locationCode: string | null;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}) {
  const { error } = await sb.from("geofences").insert({
    name: input.name,
    location_code: input.locationCode,
    center_lat: input.centerLat,
    center_lng: input.centerLng,
    radius_meters: input.radiusMeters,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Inbound webhook token
// ---------------------------------------------------------------------------

export function useInboundToken() {
  return useQuery({
    queryKey: ["sync_secrets", "inbound_token"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.rpc("get_inbound_token");
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    },
  });
}

export async function rotateInboundToken(): Promise<string> {
  const { data, error } = await sb.rpc("rotate_inbound_token");
  if (error) throw new Error(error.message);
  return data as string;
}

// ---------------------------------------------------------------------------
// Reconciliation — planned vs. actual
// ---------------------------------------------------------------------------

export type ReconciliationLoad = {
  id: string;
  schedule_id: string;
  origin_name: string | null;
  str_name: string | null;
  status: string;
  cutoff_date: string | null;
  cutoff_time: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  eta_at: string | null;
  eta_source: string | null;
  proof_of_delivery: { signed_at: string }[];
};

export function useReconciliation() {
  const query = useQuery({
    queryKey: ["loads", "reconciliation"],
    queryFn: async (): Promise<ReconciliationLoad[]> => {
      const { data, error } = await sb
        .from("trailer_loads")
        .select(
          `id, schedule_id, origin_name, str_name, status,
           cutoff_date, cutoff_time, arrival_date, arrival_time,
           eta_at, eta_source,
           proof_of_delivery ( signed_at )`,
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReconciliationLoad[];
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | undefined;
    try {
      ch = supabase
        .channel(`reconciliation-stream-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "trailer_loads" },
          () => void query.refetch(),
        )
        .subscribe();
    } catch {
      /* noop */
    }
    return () => {
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}

// ---------------------------------------------------------------------------
// Live tracking activity
// ---------------------------------------------------------------------------

export type TrackingEvent = {
  id: string;
  external_id: string;
  asset_type: string | null;
  matched_by: string | null;
  provider: string | null;
  latitude: number | null;
  longitude: number | null;
  speed_mph: number | null;
  heading_deg: number | null;
  recorded_at: string;
  received_at: string;
  load_id: string | null;
  load_schedule_id: string | null;
};

export type TrackedAsset = {
  external_id: string;
  latitude: number | null;
  longitude: number | null;
  speed_mph: number | null;
  heading_deg: number | null;
  recorded_at: string;
  received_at: string;
  load_id: string | null;
  load_schedule_id: string | null;
  matched_by: string | null;
};

/** Most recent inbound pings for the signed-in company. */
export function useRecentTrackingEvents(limit = 25) {
  const query = useQuery({
    queryKey: ["tracking_events", "recent", limit],
    queryFn: async (): Promise<TrackingEvent[]> => {
      const { data, error } = await sb.rpc("recent_tracking_events", { p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as TrackingEvent[];
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | undefined;
    try {
      ch = supabase
        .channel(`tracking-stream-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "tracking_events" },
          () => void query.refetch(),
        )
        .subscribe();
    } catch {
      /* noop */
    }
    return () => {
      try {
        if (ch) supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}

/** Latest known position per tracked asset. */
export function useLatestTrackingLocations() {
  return useQuery({
    queryKey: ["tracking_events", "latest"],
    queryFn: async (): Promise<TrackedAsset[]> => {
      const { data, error } = await sb.rpc("latest_tracking_locations");
      if (error) throw new Error(error.message);
      return (data ?? []) as TrackedAsset[];
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}
