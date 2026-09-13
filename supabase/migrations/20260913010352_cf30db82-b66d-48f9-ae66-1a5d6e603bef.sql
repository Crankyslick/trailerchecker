-- ============ shared helpers from the merged schema ============
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_has_any_role(ARRAY['admin','dispatcher','billing']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.is_dispatcher_or_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_has_any_role(ARRAY['admin','dispatcher']::public.app_role[]);
$$;

-- ============ tenant root of the merged schema ============
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read companies" ON public.companies FOR SELECT TO authenticated
  USING (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));
CREATE TRIGGER companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_tenant_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  country text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read entities" ON public.entities FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY "Admins manage entities" ON public.entities FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin']::public.app_role[]));
CREATE TRIGGER entities_updated BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ move legacy trailer-ops objects aside (no data loss) ============
ALTER TABLE public.trailer_events RENAME TO legacy_trailer_events;
ALTER TABLE public.yard_check_ins RENAME TO legacy_yard_check_ins;
ALTER TYPE public.trailer_location RENAME TO legacy_trailer_location;

-- keep the live app's triggers writing to the legacy log
CREATE OR REPLACE FUNCTION public.handle_load_changes()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.return_trailer_location = 'Yard'
     AND (OLD.return_trailer_location IS DISTINCT FROM 'Yard') THEN
    NEW.yard_arrival_at := now();
    IF NEW.status NOT IN ('Completed','Returned To DC') THEN
      NEW.status := 'At Yard';
    END IF;
    INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Arrived Yard', 'Auto-stamped');
  END IF;

  IF NEW.return_trailer_location = 'Returned To DC'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returned To DC' THEN
    NEW.status := 'Returned To DC';
    INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Returned To DC', NULL);
  END IF;

  IF NEW.return_trailer_location = 'Store'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Store' THEN
    INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.outbound_trailer, 'Delivered to Store', NULL);
  END IF;

  IF NEW.return_trailer_location = 'Returning'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returning' THEN
    INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Returning to Yard', NULL);
  END IF;

  IF NEW.return_trailer IS NOT NULL
     AND OLD.return_trailer IS DISTINCT FROM NEW.return_trailer THEN
    IF NEW.str_return_trailer_started_at IS NULL OR OLD.return_trailer IS NULL THEN
      NEW.str_return_trailer_started_at := now();
    END IF;
    INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Return Trailer Assigned', NEW.return_trailer);
  END IF;

  IF NEW.return_trailer IS NULL AND OLD.return_trailer IS NOT NULL THEN
    NEW.str_return_trailer_started_at := NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            'Status: ' || NEW.status::text, NULL);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_load_insert()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.legacy_trailer_events(load_id, trailer_number, event_type, notes)
  VALUES (NEW.id, NEW.outbound_trailer, 'Load Created', 'Schedule ' || NEW.schedule_id);
  RETURN NEW;
END;
$function$;

-- ============ TRAILER & YARD OPS MODULE (merged schema) ============
CREATE TYPE public.trailer_location AS ENUM ('DC','Store','Returning','Yard','Returned To DC');
CREATE TYPE public.trailer_load_status AS ENUM (
  'Assigned','Heading To DC','Loaded','En Route','Delivered',
  'Picked Up Return Trailer','Returning','At Yard','Returned To DC',
  'Completed','Delayed','Exception'
);

CREATE TABLE public.trailer_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  schedule_id text NOT NULL,
  cutoff_date date,
  cutoff_day text,
  cutoff_time time,
  driver text,
  outbound_trailer text,
  origin_id text,
  origin_name text,
  str_number text,
  str_name text,
  arrival_date date,
  arrival_day text,
  arrival_time time,
  delivery_sequence integer,
  schedule_date date,
  unload_date date,
  unload_day text,
  unload_time time,
  unload_type text,
  has_sweep boolean NOT NULL DEFAULT false,
  return_trailer text,
  return_trailer_location public.trailer_location DEFAULT 'DC',
  yard_arrival_at timestamptz,
  comments text,
  status public.trailer_load_status NOT NULL DEFAULT 'Assigned',
  target_load_id text,
  trip_id text,
  pro_number text,
  str_return_trailer_started_at timestamptz,
  alert_status text,
  total_distance text,
  expected_pickup timestamptz,
  expected_delivery timestamptz,
  pickup_defect_reason text,
  delivery_defect_reason text,
  carrier_comments text,
  category text,
  updated_by text,
  trl_location_code text,
  str_trl_location text,
  invoiced boolean,
  client_id uuid,
  legacy_load_id uuid UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trailer_loads_status_idx ON public.trailer_loads(status);
CREATE INDEX trailer_loads_cutoff_idx ON public.trailer_loads(cutoff_date, cutoff_time);
CREATE INDEX trailer_loads_company_idx ON public.trailer_loads(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trailer_loads TO authenticated;
GRANT ALL ON public.trailer_loads TO service_role;
ALTER TABLE public.trailer_loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read trailer_loads" ON public.trailer_loads FOR SELECT TO authenticated
  USING (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));
CREATE POLICY "Dispatch/admin write trailer_loads" ON public.trailer_loads FOR ALL TO authenticated
  USING (public.is_dispatcher_or_admin()) WITH CHECK (public.is_dispatcher_or_admin());
CREATE TRIGGER trailer_loads_updated BEFORE UPDATE ON public.trailer_loads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.trailer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  trailer_number text,
  event_type text NOT NULL,
  note text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.trailer_events TO authenticated;
GRANT ALL ON public.trailer_events TO service_role;
ALTER TABLE public.trailer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read trailer_events" ON public.trailer_events FOR SELECT TO authenticated
  USING (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));
CREATE POLICY "Staff write trailer_events" ON public.trailer_events FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));

CREATE TABLE public.yard_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  trailer_number text NOT NULL,
  inbound_load_id uuid REFERENCES public.trailer_loads(id) ON DELETE SET NULL,
  arrival_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX yard_check_ins_open_idx ON public.yard_check_ins(checked_out_at) WHERE checked_out_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.yard_check_ins TO authenticated;
GRANT ALL ON public.yard_check_ins TO service_role;
ALTER TABLE public.yard_check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/guard read yard_check_ins" ON public.yard_check_ins FOR SELECT TO authenticated
  USING (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));
CREATE POLICY "Staff/guard write yard_check_ins" ON public.yard_check_ins FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));
CREATE POLICY "Staff/guard update yard_check_ins" ON public.yard_check_ins FOR UPDATE TO authenticated
  USING (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]))
  WITH CHECK (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[]));

CREATE TABLE public.trailer_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact_info text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trailer_clients TO authenticated;
GRANT ALL ON public.trailer_clients TO service_role;
ALTER TABLE public.trailer_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailer_loads
  ADD CONSTRAINT trailer_loads_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.trailer_clients(id) ON DELETE SET NULL;
CREATE INDEX trailer_loads_client_idx ON public.trailer_loads(client_id);
CREATE POLICY "Staff manage trailer_clients" ON public.trailer_clients FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE TRIGGER trailer_clients_updated BEFORE UPDATE ON public.trailer_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.trailer_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  spreadsheet_id text,
  sheet_name text DEFAULT 'Sheet1',
  webhook_url text,
  last_synced_at timestamptz,
  last_sync_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.trailer_sync_config TO authenticated;
GRANT ALL ON public.trailer_sync_config TO service_role;
ALTER TABLE public.trailer_sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read trailer_sync_config" ON public.trailer_sync_config FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY "Admin manage trailer_sync_config" ON public.trailer_sync_config FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin']::public.app_role[]));
CREATE TRIGGER trailer_sync_config_updated BEFORE UPDATE ON public.trailer_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.trailer_sync_config (id) VALUES ('00000000-0000-0000-0000-000000000001');