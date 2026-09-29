ALTER TABLE public.tracking_events
  ADD COLUMN IF NOT EXISTS asset_type text,
  ADD COLUMN IF NOT EXISTS matched_by text,
  ADD COLUMN IF NOT EXISTS provider text;

CREATE INDEX IF NOT EXISTS tracking_events_company_recorded_idx
  ON public.tracking_events (company_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.ingest_tracking_event(
  p_company_id uuid,
  p_external_id text,
  p_latitude double precision,
  p_longitude double precision,
  p_speed_mph numeric,
  p_heading_deg numeric,
  p_recorded_at timestamp with time zone,
  p_eta_at timestamp with time zone DEFAULT NULL,
  p_eta_source text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT NULL,
  p_asset_type text DEFAULT NULL,
  p_provider text DEFAULT NULL
)
RETURNS public.tracking_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_load_id uuid;
  v_matched_by text;
  v_key text := lower(btrim(coalesce(p_external_id, '')));
  v_event public.tracking_events;
  v_fence public.geofences;
  v_driver_id uuid;
BEGIN
  IF v_key = '' THEN
    RAISE EXCEPTION 'external_id is required';
  END IF;

  -- 1) outbound trailer
  SELECT id INTO v_load_id FROM public.trailer_loads
  WHERE company_id = p_company_id
    AND lower(btrim(coalesce(outbound_trailer, ''))) = v_key
    AND status NOT IN ('Completed', 'Delivered')
  ORDER BY created_at DESC LIMIT 1;
  IF v_load_id IS NOT NULL THEN v_matched_by := 'outbound_trailer'; END IF;

  -- 2) return trailer
  IF v_load_id IS NULL THEN
    SELECT id INTO v_load_id FROM public.trailer_loads
    WHERE company_id = p_company_id
      AND lower(btrim(coalesce(return_trailer, ''))) = v_key
      AND status NOT IN ('Completed', 'Delivered')
    ORDER BY created_at DESC LIMIT 1;
    IF v_load_id IS NOT NULL THEN v_matched_by := 'return_trailer'; END IF;
  END IF;

  -- 3) driver / tractor unit (by driver record name, then by typed driver text)
  IF v_load_id IS NULL THEN
    SELECT d.id INTO v_driver_id
    FROM public.drivers d
    WHERE lower(btrim(d.name)) = v_key
    LIMIT 1;

    IF v_driver_id IS NOT NULL THEN
      SELECT id INTO v_load_id FROM public.trailer_loads
      WHERE company_id = p_company_id
        AND driver_id = v_driver_id
        AND status NOT IN ('Completed', 'Delivered')
      ORDER BY created_at DESC LIMIT 1;
      IF v_load_id IS NOT NULL THEN v_matched_by := 'driver'; END IF;
    END IF;
  END IF;

  IF v_load_id IS NULL THEN
    SELECT id INTO v_load_id FROM public.trailer_loads
    WHERE company_id = p_company_id
      AND lower(btrim(coalesce(driver, ''))) = v_key
      AND status NOT IN ('Completed', 'Delivered')
    ORDER BY created_at DESC LIMIT 1;
    IF v_load_id IS NOT NULL THEN v_matched_by := 'driver'; END IF;
  END IF;

  INSERT INTO public.tracking_events (
    company_id, load_id, external_id, latitude, longitude, speed_mph,
    heading_deg, recorded_at, raw_payload, asset_type, matched_by, provider
  )
  VALUES (
    p_company_id, v_load_id, p_external_id, p_latitude, p_longitude, p_speed_mph,
    p_heading_deg, p_recorded_at, p_raw_payload, p_asset_type, v_matched_by, p_provider
  )
  RETURNING * INTO v_event;

  IF v_load_id IS NOT NULL AND p_eta_at IS NOT NULL THEN
    UPDATE public.trailer_loads SET eta_at = p_eta_at, eta_source = p_eta_source WHERE id = v_load_id;
  END IF;

  IF v_load_id IS NOT NULL AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    FOR v_fence IN SELECT * FROM public.geofences WHERE company_id = p_company_id LOOP
      IF (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_latitude)) * cos(radians(v_fence.center_lat)) *
            cos(radians(v_fence.center_lng) - radians(p_longitude)) +
            sin(radians(p_latitude)) * sin(radians(v_fence.center_lat)))))) <= v_fence.radius_meters THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.trailer_events te
          WHERE te.load_id = v_load_id
            AND te.event_type = 'Geofence entered'
            AND te.note = v_fence.name
            AND te.created_at > now() - interval '1 hour'
        ) THEN
          INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, source)
          VALUES (v_load_id, p_external_id, 'Geofence entered', v_fence.name, 'tracking');
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_event;
END; $function$;

CREATE OR REPLACE FUNCTION public.recent_tracking_events(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  external_id text,
  asset_type text,
  matched_by text,
  provider text,
  latitude double precision,
  longitude double precision,
  speed_mph numeric,
  recorded_at timestamptz,
  received_at timestamptz,
  load_schedule_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to view tracking data'; END IF;
  RETURN QUERY
    SELECT te.id, te.external_id, te.asset_type, te.matched_by, te.provider,
           te.latitude, te.longitude, te.speed_mph, te.recorded_at, te.received_at,
           tl.schedule_id
    FROM public.tracking_events te
    LEFT JOIN public.trailer_loads tl ON tl.id = te.load_id
    WHERE te.company_id = v_company
    ORDER BY te.received_at DESC
    LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
END; $function$;

REVOKE ALL ON FUNCTION public.recent_tracking_events(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.recent_tracking_events(integer) TO authenticated;
