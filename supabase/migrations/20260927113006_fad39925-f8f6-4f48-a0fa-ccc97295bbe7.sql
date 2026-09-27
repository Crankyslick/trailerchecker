-- ============================================================================
-- Part 1: fix live RPCs (adapted from the zip's post-rename fix — the rename
-- never happened here, so these target public.trailer_loads, the live table)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_same_company_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
BEGIN
  SELECT c.tenant_id INTO _tenant FROM public.companies c WHERE c.id = NEW.company_id;

  IF TG_TABLE_NAME = 'trailer_loads' THEN
    IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.drivers d WHERE d.id = NEW.driver_id AND d.tenant_id = _tenant
    ) THEN
      RAISE EXCEPTION 'driver belongs to a different organization';
    END IF;
    IF NEW.client_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.trailer_clients tc WHERE tc.id = NEW.client_id AND tc.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'client belongs to a different organization';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'yard_check_ins' THEN
    IF NEW.inbound_load_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.trailer_loads l WHERE l.id = NEW.inbound_load_id AND l.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'load belongs to a different organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.yard_check_in(
  p_trailer text,
  p_load_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS public.yard_check_ins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_norm text;
  v_row public.yard_check_ins;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;

  v_norm := upper(btrim(coalesce(p_trailer, '')));
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Trailer number is required';
  END IF;

  IF p_load_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trailer_loads WHERE id = p_load_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'That load does not belong to your company';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_row FROM public.yard_check_ins
     WHERE company_id = v_company AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_row; END IF;
  END IF;

  SELECT * INTO v_row FROM public.yard_check_ins
   WHERE company_id = v_company AND trailer_norm = v_norm AND checked_out_at IS NULL
   FOR UPDATE
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.yard_check_ins
       SET note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
           inbound_load_id = coalesce(p_load_id, inbound_load_id)
     WHERE id = v_row.id
     RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  INSERT INTO public.yard_check_ins (company_id, trailer_number, inbound_load_id, arrival_at, note, idempotency_key)
  VALUES (v_company, v_norm, p_load_id, now(), nullif(btrim(coalesce(p_note, '')), ''), p_idempotency_key)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_trailer(
  p_load_id uuid,
  p_trailer text,
  p_driver text,
  p_destination text DEFAULT NULL,
  p_previous_driver text DEFAULT NULL,
  p_command_id text DEFAULT NULL
)
RETURNS public.trailer_loads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_trailer text;
  v_driver text;
  v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;

  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to dispatch trailers';
  END IF;

  v_trailer := upper(btrim(coalesce(p_trailer, '')));
  IF v_trailer = '' THEN
    RAISE EXCEPTION 'Trailer number is required';
  END IF;

  v_driver := btrim(coalesce(p_driver, ''));
  IF v_driver = '' THEN
    RAISE EXCEPTION 'Driver is required';
  END IF;

  IF p_load_id IS NULL THEN
    RAISE EXCEPTION 'A scheduled load must be selected for every dispatch';
  END IF;

  IF p_command_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trailer_events e WHERE e.command_id = p_command_id
  ) THEN
    SELECT * INTO v_row FROM public.trailer_loads
     WHERE id = p_load_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That load does not belong to your company';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.trailer_loads
     SET outbound_trailer = v_trailer,
         driver = v_driver,
         return_trailer_location = 'Store',
         status = 'Assigned'
   WHERE id = p_load_id AND company_id = v_company
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That load does not belong to your company';
  END IF;

  INSERT INTO public.trailer_events
    (load_id, trailer_number, trailer_role, event_type, note, user_id, source, command_id)
  VALUES
    (v_row.id, v_trailer, 'outbound', 'Dispatched',
     'Trailer ' || v_trailer || ' dispatched to ' || coalesce(nullif(btrim(coalesce(p_destination, '')), ''), 'the default yard')
       || '. Driver: ' || v_driver
       || coalesce(' · Returned by ' || nullif(btrim(coalesce(p_previous_driver, '')), ''), ''),
     auth.uid(), 'rpc', p_command_id);

  RETURN v_row;
END;
$$;

-- ============================================================================
-- Part 2: equipment (canonical entity) + link on trailer_loads
-- ============================================================================
CREATE TABLE public.equipment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL DEFAULT public.current_company_id()
                        REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_number  text NOT NULL,
  equipment_type    text NOT NULL DEFAULT 'Dry Van',
  status            text NOT NULL DEFAULT 'ACTIVE',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, equipment_number)
);
CREATE INDEX equipment_company_idx ON public.equipment(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment TO authenticated;
GRANT ALL ON public.equipment TO service_role;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read equipment" ON public.equipment FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write equipment" ON public.equipment FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER equipment_updated BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER equipment_prevent_company_change BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

ALTER TABLE public.trailer_loads ADD COLUMN equipment_id uuid REFERENCES public.equipment(id);
CREATE INDEX trailer_loads_equipment_idx ON public.trailer_loads(equipment_id);

INSERT INTO public.equipment (company_id, equipment_number)
SELECT DISTINCT company_id, outbound_trailer
FROM public.trailer_loads
WHERE outbound_trailer IS NOT NULL AND btrim(outbound_trailer) <> '' AND company_id IS NOT NULL
ON CONFLICT (company_id, equipment_number) DO NOTHING;

UPDATE public.trailer_loads l
SET equipment_id = e.id
FROM public.equipment e
WHERE e.company_id = l.company_id
  AND e.equipment_number = l.outbound_trailer
  AND l.equipment_id IS NULL;

-- ============================================================================
-- Part 3: appointments
-- ============================================================================
CREATE TYPE public.appointment_status AS ENUM ('REQUESTED','CONFIRMED','RESCHEDULED','CANCELLED');

CREATE TABLE public.appointments (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                        uuid NOT NULL DEFAULT public.current_company_id()
                                        REFERENCES public.companies(id) ON DELETE CASCADE,
  stop_id                           uuid NOT NULL REFERENCES public.stops(id) ON DELETE CASCADE,
  status                            public.appointment_status NOT NULL DEFAULT 'REQUESTED',
  scheduled_start                   timestamptz,
  scheduled_end                     timestamptz,
  confirmation_number               text,
  confirmed_at                      timestamptz,
  rescheduled_from_appointment_id   uuid REFERENCES public.appointments(id),
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_stop_idx ON public.appointments(stop_id);
CREATE INDEX appointments_company_idx ON public.appointments(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read appointments" ON public.appointments FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write appointments" ON public.appointments FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER appointments_updated BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Part 4: structured status history on trailer_events + safety-net trigger.
-- handle_trailer_load_changes already logs status transitions, so the guard
-- below skips inserting when an event for the same load/status was just
-- recorded (same transaction or a few seconds prior) — no double entries.
-- ============================================================================
ALTER TABLE public.trailer_events ADD COLUMN IF NOT EXISTS from_status public.trailer_load_status;
ALTER TABLE public.trailer_events ADD COLUMN IF NOT EXISTS to_status public.trailer_load_status;

CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trailer_events e
      WHERE e.load_id = NEW.id
        AND e.created_at > now() - interval '5 seconds'
        AND (e.to_status = NEW.status OR e.note LIKE '%' || NEW.status::text || '%')
    ) THEN
      INSERT INTO public.trailer_events
        (load_id, trailer_number, event_type, note, from_status, to_status, source)
      VALUES
        (NEW.id, NEW.outbound_trailer, 'Status changed',
         OLD.status::text || ' → ' || NEW.status::text,
         OLD.status, NEW.status, 'system');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trailer_loads_log_status_change
AFTER UPDATE OF status ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.log_load_status_change();

-- ============================================================================
-- Part 5: plan_leg — assign driver + equipment to a planned leg, creating the
-- physical load if none exists yet (adapted to public.trailer_loads; includes
-- root_id, which is required on trailer_loads, and rejects legs with no order)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.plan_leg(
  p_leg_id       uuid,
  p_driver_id    uuid,
  p_equipment_id uuid
)
RETURNS public.trailer_loads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company           uuid;
  v_leg               public.legs;
  v_origin            public.stops;
  v_dest              public.stops;
  v_shipment          public.shipments;
  v_order_id          uuid;
  v_driver_name       text;
  v_equipment_number  text;
  v_row               public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;
  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to plan loads';
  END IF;

  SELECT * INTO v_leg FROM public.legs WHERE id = p_leg_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leg not found';
  END IF;

  IF p_driver_id IS NOT NULL THEN
    SELECT d.name INTO v_driver_name
    FROM public.drivers d JOIN public.companies c ON c.tenant_id = d.tenant_id
    WHERE d.id = p_driver_id AND c.id = v_company;
    IF v_driver_name IS NULL THEN
      RAISE EXCEPTION 'driver belongs to a different organization';
    END IF;
  END IF;

  IF p_equipment_id IS NOT NULL THEN
    SELECT equipment_number INTO v_equipment_number
    FROM public.equipment WHERE id = p_equipment_id AND company_id = v_company;
    IF v_equipment_number IS NULL THEN
      RAISE EXCEPTION 'equipment belongs to a different organization';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.trailer_loads WHERE leg_id = p_leg_id LIMIT 1;

  IF FOUND THEN
    UPDATE public.trailer_loads
       SET driver_id        = COALESCE(p_driver_id, driver_id),
           driver           = COALESCE(v_driver_name, driver),
           equipment_id     = COALESCE(p_equipment_id, equipment_id),
           outbound_trailer = COALESCE(v_equipment_number, outbound_trailer),
           status = CASE WHEN status = 'Assigned' THEN status
                         WHEN p_driver_id IS NOT NULL OR p_equipment_id IS NOT NULL THEN 'Assigned'
                         ELSE status END
     WHERE id = v_row.id
     RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  SELECT * INTO v_origin   FROM public.stops WHERE id = v_leg.origin_stop_id;
  SELECT * INTO v_dest     FROM public.stops WHERE id = v_leg.destination_stop_id;
  SELECT * INTO v_shipment FROM public.shipments WHERE id = v_leg.shipment_id;

  SELECT order_id INTO v_order_id
  FROM public.shipment_orders WHERE shipment_id = v_leg.shipment_id LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'This leg''s shipment has no order attached';
  END IF;

  INSERT INTO public.trailer_loads (
    company_id, schedule_id, order_id, shipment_id, leg_id, root_id,
    origin_id, origin_name, str_number, str_name,
    cutoff_date, cutoff_time, arrival_date, arrival_time,
    driver_id, driver, equipment_id, outbound_trailer, status
  ) VALUES (
    v_company, v_shipment.shipment_number, v_order_id, v_leg.shipment_id, p_leg_id, v_shipment.root_id,
    v_origin.location_code, v_origin.location_name, v_dest.location_code, v_dest.location_name,
    v_origin.earliest_datetime::date, v_origin.earliest_datetime::time,
    v_dest.earliest_datetime::date, v_dest.earliest_datetime::time,
    p_driver_id, v_driver_name, p_equipment_id, v_equipment_number, 'Assigned'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.plan_leg(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_leg(uuid, uuid, uuid) TO authenticated;