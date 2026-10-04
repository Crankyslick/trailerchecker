ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS response_token text;
ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS tenders_response_token_uidx ON public.tenders(response_token)
  WHERE response_token IS NOT NULL;

UPDATE public.tenders SET response_token = encode(extensions.gen_random_bytes(32), 'hex')
WHERE response_token IS NULL;

CREATE OR REPLACE FUNCTION public.create_tender(
  p_leg_id uuid, p_carrier_id uuid, p_offered_rate numeric, p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.tenders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid; v_leg public.legs; v_origin public.stops; v_dest public.stops;
  v_shipment public.shipments; v_order_id uuid; v_carrier public.carriers;
  v_row public.trailer_loads; v_tender public.tenders;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to tender loads'; END IF;
  SELECT * INTO v_leg FROM public.legs WHERE id = p_leg_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leg not found'; END IF;
  SELECT * INTO v_carrier FROM public.carriers WHERE id = p_carrier_id AND company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carrier not found'; END IF;

  SELECT * INTO v_row FROM public.trailer_loads WHERE leg_id = p_leg_id AND company_id = v_company LIMIT 1;
  IF FOUND THEN
    UPDATE public.trailer_loads SET carrier_id = p_carrier_id WHERE id = v_row.id;
  ELSE
    SELECT * INTO v_origin FROM public.stops WHERE id = v_leg.origin_stop_id;
    SELECT * INTO v_dest FROM public.stops WHERE id = v_leg.destination_stop_id;
    SELECT * INTO v_shipment FROM public.shipments WHERE id = v_leg.shipment_id;
    SELECT order_id INTO v_order_id FROM public.shipment_orders WHERE shipment_id = v_leg.shipment_id LIMIT 1;
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'This leg''s shipment has no order attached'; END IF;
    INSERT INTO public.trailer_loads (
      company_id, schedule_id, order_id, shipment_id, leg_id, root_id,
      origin_id, origin_name, str_number, str_name,
      cutoff_date, cutoff_time, arrival_date, arrival_time, carrier_id, status
    ) VALUES (
      v_company, v_shipment.shipment_number, v_order_id, v_leg.shipment_id, p_leg_id, v_shipment.root_id,
      v_origin.location_code, v_origin.location_name, v_dest.location_code, v_dest.location_name,
      v_origin.earliest_datetime::date, v_origin.earliest_datetime::time,
      v_dest.earliest_datetime::date, v_dest.earliest_datetime::time, p_carrier_id, 'Assigned'
    ) RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.tenders (company_id, leg_id, carrier_id, status, offered_rate, expires_at, response_token, token_expires_at)
  VALUES (
    v_company, p_leg_id, p_carrier_id, 'OFFERED', p_offered_rate, p_expires_at,
    encode(extensions.gen_random_bytes(32), 'hex'),
    coalesce(p_expires_at, now() + interval '14 days')
  )
  RETURNING * INTO v_tender;
  RETURN v_tender;
END;
$$;
REVOKE ALL ON FUNCTION public.create_tender(uuid, uuid, numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tender(uuid, uuid, numeric, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tender_by_token(p_token text)
RETURNS TABLE (
  tender_id uuid, status public.tender_status, offered_rate numeric,
  offered_at timestamptz, responded_at timestamptz, expires_at timestamptz,
  token_valid boolean, carrier_name text, schedule_id text,
  origin_name text, destination_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tender public.tenders; v_load public.trailer_loads;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::public.tender_status, NULL::numeric,
      NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, false, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_tender FROM public.tenders WHERE response_token = p_token;
  IF NOT FOUND OR (v_tender.token_expires_at IS NOT NULL AND v_tender.token_expires_at < now()) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::public.tender_status, NULL::numeric,
      NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, false, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_load FROM public.trailer_loads WHERE leg_id = v_tender.leg_id AND company_id = v_tender.company_id LIMIT 1;
  RETURN QUERY
    SELECT v_tender.id, v_tender.status, v_tender.offered_rate, v_tender.offered_at,
      v_tender.responded_at, v_tender.expires_at, true,
      (SELECT name FROM public.carriers WHERE id = v_tender.carrier_id),
      v_load.schedule_id, v_load.origin_name, v_load.str_name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_tender_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tender_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_tender_by_token(
  p_token text, p_response public.tender_status, p_response_notes text DEFAULT NULL
)
RETURNS TABLE (ok boolean, message text, status public.tender_status)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tender public.tenders;
BEGIN
  IF p_response NOT IN ('ACCEPTED', 'REJECTED') THEN
    RETURN QUERY SELECT false, 'Response must be accept or reject', NULL::public.tender_status; RETURN;
  END IF;
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN QUERY SELECT false, 'Missing link token', NULL::public.tender_status; RETURN;
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE response_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'This link is not valid', NULL::public.tender_status; RETURN;
  END IF;
  IF v_tender.token_expires_at IS NOT NULL AND v_tender.token_expires_at < now() THEN
    RETURN QUERY SELECT false, 'This link has expired', v_tender.status; RETURN;
  END IF;
  IF v_tender.status <> 'OFFERED' THEN
    RETURN QUERY SELECT false, 'This offer was already resolved', v_tender.status; RETURN;
  END IF;

  UPDATE public.tenders SET status = p_response, responded_at = now(), response_notes = p_response_notes
   WHERE id = v_tender.id RETURNING * INTO v_tender;
  IF p_response = 'REJECTED' THEN
    UPDATE public.trailer_loads SET carrier_id = NULL
     WHERE leg_id = v_tender.leg_id AND carrier_id = v_tender.carrier_id AND company_id = v_tender.company_id;
  END IF;
  RETURN QUERY SELECT true, 'Recorded', v_tender.status;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_tender_by_token(text, public.tender_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_tender_by_token(text, public.tender_status, text) TO anon, authenticated;

CREATE TYPE public.dvir_inspection_type AS ENUM ('PRE_TRIP', 'POST_TRIP');

CREATE TABLE public.dvir_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  inspection_type public.dvir_inspection_type NOT NULL,
  tires_wheels_ok boolean NOT NULL,
  brakes_ok boolean NOT NULL,
  lights_reflectors_ok boolean NOT NULL,
  mirrors_windshield_ok boolean NOT NULL,
  coupling_devices_ok boolean NOT NULL,
  cargo_securement_ok boolean NOT NULL,
  horn_ok boolean NOT NULL,
  fluid_leaks_ok boolean NOT NULL,
  emergency_equipment_ok boolean NOT NULL,
  odometer_miles integer,
  defects_found boolean NOT NULL DEFAULT false,
  defect_notes text,
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT defects_found OR defect_notes IS NOT NULL)
);
CREATE INDEX dvir_load_idx ON public.dvir_inspections(load_id, inspection_type);
CREATE INDEX dvir_driver_idx ON public.dvir_inspections(driver_id, created_at DESC);
GRANT SELECT, INSERT ON public.dvir_inspections TO authenticated;
GRANT ALL ON public.dvir_inspections TO service_role;
ALTER TABLE public.dvir_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read dvir" ON public.dvir_inspections FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "driver read own dvir" ON public.dvir_inspections FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_assigned_driver(load_id));
CREATE TRIGGER dvir_prevent_company_change BEFORE UPDATE ON public.dvir_inspections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE OR REPLACE FUNCTION public.submit_dvir(
  p_load_id uuid, p_inspection_type public.dvir_inspection_type,
  p_tires_wheels_ok boolean, p_brakes_ok boolean, p_lights_reflectors_ok boolean,
  p_mirrors_windshield_ok boolean, p_coupling_devices_ok boolean, p_cargo_securement_ok boolean,
  p_horn_ok boolean, p_fluid_leaks_ok boolean, p_emergency_equipment_ok boolean,
  p_odometer_miles integer DEFAULT NULL, p_defect_notes text DEFAULT NULL
)
RETURNS public.dvir_inspections
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_driver_id uuid; v_defects boolean; v_passed boolean; v_row public.dvir_inspections;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_assigned_driver(p_load_id) AND NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to submit an inspection for this load';
  END IF;
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN
    SELECT driver_id INTO v_driver_id FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company;
  END IF;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'No driver is on record for this load'; END IF;

  v_defects := NOT (p_tires_wheels_ok AND p_brakes_ok AND p_lights_reflectors_ok AND p_mirrors_windshield_ok
    AND p_coupling_devices_ok AND p_cargo_securement_ok AND p_horn_ok AND p_fluid_leaks_ok AND p_emergency_equipment_ok);
  v_passed := NOT v_defects;
  IF v_defects AND (p_defect_notes IS NULL OR btrim(p_defect_notes) = '') THEN
    RAISE EXCEPTION 'Describe the defect for any item marked not OK';
  END IF;

  INSERT INTO public.dvir_inspections (
    company_id, load_id, driver_id, inspection_type,
    tires_wheels_ok, brakes_ok, lights_reflectors_ok, mirrors_windshield_ok,
    coupling_devices_ok, cargo_securement_ok, horn_ok, fluid_leaks_ok, emergency_equipment_ok,
    odometer_miles, defects_found, defect_notes, passed
  ) VALUES (
    v_company, p_load_id, v_driver_id, p_inspection_type,
    p_tires_wheels_ok, p_brakes_ok, p_lights_reflectors_ok, p_mirrors_windshield_ok,
    p_coupling_devices_ok, p_cargo_securement_ok, p_horn_ok, p_fluid_leaks_ok, p_emergency_equipment_ok,
    p_odometer_miles, v_defects, p_defect_notes, v_passed
  ) RETURNING * INTO v_row;

  INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, user_id, source)
  SELECT p_load_id, outbound_trailer,
    CASE WHEN p_inspection_type = 'PRE_TRIP' THEN 'DVIR pre-trip' ELSE 'DVIR post-trip' END,
    CASE WHEN v_defects THEN 'Defects noted: ' || p_defect_notes ELSE 'Passed, no defects' END,
    auth.uid(), 'rpc'
  FROM public.trailer_loads WHERE id = p_load_id;

  IF v_defects THEN
    UPDATE public.trailer_loads SET is_exception = true,
      exception_reason = coalesce(exception_reason, 'DVIR ' || lower(p_inspection_type::text) || ' defect: ' || p_defect_notes),
      exception_at = coalesce(exception_at, now())
    WHERE id = p_load_id AND company_id = v_company AND NOT is_exception;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_dvir(uuid, public.dvir_inspection_type, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_dvir(uuid, public.dvir_inspection_type, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_passing_pretrip_dvir(p_load_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dvir_inspections
    WHERE load_id = p_load_id AND inspection_type = 'PRE_TRIP' AND passed
      AND company_id = public.current_company_id()
  );
$$;
REVOKE ALL ON FUNCTION public.has_passing_pretrip_dvir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_passing_pretrip_dvir(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_update_status(p_load_id uuid, p_new_status public.trailer_load_status)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cur public.trailer_loads; v_row public.trailer_loads; v_staff boolean;
BEGIN
  v_staff := public.is_dispatcher_or_admin();
  IF NOT public.is_assigned_driver(p_load_id) AND NOT v_staff THEN
    RAISE EXCEPTION 'You do not have permission to update this load';
  END IF;
  SELECT * INTO v_cur FROM public.trailer_loads WHERE id = p_load_id AND company_id = public.current_company_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  IF v_cur.status = p_new_status THEN RETURN v_cur; END IF;
  IF NOT v_staff AND NOT public.driver_transition_allowed(v_cur.status, p_new_status) THEN
    RAISE EXCEPTION 'Cannot move a load from % to %', v_cur.status, p_new_status;
  END IF;
  IF p_new_status = 'Heading To DC' AND NOT public.has_passing_pretrip_dvir(p_load_id) THEN
    RAISE EXCEPTION 'A passing pre-trip inspection is required before departure';
  END IF;
  UPDATE public.trailer_loads
     SET status = p_new_status,
         return_trailer_location = CASE p_new_status
           WHEN 'Returning' THEN 'Returning'::public.trailer_location
           WHEN 'At Yard' THEN 'Yard'::public.trailer_location
           WHEN 'Returned To DC' THEN 'Returned To DC'::public.trailer_location
           ELSE return_trailer_location END,
         completed_at = CASE WHEN p_new_status = 'Completed' THEN now() ELSE completed_at END
   WHERE id = p_load_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.driver_update_status(uuid, public.trailer_load_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_update_status(uuid, public.trailer_load_status) TO authenticated;

ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS tracking_token text;
CREATE UNIQUE INDEX IF NOT EXISTS trailer_loads_tracking_token_uidx ON public.trailer_loads(tracking_token)
  WHERE tracking_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_tracking_token(p_load_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_token text;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'You do not have permission to share tracking for this load'; END IF;
  SELECT tracking_token INTO v_token FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company;
  IF v_token IS NULL THEN
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    UPDATE public.trailer_loads SET tracking_token = v_token WHERE id = p_load_id AND company_id = v_company;
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_tracking_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_tracking_token(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tracking_by_token(p_token text)
RETURNS TABLE (
  found boolean, schedule_id text, status public.trailer_load_status,
  origin_name text, destination_name text,
  eta_at timestamptz, expected_pickup timestamptz, expected_delivery timestamptz,
  is_exception boolean, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_load public.trailer_loads;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::public.trailer_load_status, NULL::text, NULL::text,
      NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::boolean, NULL::timestamptz;
    RETURN;
  END IF;
  SELECT * INTO v_load FROM public.trailer_loads WHERE tracking_token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::public.trailer_load_status, NULL::text, NULL::text,
      NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::boolean, NULL::timestamptz;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, v_load.schedule_id, v_load.status, v_load.origin_name, v_load.str_name,
    v_load.eta_at, v_load.expected_pickup, v_load.expected_delivery, v_load.is_exception, v_load.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.get_tracking_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tracking_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tracking_milestones_by_token(p_token text)
RETURNS TABLE (event_type text, note text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_load_id uuid;
BEGIN
  SELECT id INTO v_load_id FROM public.trailer_loads WHERE tracking_token = p_token;
  IF v_load_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT e.event_type, CASE WHEN e.event_type = 'Status change' THEN e.note ELSE NULL END, e.created_at
    FROM public.trailer_events e
    WHERE e.load_id = v_load_id
      AND e.event_type IN ('Dispatched', 'DVIR pre-trip', 'DVIR post-trip', 'Exception flagged',
        'Exception resolved', 'Status change', 'Delivered')
    ORDER BY e.created_at ASC
    LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.get_tracking_milestones_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tracking_milestones_by_token(text) TO anon, authenticated;