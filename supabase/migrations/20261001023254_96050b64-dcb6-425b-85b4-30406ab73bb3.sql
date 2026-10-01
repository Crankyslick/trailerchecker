-- GPS ingest hardening

DROP FUNCTION IF EXISTS public.ingest_tracking_event(
  uuid, text, double precision, double precision, numeric, numeric,
  timestamptz, timestamptz, text, jsonb);

ALTER TABLE public.tracking_events ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_dedupe_uniq
  ON public.tracking_events (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.geofence_presence (
  load_id     uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  geofence_id uuid NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entered_at  timestamptz NOT NULL,
  PRIMARY KEY (load_id, geofence_id)
);
CREATE INDEX IF NOT EXISTS geofence_presence_company_idx ON public.geofence_presence(company_id);
ALTER TABLE public.geofence_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geofence_presence FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.geofence_presence TO service_role;

CREATE OR REPLACE FUNCTION public.ingest_tracking_event(
  p_company_id   uuid,
  p_external_id  text,
  p_latitude     double precision,
  p_longitude    double precision,
  p_speed_mph    numeric,
  p_heading_deg  numeric,
  p_recorded_at  timestamptz,
  p_eta_at       timestamptz DEFAULT NULL,
  p_eta_source   text        DEFAULT NULL,
  p_raw_payload  jsonb       DEFAULT NULL,
  p_asset_type   text        DEFAULT NULL,
  p_provider     text        DEFAULT NULL)
RETURNS public.tracking_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key        text := lower(btrim(coalesce(p_external_id, '')));
  v_tenant     uuid;
  v_load_id    uuid;
  v_matched_by text;
  v_n          integer;
  v_dedupe     text;
  v_event      public.tracking_events;
  v_fence      public.geofences;
  v_dist       double precision;
  v_rows       integer;
BEGIN
  IF v_key = '' THEN RAISE EXCEPTION 'external_id is required'; END IF;
  IF p_recorded_at IS NULL THEN RAISE EXCEPTION 'recorded_at is required'; END IF;
  IF (p_latitude IS NOT NULL AND abs(p_latitude) > 90)
     OR (p_longitude IS NOT NULL AND abs(p_longitude) > 180) THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.companies WHERE id = p_company_id;

  v_dedupe := md5(concat_ws('|', p_company_id::text, v_key,
                            extract(epoch FROM p_recorded_at)::text,
                            coalesce(p_latitude::text, ''), coalesce(p_longitude::text, '')));

  SELECT count(*), (array_agg(id ORDER BY created_at DESC))[1] INTO v_n, v_load_id
    FROM public.trailer_loads
   WHERE company_id = p_company_id AND superseded_by_id IS NULL
     AND lower(btrim(coalesce(outbound_trailer, ''))) = v_key
     AND status NOT IN ('Completed', 'Delivered');
  IF v_n > 1 THEN v_load_id := NULL; v_matched_by := 'ambiguous';
  ELSIF v_n = 1 THEN v_matched_by := 'outbound_trailer'; END IF;

  IF v_matched_by IS NULL THEN
    SELECT count(*), (array_agg(id ORDER BY created_at DESC))[1] INTO v_n, v_load_id
      FROM public.trailer_loads
     WHERE company_id = p_company_id AND superseded_by_id IS NULL
       AND lower(btrim(coalesce(return_trailer, ''))) = v_key
       AND status NOT IN ('Completed', 'Delivered');
    IF v_n > 1 THEN v_load_id := NULL; v_matched_by := 'ambiguous';
    ELSIF v_n = 1 THEN v_matched_by := 'return_trailer'; END IF;
  END IF;

  IF v_matched_by IS NULL THEN
    SELECT count(*), (array_agg(l.id ORDER BY l.created_at DESC))[1] INTO v_n, v_load_id
      FROM public.trailer_loads l
     WHERE l.company_id = p_company_id AND l.superseded_by_id IS NULL
       AND l.status NOT IN ('Completed', 'Delivered')
       AND (lower(btrim(coalesce(l.driver, ''))) = v_key
            OR l.driver_id IN (SELECT d.id FROM public.drivers d
                                WHERE d.tenant_id = v_tenant AND lower(btrim(d.name)) = v_key));
    IF v_n > 1 THEN v_load_id := NULL; v_matched_by := 'ambiguous';
    ELSIF v_n = 1 THEN v_matched_by := 'driver'; END IF;
  END IF;

  INSERT INTO public.tracking_events (
    company_id, load_id, external_id, latitude, longitude, speed_mph,
    heading_deg, recorded_at, raw_payload, asset_type, matched_by, provider, dedupe_key)
  VALUES (
    p_company_id, v_load_id, p_external_id, p_latitude, p_longitude, p_speed_mph,
    p_heading_deg, p_recorded_at, p_raw_payload, p_asset_type, v_matched_by, p_provider, v_dedupe)
  ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING * INTO v_event;

  IF v_event.id IS NULL THEN
    SELECT * INTO v_event FROM public.tracking_events
     WHERE company_id = p_company_id AND dedupe_key = v_dedupe;
    RETURN v_event;
  END IF;

  IF v_load_id IS NOT NULL AND p_eta_at IS NOT NULL THEN
    UPDATE public.trailer_loads SET eta_at = p_eta_at, eta_source = p_eta_source WHERE id = v_load_id;
  END IF;

  IF v_load_id IS NOT NULL AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tracking_events te
                      WHERE te.load_id = v_load_id AND te.recorded_at > p_recorded_at AND te.id <> v_event.id) THEN
    FOR v_fence IN SELECT * FROM public.geofences WHERE company_id = p_company_id LOOP
      v_dist := 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
                  cos(radians(p_latitude)) * cos(radians(v_fence.center_lat)) *
                  cos(radians(v_fence.center_lng) - radians(p_longitude)) +
                  sin(radians(p_latitude)) * sin(radians(v_fence.center_lat)))));
      IF v_dist <= v_fence.radius_meters THEN
        INSERT INTO public.geofence_presence (load_id, geofence_id, company_id, entered_at)
        VALUES (v_load_id, v_fence.id, p_company_id, p_recorded_at)
        ON CONFLICT (load_id, geofence_id) DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN
          INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, source)
          VALUES (v_load_id, p_external_id, 'Geofence entered', v_fence.name, 'tracking');
        END IF;
      ELSIF v_dist > v_fence.radius_meters * 1.1 THEN
        DELETE FROM public.geofence_presence WHERE load_id = v_load_id AND geofence_id = v_fence.id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 1 THEN
          INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, source)
          VALUES (v_load_id, p_external_id, 'Geofence exited', v_fence.name, 'tracking');
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric,
  timestamptz, timestamptz, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric,
  timestamptz, timestamptz, text, jsonb, text, text) TO service_role;

-- richer dispatcher views
DROP FUNCTION IF EXISTS public.recent_tracking_events(integer);
CREATE FUNCTION public.recent_tracking_events(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid, external_id text, asset_type text, matched_by text, provider text,
  latitude double precision, longitude double precision, speed_mph numeric,
  heading_deg numeric, recorded_at timestamptz, received_at timestamptz,
  load_id uuid, load_schedule_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to view tracking data'; END IF;
  RETURN QUERY
    SELECT te.id, te.external_id, te.asset_type, te.matched_by, te.provider,
           te.latitude, te.longitude, te.speed_mph, te.heading_deg,
           te.recorded_at, te.received_at, te.load_id, tl.schedule_id
    FROM public.tracking_events te
    LEFT JOIN public.trailer_loads tl ON tl.id = te.load_id
    WHERE te.company_id = v_company
    ORDER BY te.received_at DESC
    LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
END; $$;
REVOKE ALL ON FUNCTION public.recent_tracking_events(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recent_tracking_events(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.latest_tracking_locations()
RETURNS TABLE (
  external_id text, latitude double precision, longitude double precision,
  speed_mph numeric, heading_deg numeric, recorded_at timestamptz,
  received_at timestamptz, load_id uuid, load_schedule_id text, matched_by text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to view tracking data'; END IF;
  RETURN QUERY
    SELECT DISTINCT ON (te.external_id)
           te.external_id, te.latitude, te.longitude, te.speed_mph, te.heading_deg,
           te.recorded_at, te.received_at, te.load_id, tl.schedule_id, te.matched_by
    FROM public.tracking_events te
    LEFT JOIN public.trailer_loads tl ON tl.id = te.load_id
    WHERE te.company_id = v_company
    ORDER BY te.external_id, te.received_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.latest_tracking_locations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.latest_tracking_locations() TO authenticated;