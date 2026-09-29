DROP TRIGGER IF EXISTS trailer_loads_propagate_status ON public.trailer_loads;
DROP FUNCTION IF EXISTS public.propagate_load_status();

CREATE OR REPLACE FUNCTION public.handle_trailer_load_changes()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.return_trailer_location = 'Yard' AND (OLD.return_trailer_location IS DISTINCT FROM 'Yard') THEN
    NEW.yard_arrival_at := now();
    IF NEW.status NOT IN ('Completed','Returned To DC') THEN NEW.status := 'At Yard'; END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return', 'Arrived Yard', 'Auto-stamped', auth.uid(), 'trigger');
  END IF;
  IF NEW.return_trailer_location = 'Returned To DC' AND OLD.return_trailer_location IS DISTINCT FROM 'Returned To DC' THEN
    NEW.status := 'Returned To DC';
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return', 'Returned To DC', NULL, auth.uid(), 'trigger');
  END IF;
  IF NEW.return_trailer_location = 'Store' AND OLD.return_trailer_location IS DISTINCT FROM 'Store' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.outbound_trailer, 'outbound', 'Delivered to Store', NULL, auth.uid(), 'trigger');
  END IF;
  IF NEW.return_trailer_location = 'Returning' AND OLD.return_trailer_location IS DISTINCT FROM 'Returning' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return', 'Returning to Yard', NULL, auth.uid(), 'trigger');
  END IF;
  IF NEW.outbound_trailer IS DISTINCT FROM OLD.outbound_trailer THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.outbound_trailer, 'outbound', 'Correction',
            'Outbound trailer changed from ' || COALESCE(OLD.outbound_trailer,'(none)') || ' to ' || COALESCE(NEW.outbound_trailer,'(none)'),
            auth.uid(), 'trigger');
  END IF;
  IF NEW.return_trailer IS NOT NULL AND OLD.return_trailer IS DISTINCT FROM NEW.return_trailer THEN
    IF NEW.str_return_trailer_started_at IS NULL OR OLD.return_trailer IS NULL THEN
      NEW.str_return_trailer_started_at := now();
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return',
            CASE WHEN OLD.return_trailer IS NULL THEN 'Return Trailer Assigned' ELSE 'Correction' END,
            CASE WHEN OLD.return_trailer IS NULL THEN NEW.return_trailer
                 ELSE 'Return trailer changed from ' || OLD.return_trailer || ' to ' || NEW.return_trailer END,
            auth.uid(), 'trigger');
  END IF;
  IF NEW.return_trailer IS NULL AND OLD.return_trailer IS NOT NULL THEN
    NEW.str_return_trailer_started_at := NULL;
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, OLD.return_trailer, 'return', 'Correction', 'Return trailer cleared', auth.uid(), 'trigger');
  END IF;
  IF NEW.driver IS DISTINCT FROM OLD.driver AND NEW.driver IS NOT NULL THEN
    NEW.driver_id := (SELECT d.id FROM public.drivers d WHERE lower(trim(d.name)) = lower(trim(NEW.driver)) LIMIT 1);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Completed' THEN NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSIF OLD.status = 'Completed' THEN NEW.completed_at := NULL;
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source, from_status, to_status)
    VALUES (NEW.id, COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            CASE WHEN NEW.return_trailer IS NOT NULL THEN 'return' ELSE 'outbound' END,
            'Status: ' || NEW.status::text, NULL, auth.uid(), 'trigger', OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_load_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (SELECT 1 FROM public.trailer_events e
      WHERE e.load_id = NEW.id AND e.to_status = NEW.status AND e.created_at = now()) THEN
      INSERT INTO public.trailer_events (load_id, trailer_number, event_type, note, from_status, to_status, source)
      VALUES (NEW.id, NEW.outbound_trailer, 'Status changed', OLD.status::text || ' → ' || NEW.status::text, OLD.status, NEW.status, 'system');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.log_load_status_change() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.status_propagation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('leg','shipment','order')),
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  cause_load_id uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX status_propagation_log_entity_idx ON public.status_propagation_log(entity_type, entity_id, created_at DESC);
CREATE INDEX status_propagation_log_company_idx ON public.status_propagation_log(company_id, created_at DESC);
CREATE INDEX status_propagation_log_cause_idx ON public.status_propagation_log(cause_load_id) WHERE cause_load_id IS NOT NULL;
GRANT SELECT ON public.status_propagation_log TO authenticated;
GRANT ALL ON public.status_propagation_log TO service_role;
ALTER TABLE public.status_propagation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read status propagation log" ON public.status_propagation_log
  FOR SELECT TO authenticated USING (company_id = public.current_company_id() AND public.is_staff());

CREATE OR REPLACE FUNCTION public.leg_status_for_load(p_status public.trailer_load_status)
RETURNS public.leg_status LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE p_status
    WHEN 'Assigned' THEN 'PLANNED'::public.leg_status
    WHEN 'Completed' THEN 'COMPLETED'::public.leg_status
    WHEN 'Delayed' THEN NULL
    WHEN 'Exception' THEN NULL
    ELSE 'ACTIVE'::public.leg_status
  END
$$;

CREATE OR REPLACE FUNCTION public._log_status_propagation(p_company uuid, p_type text, p_id uuid, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cause uuid;
BEGIN
  BEGIN
    v_cause := nullif(current_setting('tms.cause_load_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_cause := NULL;
  END;
  INSERT INTO public.status_propagation_log (company_id, entity_type, entity_id, from_status, to_status, cause_load_id)
  VALUES (p_company, p_type, p_id, p_from, p_to, v_cause);
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_leg(p_leg_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_leg public.legs; v_signal integer; v_completed integer; v_active integer; v_new public.leg_status;
BEGIN
  SELECT * INTO v_leg FROM public.legs WHERE id = p_leg_id FOR UPDATE;
  IF NOT FOUND OR v_leg.status = 'CANCELLED' OR v_leg.superseded_by_id IS NOT NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE public.leg_status_for_load(l.status) IS NOT NULL),
         count(*) FILTER (WHERE public.leg_status_for_load(l.status) = 'COMPLETED'),
         count(*) FILTER (WHERE public.leg_status_for_load(l.status) = 'ACTIVE')
    INTO v_signal, v_completed, v_active
  FROM public.trailer_loads l WHERE l.leg_id = p_leg_id AND l.superseded_by_id IS NULL;
  IF v_signal = 0 THEN RETURN; END IF;
  v_new := CASE WHEN v_completed = v_signal THEN 'COMPLETED'
                WHEN v_active > 0 OR v_completed > 0 THEN 'ACTIVE'
                ELSE 'PLANNED' END;
  IF v_new IS DISTINCT FROM v_leg.status THEN
    UPDATE public.legs SET status = v_new WHERE id = p_leg_id;
    PERFORM public._log_status_propagation(v_leg.company_id, 'leg', p_leg_id, v_leg.status::text, v_new::text);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_shipment(p_shipment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ship public.shipments; v_live integer; v_done integer; v_active integer; v_new public.shipment_status;
BEGIN
  SELECT * INTO v_ship FROM public.shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND OR v_ship.status = 'CANCELLED' OR v_ship.superseded_by_id IS NOT NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE status <> 'CANCELLED'),
         count(*) FILTER (WHERE status = 'COMPLETED'),
         count(*) FILTER (WHERE status = 'ACTIVE')
    INTO v_live, v_done, v_active
  FROM public.legs WHERE shipment_id = p_shipment_id AND superseded_by_id IS NULL;
  IF v_live = 0 THEN RETURN; END IF;
  v_new := CASE WHEN v_done = v_live THEN 'COMPLETED'
                WHEN v_active > 0 OR v_done > 0 THEN 'IN_PROGRESS'
                WHEN v_ship.status IN ('IN_PROGRESS','COMPLETED') THEN 'PLANNED'
                ELSE v_ship.status END;
  IF v_new IS DISTINCT FROM v_ship.status THEN
    UPDATE public.shipments SET status = v_new WHERE id = p_shipment_id;
    PERFORM public._log_status_propagation(v_ship.company_id, 'shipment', p_shipment_id, v_ship.status::text, v_new::text);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_order public.orders; v_live integer; v_done integer; v_new public.order_status;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status = 'CANCELLED' OR v_order.superseded_by_id IS NOT NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE s.status <> 'CANCELLED'), count(*) FILTER (WHERE s.status = 'COMPLETED')
    INTO v_live, v_done
  FROM public.shipment_orders so JOIN public.shipments s ON s.id = so.shipment_id
  WHERE so.order_id = p_order_id AND s.superseded_by_id IS NULL;
  IF v_live = 0 THEN RETURN; END IF;
  IF v_done = v_live THEN v_new := 'CLOSED';
  ELSIF v_order.status = 'CLOSED' THEN v_new := 'ALLOCATED';
  ELSE RETURN;
  END IF;
  IF v_new IS DISTINCT FROM v_order.status THEN
    UPDATE public.orders SET status = v_new WHERE id = p_order_id;
    PERFORM public._log_status_propagation(v_order.company_id, 'order', p_order_id, v_order.status::text, v_new::text);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_propagate_from_load()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('tms.cause_load_id', NEW.id::text, true);
  IF TG_OP = 'UPDATE' AND OLD.leg_id IS DISTINCT FROM NEW.leg_id THEN PERFORM public.recompute_leg(OLD.leg_id); END IF;
  PERFORM public.recompute_leg(NEW.leg_id);
  PERFORM set_config('tms.cause_load_id', '', true);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_propagate_from_leg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.shipment_id IS DISTINCT FROM NEW.shipment_id THEN PERFORM public.recompute_shipment(OLD.shipment_id); END IF;
  PERFORM public.recompute_shipment(NEW.shipment_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_propagate_from_shipment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_order uuid;
BEGIN
  FOR v_order IN SELECT order_id FROM public.shipment_orders WHERE shipment_id = NEW.id ORDER BY order_id LOOP
    PERFORM public.recompute_order(v_order);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_propagate_from_shipment_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.recompute_order(OLD.order_id);
  ELSE PERFORM public.recompute_order(NEW.order_id); END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trailer_loads_propagate_insert AFTER INSERT ON public.trailer_loads
  FOR EACH ROW EXECUTE FUNCTION public.trg_propagate_from_load();
CREATE TRIGGER trailer_loads_propagate_update AFTER UPDATE ON public.trailer_loads
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.leg_id IS DISTINCT FROM NEW.leg_id OR OLD.superseded_by_id IS DISTINCT FROM NEW.superseded_by_id)
  EXECUTE FUNCTION public.trg_propagate_from_load();
CREATE TRIGGER legs_propagate_insert AFTER INSERT ON public.legs
  FOR EACH ROW EXECUTE FUNCTION public.trg_propagate_from_leg();
CREATE TRIGGER legs_propagate_update AFTER UPDATE ON public.legs
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.shipment_id IS DISTINCT FROM NEW.shipment_id OR OLD.superseded_by_id IS DISTINCT FROM NEW.superseded_by_id)
  EXECUTE FUNCTION public.trg_propagate_from_leg();
CREATE TRIGGER shipments_propagate_update AFTER UPDATE ON public.shipments
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.superseded_by_id IS DISTINCT FROM NEW.superseded_by_id)
  EXECUTE FUNCTION public.trg_propagate_from_shipment();
CREATE TRIGGER shipment_orders_propagate AFTER INSERT OR DELETE ON public.shipment_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_propagate_from_shipment_orders();

REVOKE ALL ON FUNCTION public.leg_status_for_load(public.trailer_load_status) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._log_status_propagation(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_leg(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_shipment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_propagate_from_load() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_propagate_from_leg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_propagate_from_shipment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_propagate_from_shipment_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_leg(uuid), public.recompute_shipment(uuid), public.recompute_order(uuid) TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT leg_id FROM public.trailer_loads WHERE superseded_by_id IS NULL ORDER BY leg_id LOOP
    PERFORM public.recompute_leg(r.leg_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.driver_transition_allowed(p_from public.trailer_load_status, p_to public.trailer_load_status)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT (p_from::text, p_to::text) IN (
    ('Assigned','Heading To DC'), ('Heading To DC','Loaded'), ('Loaded','En Route'),
    ('Picked Up Return Trailer','Returning'), ('Returning','At Yard'),
    ('At Yard','Returned To DC'), ('Returned To DC','Completed'))
$$;

CREATE OR REPLACE FUNCTION public.driver_update_status(p_load_id uuid, p_new_status public.trailer_load_status)
RETURNS public.trailer_loads LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
REVOKE ALL ON FUNCTION public.driver_transition_allowed(public.trailer_load_status, public.trailer_load_status) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.driver_update_status(uuid, public.trailer_load_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_update_status(uuid, public.trailer_load_status) TO authenticated;