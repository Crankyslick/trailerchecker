CREATE TABLE public.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_code text,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 300,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geofences_company_idx ON public.geofences(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geofences TO authenticated;
GRANT ALL ON public.geofences TO service_role;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read geofences" ON public.geofences FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write geofences" ON public.geofences FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER geofences_updated BEFORE UPDATE ON public.geofences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  load_id uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  latitude double precision,
  longitude double precision,
  speed_mph numeric(6,2),
  heading_deg numeric(5,1),
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb
);
CREATE INDEX tracking_events_load_idx ON public.tracking_events(load_id, recorded_at DESC);
CREATE INDEX tracking_events_company_idx ON public.tracking_events(company_id, recorded_at DESC);
GRANT SELECT ON public.tracking_events TO authenticated;
GRANT ALL ON public.tracking_events TO service_role;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read tracking events" ON public.tracking_events FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS eta_at timestamptz;
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS eta_source text;
ALTER TABLE public.sync_secrets ADD COLUMN IF NOT EXISTS inbound_token text UNIQUE;

CREATE OR REPLACE FUNCTION public.rotate_inbound_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_token text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to manage integration tokens'; END IF;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.sync_secrets (company_id, inbound_token) VALUES (v_company, v_token)
  ON CONFLICT (company_id) DO UPDATE SET inbound_token = v_token, updated_at = now();
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.rotate_inbound_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_inbound_token() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inbound_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_token text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to view integration tokens'; END IF;
  SELECT inbound_token INTO v_token FROM public.sync_secrets WHERE company_id = v_company;
  RETURN v_token;
END; $$;
REVOKE ALL ON FUNCTION public.get_inbound_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbound_token() TO authenticated;

CREATE OR REPLACE FUNCTION public.ingest_tracking_event(
  p_company_id uuid, p_external_id text, p_latitude double precision, p_longitude double precision,
  p_speed_mph numeric, p_heading_deg numeric, p_recorded_at timestamptz,
  p_eta_at timestamptz DEFAULT NULL, p_eta_source text DEFAULT NULL, p_raw_payload jsonb DEFAULT NULL
) RETURNS public.tracking_events LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_load_id uuid; v_event public.tracking_events; v_fence public.geofences;
BEGIN
  SELECT id INTO v_load_id FROM public.trailer_loads
  WHERE company_id = p_company_id AND outbound_trailer = p_external_id
    AND status NOT IN ('Completed', 'Delivered')
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.tracking_events (company_id, load_id, external_id, latitude, longitude, speed_mph, heading_deg, recorded_at, raw_payload)
  VALUES (p_company_id, v_load_id, p_external_id, p_latitude, p_longitude, p_speed_mph, p_heading_deg, p_recorded_at, p_raw_payload)
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
        INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, source)
        VALUES (v_load_id, p_external_id, 'Geofence entered', v_fence.name, 'tracking');
      END IF;
    END LOOP;
  END IF;
  RETURN v_event;
END; $$;
REVOKE ALL ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, text, jsonb) TO service_role;