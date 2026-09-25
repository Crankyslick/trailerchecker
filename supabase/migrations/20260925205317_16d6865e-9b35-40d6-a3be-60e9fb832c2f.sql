CREATE TYPE public.order_status AS ENUM ('OPEN','PARTIALLY_ALLOCATED','ALLOCATED','CANCELLED','CLOSED');
CREATE TYPE public.shipment_status AS ENUM ('PLANNING','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE public.stop_type AS ENUM ('PICKUP','DELIVERY');
CREATE TYPE public.leg_status AS ENUM ('PLANNED','ACTIVE','COMPLETED','CANCELLED');

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  client_id uuid REFERENCES public.trailer_clients(id) ON DELETE SET NULL,
  commodity_description text,
  total_weight numeric(10,2),
  total_pieces integer,
  total_pallets integer,
  service_level text,
  ready_datetime timestamptz,
  requested_delivery_datetime timestamptz,
  status public.order_status NOT NULL DEFAULT 'OPEN',
  root_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  superseded_by_id uuid REFERENCES public.orders(id),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_company_idx ON public.orders(company_id);
CREATE INDEX orders_root_current_idx ON public.orders(root_id) WHERE superseded_by_id IS NULL;
CREATE INDEX orders_client_idx ON public.orders(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read orders" ON public.orders FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write orders" ON public.orders FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_prevent_company_change BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_number text NOT NULL,
  status public.shipment_status NOT NULL DEFAULT 'PLANNING',
  root_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  superseded_by_id uuid REFERENCES public.shipments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_company_idx ON public.shipments(company_id);
CREATE INDEX shipments_root_current_idx ON public.shipments(root_id) WHERE superseded_by_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read shipments" ON public.shipments FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write shipments" ON public.shipments FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER shipments_updated BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shipments_prevent_company_change BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

CREATE TABLE public.shipment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, order_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_orders TO authenticated;
GRANT ALL ON public.shipment_orders TO service_role;
ALTER TABLE public.shipment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read shipment_orders" ON public.shipment_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_orders.shipment_id AND s.company_id = public.current_company_id()) AND public.is_staff());
CREATE POLICY "company write shipment_orders" ON public.shipment_orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_orders.shipment_id AND s.company_id = public.current_company_id()) AND public.is_dispatcher_or_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM public.shipments s WHERE s.id = shipment_orders.shipment_id AND s.company_id = public.current_company_id()) AND public.is_dispatcher_or_admin());

CREATE TABLE public.stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  stop_sequence integer NOT NULL,
  stop_type public.stop_type NOT NULL,
  location_code text,
  location_name text,
  earliest_datetime timestamptz,
  latest_datetime timestamptz,
  status text NOT NULL DEFAULT 'PENDING',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, stop_sequence)
);
CREATE INDEX stops_shipment_idx ON public.stops(shipment_id);
CREATE INDEX stops_company_idx ON public.stops(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stops TO authenticated;
GRANT ALL ON public.stops TO service_role;
ALTER TABLE public.stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read stops" ON public.stops FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write stops" ON public.stops FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

CREATE TABLE public.legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  leg_sequence integer NOT NULL,
  origin_stop_id uuid NOT NULL REFERENCES public.stops(id),
  destination_stop_id uuid NOT NULL REFERENCES public.stops(id),
  status public.leg_status NOT NULL DEFAULT 'PLANNED',
  root_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version integer NOT NULL DEFAULT 1,
  superseded_by_id uuid REFERENCES public.legs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, leg_sequence)
);
CREATE INDEX legs_shipment_idx ON public.legs(shipment_id);
CREATE INDEX legs_company_idx ON public.legs(company_id);
CREATE INDEX legs_root_current_idx ON public.legs(root_id) WHERE superseded_by_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legs TO authenticated;
GRANT ALL ON public.legs TO service_role;
ALTER TABLE public.legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company read legs" ON public.legs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company write legs" ON public.legs FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());
CREATE TRIGGER legs_updated BEFORE UPDATE ON public.legs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER legs_prevent_company_change BEFORE UPDATE ON public.legs FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

ALTER TABLE public.trailer_loads
  ADD COLUMN order_id uuid REFERENCES public.orders(id),
  ADD COLUMN shipment_id uuid REFERENCES public.shipments(id),
  ADD COLUMN leg_id uuid REFERENCES public.legs(id),
  ADD COLUMN root_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN superseded_by_id uuid REFERENCES public.trailer_loads(id);
CREATE INDEX trailer_loads_order_idx ON public.trailer_loads(order_id);
CREATE INDEX trailer_loads_shipment_idx ON public.trailer_loads(shipment_id);
CREATE INDEX trailer_loads_leg_idx ON public.trailer_loads(leg_id);
CREATE INDEX trailer_loads_root_current_idx ON public.trailer_loads(root_id) WHERE superseded_by_id IS NULL;

CREATE OR REPLACE FUNCTION public.auto_provision_load_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order_id uuid; v_shipment_id uuid; v_pickup_stop_id uuid; v_delivery_stop_id uuid;
  v_leg_id uuid; v_company_id uuid; v_number text;
BEGIN
  IF NEW.leg_id IS NOT NULL THEN RETURN NEW; END IF;
  v_company_id := COALESCE(NEW.company_id, public.current_company_id());
  v_number := COALESCE(NULLIF(trim(NEW.schedule_id), ''), gen_random_uuid()::text);

  INSERT INTO public.orders (company_id, order_number, client_id, status, ready_datetime, requested_delivery_datetime)
  VALUES (v_company_id, v_number, NEW.client_id, 'ALLOCATED',
    (NEW.cutoff_date + COALESCE(NEW.cutoff_time, '00:00'::time))::timestamptz,
    (NEW.arrival_date + COALESCE(NEW.arrival_time, '00:00'::time))::timestamptz)
  RETURNING id INTO v_order_id;

  INSERT INTO public.shipments (company_id, shipment_number, status)
  VALUES (v_company_id, v_number, 'PLANNED') RETURNING id INTO v_shipment_id;

  INSERT INTO public.shipment_orders (shipment_id, order_id) VALUES (v_shipment_id, v_order_id);

  INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime)
  VALUES (v_company_id, v_shipment_id, 1, 'PICKUP', NEW.origin_id, NEW.origin_name,
    (NEW.cutoff_date + COALESCE(NEW.cutoff_time, '00:00'::time))::timestamptz)
  RETURNING id INTO v_pickup_stop_id;

  INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime)
  VALUES (v_company_id, v_shipment_id, 2, 'DELIVERY', NEW.str_number, NEW.str_name,
    (NEW.arrival_date + COALESCE(NEW.arrival_time, '00:00'::time))::timestamptz)
  RETURNING id INTO v_delivery_stop_id;

  INSERT INTO public.legs (company_id, shipment_id, leg_sequence, origin_stop_id, destination_stop_id, status)
  VALUES (v_company_id, v_shipment_id, 1, v_pickup_stop_id, v_delivery_stop_id, 'PLANNED')
  RETURNING id INTO v_leg_id;

  NEW.order_id := v_order_id; NEW.shipment_id := v_shipment_id; NEW.leg_id := v_leg_id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.auto_provision_load_hierarchy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_provision_load_hierarchy() TO authenticated, service_role;
CREATE TRIGGER trailer_loads_auto_provision_hierarchy BEFORE INSERT ON public.trailer_loads
  FOR EACH ROW EXECUTE FUNCTION public.auto_provision_load_hierarchy();

DO $$
DECLARE
  r RECORD; v_order_id uuid; v_shipment_id uuid; v_pickup_stop_id uuid;
  v_delivery_stop_id uuid; v_leg_id uuid; v_number text;
BEGIN
  FOR r IN SELECT * FROM public.trailer_loads WHERE order_id IS NULL ORDER BY created_at LOOP
    v_number := COALESCE(NULLIF(trim(r.schedule_id), ''), r.id::text) || '-' || substr(r.id::text, 1, 8);

    INSERT INTO public.orders (company_id, order_number, client_id, status, ready_datetime, requested_delivery_datetime, created_at, updated_at)
    VALUES (r.company_id, v_number, r.client_id, 'ALLOCATED',
      (r.cutoff_date + COALESCE(r.cutoff_time, '00:00'::time))::timestamptz,
      (r.arrival_date + COALESCE(r.arrival_time, '00:00'::time))::timestamptz,
      r.created_at, r.updated_at)
    RETURNING id INTO v_order_id;

    INSERT INTO public.shipments (company_id, shipment_number, status, created_at, updated_at)
    VALUES (r.company_id, v_number, 'PLANNED', r.created_at, r.updated_at) RETURNING id INTO v_shipment_id;

    INSERT INTO public.shipment_orders (shipment_id, order_id) VALUES (v_shipment_id, v_order_id);

    INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime, created_at)
    VALUES (r.company_id, v_shipment_id, 1, 'PICKUP', r.origin_id, r.origin_name,
      (r.cutoff_date + COALESCE(r.cutoff_time, '00:00'::time))::timestamptz, r.created_at)
    RETURNING id INTO v_pickup_stop_id;

    INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime, created_at)
    VALUES (r.company_id, v_shipment_id, 2, 'DELIVERY', r.str_number, r.str_name,
      (r.arrival_date + COALESCE(r.arrival_time, '00:00'::time))::timestamptz, r.created_at)
    RETURNING id INTO v_delivery_stop_id;

    INSERT INTO public.legs (company_id, shipment_id, leg_sequence, origin_stop_id, destination_stop_id, status, created_at, updated_at)
    VALUES (r.company_id, v_shipment_id, 1, v_pickup_stop_id, v_delivery_stop_id, 'PLANNED', r.created_at, r.updated_at)
    RETURNING id INTO v_leg_id;

    UPDATE public.trailer_loads SET order_id = v_order_id, shipment_id = v_shipment_id, leg_id = v_leg_id WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.trailer_loads ALTER COLUMN leg_id SET NOT NULL;
ALTER TABLE public.trailer_loads ALTER COLUMN shipment_id SET NOT NULL;
ALTER TABLE public.trailer_loads ALTER COLUMN order_id SET NOT NULL;
COMMENT ON TABLE public.trailer_loads IS 'Dispatchable execution record for one leg; order_id/shipment_id/leg_id link it into order -> shipment -> stop -> leg.';

CREATE OR REPLACE FUNCTION public.create_order_with_shipment(
  p_client_id uuid, p_commodity_description text, p_total_weight numeric, p_total_pieces integer,
  p_total_pallets integer, p_service_level text, p_ready_datetime timestamptz,
  p_requested_delivery_datetime timestamptz, p_shipper_name text, p_shipper_code text,
  p_consignee_name text, p_consignee_code text)
RETURNS TABLE(order_id uuid, shipment_id uuid) LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_order_id uuid; v_shipment_id uuid; v_pickup uuid; v_delivery uuid; v_number text;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'insufficient permissions to create an order'; END IF;
  v_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);

  INSERT INTO public.orders (company_id, order_number, client_id, commodity_description, total_weight, total_pieces,
    total_pallets, service_level, status, ready_datetime, requested_delivery_datetime, created_by)
  VALUES (v_company_id, v_number, p_client_id, p_commodity_description, p_total_weight, p_total_pieces,
    p_total_pallets, p_service_level, 'OPEN', p_ready_datetime, p_requested_delivery_datetime, auth.uid())
  RETURNING id INTO v_order_id;

  INSERT INTO public.shipments (company_id, shipment_number, status) VALUES (v_company_id, v_number, 'PLANNING')
  RETURNING id INTO v_shipment_id;
  INSERT INTO public.shipment_orders (shipment_id, order_id) VALUES (v_shipment_id, v_order_id);

  INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime)
  VALUES (v_company_id, v_shipment_id, 1, 'PICKUP', p_shipper_code, p_shipper_name, p_ready_datetime) RETURNING id INTO v_pickup;
  INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime)
  VALUES (v_company_id, v_shipment_id, 2, 'DELIVERY', p_consignee_code, p_consignee_name, p_requested_delivery_datetime) RETURNING id INTO v_delivery;

  INSERT INTO public.legs (company_id, shipment_id, leg_sequence, origin_stop_id, destination_stop_id, status)
  VALUES (v_company_id, v_shipment_id, 1, v_pickup, v_delivery, 'PLANNED');

  UPDATE public.orders SET status = 'ALLOCATED' WHERE id = v_order_id;
  RETURN QUERY SELECT v_order_id, v_shipment_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_order_with_shipment(uuid,text,numeric,integer,integer,text,timestamptz,timestamptz,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_shipment(uuid,text,numeric,integer,integer,text,timestamptz,timestamptz,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_shipment_stop(
  p_shipment_id uuid, p_stop_type public.stop_type, p_location_code text, p_location_name text,
  p_earliest timestamptz, p_latest timestamptz)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_company_id uuid; v_next_seq integer; v_stop_id uuid;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'insufficient permissions to modify a shipment'; END IF;
  SELECT company_id INTO v_company_id FROM public.shipments WHERE id = p_shipment_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'shipment % not found', p_shipment_id; END IF;
  SELECT COALESCE(MAX(stop_sequence), 0) + 1 INTO v_next_seq FROM public.stops WHERE shipment_id = p_shipment_id;
  INSERT INTO public.stops (company_id, shipment_id, stop_sequence, stop_type, location_code, location_name, earliest_datetime, latest_datetime)
  VALUES (v_company_id, p_shipment_id, v_next_seq, p_stop_type, p_location_code, p_location_name, p_earliest, p_latest)
  RETURNING id INTO v_stop_id;
  RETURN v_stop_id;
END; $$;
REVOKE ALL ON FUNCTION public.add_shipment_stop(uuid,public.stop_type,text,text,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_shipment_stop(uuid,public.stop_type,text,text,timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_shipment_leg(p_shipment_id uuid, p_origin_stop_id uuid, p_destination_stop_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_company_id uuid; v_next_seq integer; v_leg_id uuid;
BEGIN
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'insufficient permissions to modify a shipment'; END IF;
  SELECT company_id INTO v_company_id FROM public.shipments WHERE id = p_shipment_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'shipment % not found', p_shipment_id; END IF;
  SELECT COALESCE(MAX(leg_sequence), 0) + 1 INTO v_next_seq FROM public.legs WHERE shipment_id = p_shipment_id;
  INSERT INTO public.legs (company_id, shipment_id, leg_sequence, origin_stop_id, destination_stop_id, status)
  VALUES (v_company_id, p_shipment_id, v_next_seq, p_origin_stop_id, p_destination_stop_id, 'PLANNED')
  RETURNING id INTO v_leg_id;
  RETURN v_leg_id;
END; $$;
REVOKE ALL ON FUNCTION public.add_shipment_leg(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_shipment_leg(uuid,uuid,uuid) TO authenticated;