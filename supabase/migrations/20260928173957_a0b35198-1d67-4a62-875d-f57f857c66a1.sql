-- 1. Dispatch overwrite guard
CREATE OR REPLACE FUNCTION public.dispatch_trailer(
  p_load_id uuid, p_trailer text, p_driver text,
  p_destination text DEFAULT NULL, p_previous_driver text DEFAULT NULL, p_command_id text DEFAULT NULL
)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid; v_trailer text; v_driver text;
  v_existing public.trailer_loads; v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to dispatch trailers'; END IF;
  v_trailer := upper(btrim(coalesce(p_trailer, '')));
  IF v_trailer = '' THEN RAISE EXCEPTION 'Trailer number is required'; END IF;
  v_driver := btrim(coalesce(p_driver, ''));
  IF v_driver = '' THEN RAISE EXCEPTION 'Driver is required'; END IF;
  IF p_load_id IS NULL THEN RAISE EXCEPTION 'A scheduled load must be selected for every dispatch'; END IF;

  IF p_command_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trailer_events e WHERE e.command_id = p_command_id) THEN
    SELECT * INTO v_row FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'That load does not belong to your company'; END IF;
    RETURN v_row;
  END IF;

  SELECT * INTO v_existing FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That load does not belong to your company'; END IF;

  IF nullif(btrim(coalesce(v_existing.outbound_trailer, '')), '') IS NOT NULL
     AND upper(btrim(v_existing.outbound_trailer)) <> v_trailer THEN
    RAISE EXCEPTION 'Load % already has outbound trailer % assigned. Use the reassignment flow to change it.',
      coalesce(v_existing.schedule_id, p_load_id::text), v_existing.outbound_trailer;
  END IF;

  UPDATE public.trailer_loads
     SET outbound_trailer = v_trailer, driver = v_driver, return_trailer_location = 'Store', status = 'Assigned'
   WHERE id = p_load_id AND company_id = v_company
   RETURNING * INTO v_row;

  INSERT INTO public.trailer_events (load_id, trailer_number, trailer_role, event_type, note, user_id, source, command_id)
  VALUES (v_row.id, v_trailer, 'outbound', 'Dispatched',
     'Trailer ' || v_trailer || ' dispatched to ' || coalesce(nullif(btrim(coalesce(p_destination, '')), ''), 'the default yard')
       || '. Driver: ' || v_driver
       || coalesce(' · Returned by ' || nullif(btrim(coalesce(p_previous_driver, '')), ''), ''),
     auth.uid(), 'rpc', p_command_id);
  RETURN v_row;
END;
$$;

-- 2. Carriers (extend existing table)
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS scac_code text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS dot_number text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX IF NOT EXISTS carriers_company_idx ON public.carriers(company_id);
CREATE TRIGGER carriers_prevent_company_change BEFORE UPDATE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES public.carriers(id);
CREATE INDEX IF NOT EXISTS trailer_loads_carrier_idx ON public.trailer_loads(carrier_id);

-- 3. Tenders
CREATE TYPE public.tender_status AS ENUM ('OFFERED','ACCEPTED','REJECTED','EXPIRED','RESCINDED');
CREATE TABLE public.tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  leg_id uuid NOT NULL REFERENCES public.legs(id) ON DELETE CASCADE,
  carrier_id uuid NOT NULL REFERENCES public.carriers(id),
  status public.tender_status NOT NULL DEFAULT 'OFFERED',
  offered_rate numeric(10,2),
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz,
  response_notes text
);
CREATE INDEX tenders_leg_idx ON public.tenders(leg_id);
CREATE INDEX tenders_carrier_idx ON public.tenders(carrier_id, status);
GRANT SELECT, INSERT, UPDATE ON public.tenders TO authenticated;
GRANT ALL ON public.tenders TO service_role;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read tenders" ON public.tenders FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write tenders" ON public.tenders FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER tenders_prevent_company_change BEFORE UPDATE ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE OR REPLACE FUNCTION public.create_tender(p_leg_id uuid, p_carrier_id uuid, p_offered_rate numeric, p_expires_at timestamptz DEFAULT NULL)
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

  INSERT INTO public.tenders (company_id, leg_id, carrier_id, status, offered_rate, expires_at)
  VALUES (v_company, p_leg_id, p_carrier_id, 'OFFERED', p_offered_rate, p_expires_at)
  RETURNING * INTO v_tender;
  RETURN v_tender;
END;
$$;
REVOKE ALL ON FUNCTION public.create_tender(uuid, uuid, numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tender(uuid, uuid, numeric, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_tender(p_tender_id uuid, p_response public.tender_status, p_response_notes text DEFAULT NULL)
RETURNS public.tenders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_tender public.tenders;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to respond to tenders'; END IF;
  IF p_response NOT IN ('ACCEPTED', 'REJECTED') THEN RAISE EXCEPTION 'Response must be ACCEPTED or REJECTED'; END IF;
  SELECT * INTO v_tender FROM public.tenders WHERE id = p_tender_id AND company_id = v_company AND status = 'OFFERED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tender not found or already resolved'; END IF;
  UPDATE public.tenders SET status = p_response, responded_at = now(), response_notes = p_response_notes
   WHERE id = p_tender_id RETURNING * INTO v_tender;
  IF p_response = 'REJECTED' THEN
    UPDATE public.trailer_loads SET carrier_id = NULL
     WHERE leg_id = v_tender.leg_id AND carrier_id = v_tender.carrier_id AND company_id = v_company;
  END IF;
  RETURN v_tender;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_tender(uuid, public.tender_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_tender(uuid, public.tender_status, text) TO authenticated;

-- Seed carrier pay on tender accept (from financial core file)
CREATE OR REPLACE FUNCTION public.seed_carrier_pay_on_tender_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
    UPDATE public.trailer_loads SET carrier_pay = COALESCE(carrier_pay, NEW.offered_rate)
     WHERE leg_id = NEW.leg_id AND company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_carrier_pay_on_tender_accept() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tenders_seed_carrier_pay AFTER UPDATE OF status ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.seed_carrier_pay_on_tender_accept();

-- 4. Driver mobile access
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_uidx ON public.drivers(user_id) WHERE user_id IS NOT NULL;
CREATE POLICY "driver reads own record" ON public.drivers FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "driver reads own loads" ON public.trailer_loads FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.current_user_has_any_role(ARRAY['driver']::public.app_role[])
    AND driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.is_assigned_driver(p_load_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trailer_loads l JOIN public.drivers d ON d.id = l.driver_id
    WHERE l.id = p_load_id AND d.user_id = auth.uid() AND l.company_id = public.current_company_id()
  );
$$;
REVOKE ALL ON FUNCTION public.is_assigned_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_driver(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_update_status(p_load_id uuid, p_new_status public.trailer_load_status)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row public.trailer_loads;
BEGIN
  IF NOT public.is_assigned_driver(p_load_id) AND NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to update this load';
  END IF;
  UPDATE public.trailer_loads
     SET status = p_new_status,
         completed_at = CASE WHEN p_new_status = 'Completed' THEN now() ELSE completed_at END
   WHERE id = p_load_id AND company_id = public.current_company_id()
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.driver_update_status(uuid, public.trailer_load_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_update_status(uuid, public.trailer_load_status) TO authenticated;

-- 5. Exceptions
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS is_exception boolean NOT NULL DEFAULT false;
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS exception_reason text;
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS exception_at timestamptz;
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS exception_resolved_at timestamptz;
ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS exception_resolved_note text;
CREATE INDEX IF NOT EXISTS trailer_loads_exception_idx ON public.trailer_loads(is_exception) WHERE is_exception = true;

CREATE OR REPLACE FUNCTION public.flag_exception(p_load_id uuid, p_reason text)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row public.trailer_loads;
BEGIN
  IF NOT public.is_assigned_driver(p_load_id) AND NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to flag this load';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'An exception reason is required'; END IF;
  UPDATE public.trailer_loads
     SET is_exception = true, exception_reason = p_reason, exception_at = now(),
         exception_resolved_at = NULL, exception_resolved_note = NULL
   WHERE id = p_load_id AND company_id = public.current_company_id()
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, user_id, source)
  VALUES (v_row.id, v_row.outbound_trailer, 'Exception flagged', p_reason, auth.uid(), 'rpc');
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_exception(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_exception(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_exception(p_load_id uuid, p_resolution_note text)
RETURNS public.trailer_loads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_row public.trailer_loads;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to resolve exceptions'; END IF;
  UPDATE public.trailer_loads
     SET is_exception = false, exception_resolved_at = now(), exception_resolved_note = p_resolution_note
   WHERE id = p_load_id AND company_id = public.current_company_id()
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, user_id, source)
  VALUES (v_row.id, v_row.outbound_trailer, 'Exception resolved', p_resolution_note, auth.uid(), 'rpc');
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_exception(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_exception(uuid, text) TO authenticated;

-- 6. Driver sessions + activity
CREATE TABLE public.driver_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ip_address inet,
  user_agent text,
  device_type text,
  app_version text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX driver_sessions_user_idx ON public.driver_sessions(user_id);
CREATE INDEX driver_sessions_company_idx ON public.driver_sessions(company_id);
GRANT SELECT ON public.driver_sessions TO authenticated;
GRANT ALL ON public.driver_sessions TO service_role;
ALTER TABLE public.driver_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver reads own sessions" ON public.driver_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "staff reads company sessions" ON public.driver_sessions FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

CREATE TABLE public.driver_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.driver_sessions(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  load_id uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX driver_activity_user_idx ON public.driver_activity_log(user_id);
CREATE INDEX driver_activity_load_idx ON public.driver_activity_log(load_id);
CREATE INDEX driver_activity_type_idx ON public.driver_activity_log(activity_type);
GRANT SELECT, INSERT ON public.driver_activity_log TO authenticated;
GRANT ALL ON public.driver_activity_log TO service_role;
ALTER TABLE public.driver_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver reads own activity" ON public.driver_activity_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "staff reads company activity" ON public.driver_activity_log FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "driver logs own activity" ON public.driver_activity_log FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = public.current_company_id()
    AND session_id IN (SELECT id FROM public.driver_sessions WHERE user_id = auth.uid() AND is_active)
    AND (load_id IS NULL OR load_id IN (SELECT id FROM public.trailer_loads WHERE company_id = public.current_company_id()))
  );

CREATE OR REPLACE FUNCTION public.touch_driver_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.driver_sessions SET last_seen_at = now() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_driver_session() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER driver_activity_touch_session AFTER INSERT ON public.driver_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.touch_driver_session();

CREATE OR REPLACE FUNCTION public.start_driver_session(p_device_type text DEFAULT NULL, p_app_version text DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS public.driver_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_row public.driver_sessions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  INSERT INTO public.driver_sessions (user_id, company_id, device_type, app_version, user_agent)
  VALUES (auth.uid(), v_company, left(p_device_type, 100), left(p_app_version, 50), left(p_user_agent, 500))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.start_driver_session(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_driver_session(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_driver_session(p_session_id uuid)
RETURNS public.driver_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.driver_sessions;
BEGIN
  UPDATE public.driver_sessions SET ended_at = now(), is_active = false
   WHERE id = p_session_id AND user_id = auth.uid()
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.end_driver_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_driver_session(uuid) TO authenticated;

-- 7. Proof of delivery
CREATE TABLE public.proof_of_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  signature_svg text,
  photo_path text,
  notes text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX pod_load_idx ON public.proof_of_delivery(load_id);
GRANT SELECT ON public.proof_of_delivery TO authenticated;
GRANT ALL ON public.proof_of_delivery TO service_role;
ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read pod" ON public.proof_of_delivery FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "driver read own pod" ON public.proof_of_delivery FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_assigned_driver(load_id));

CREATE OR REPLACE FUNCTION public.capture_pod(p_load_id uuid, p_recipient_name text, p_signature_svg text, p_photo_path text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS public.proof_of_delivery
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_pod public.proof_of_delivery;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_assigned_driver(p_load_id) AND NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to record proof of delivery for this load';
  END IF;
  IF p_recipient_name IS NULL OR btrim(p_recipient_name) = '' THEN RAISE EXCEPTION 'Recipient name is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Load not found';
  END IF;
  IF p_photo_path IS NOT NULL AND split_part(p_photo_path, '/', 1) <> v_company::text THEN
    RAISE EXCEPTION 'Photo must be stored under your company folder';
  END IF;
  INSERT INTO public.proof_of_delivery (company_id, load_id, recipient_name, signature_svg, photo_path, notes, created_by)
  VALUES (v_company, p_load_id, btrim(p_recipient_name), p_signature_svg, p_photo_path, p_notes, auth.uid())
  RETURNING * INTO v_pod;
  UPDATE public.trailer_loads SET status = 'Delivered' WHERE id = p_load_id AND company_id = v_company;
  RETURN v_pod;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_pod(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_pod(uuid, text, text, text, text) TO authenticated;

CREATE POLICY "company upload pod photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pod-photos' AND (storage.foldername(name))[1] = public.current_company_id()::text);
CREATE POLICY "company read pod photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pod-photos' AND (storage.foldername(name))[1] = public.current_company_id()::text);

-- 8. Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role_target public.app_role,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR role_target IS NOT NULL)
);
CREATE INDEX notifications_company_idx ON public.notifications(company_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or role notifications" ON public.notifications FOR SELECT TO authenticated
  USING (company_id = public.current_company_id()
    AND (user_id = auth.uid() OR (role_target IS NOT NULL AND public.current_user_has_any_role(ARRAY[role_target]))));
CREATE POLICY "mark own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id()
    AND (user_id = auth.uid() OR (role_target IS NOT NULL AND public.current_user_has_any_role(ARRAY[role_target]))))
  WITH CHECK (company_id = public.current_company_id());

CREATE OR REPLACE FUNCTION public.notify_role(p_company_id uuid, p_role public.app_role, p_type text, p_title text, p_body text, p_link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.notifications (company_id, role_target, type, title, body, link)
  VALUES (p_company_id, p_role, p_type, p_title, p_body, p_link);
$$;
REVOKE ALL ON FUNCTION public.notify_role(uuid, public.app_role, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_exception()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_exception AND NOT OLD.is_exception THEN
    PERFORM public.notify_role(NEW.company_id, 'dispatcher', 'exception',
      'Exception: ' || coalesce(NEW.schedule_id, NEW.id::text), NEW.exception_reason, '/dashboard');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_on_exception() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trailer_loads_notify_on_exception AFTER UPDATE OF is_exception ON public.trailer_loads
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_exception();

CREATE OR REPLACE FUNCTION public.notify_on_tender_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_role(NEW.company_id, 'dispatcher', 'tender_offered',
      'Tender sent', 'Tender offered at $' || coalesce(NEW.offered_rate::text, '—'), '/shipments');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_role(NEW.company_id, 'dispatcher',
      CASE WHEN NEW.status = 'ACCEPTED' THEN 'tender_accepted' ELSE 'tender_' || lower(NEW.status::text) END,
      'Tender ' || lower(NEW.status::text), NULL, '/shipments');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_on_tender_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tenders_notify_on_change AFTER INSERT OR UPDATE OF status ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_tender_change();