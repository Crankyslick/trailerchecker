
CREATE TYPE public.container_status AS ENUM (
  'Available','Dispatched','At Port','Loaded','In Transit','Delivered',
  'Empty Ready','Returned','Completed','Delayed','Exception'
);

CREATE TABLE public.containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  container_number text NOT NULL,
  size text,
  steamship_line text,
  bill_of_lading text,
  chassis_number text,
  port_terminal text,
  pickup_location text,
  delivery_location text,
  last_free_day date,
  appointment_at timestamptz,
  eta timestamptz,
  delivered_at timestamptz,
  returned_at timestamptz,
  rate numeric(12,2),
  invoiced boolean NOT NULL DEFAULT false,
  notes text,
  status public.container_status NOT NULL DEFAULT 'Available',
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.container_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES public.containers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.containers TO authenticated;
GRANT ALL ON public.containers TO service_role;
GRANT SELECT, INSERT ON public.container_events TO authenticated;
GRANT ALL ON public.container_events TO service_role;

ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant reads containers"
  ON public.containers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_has_product('drayage'));

CREATE POLICY "dispatchers add containers"
  ON public.containers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id()
    AND public.tenant_has_product('drayage')
    AND public.current_user_has_any_role(ARRAY['owner','admin','dispatcher']::public.app_role[]));

CREATE POLICY "dispatchers update containers"
  ON public.containers FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()
    AND public.tenant_has_product('drayage')
    AND public.current_user_has_any_role(ARRAY['owner','admin','dispatcher']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id()
    AND public.tenant_has_product('drayage'));

CREATE POLICY "admins delete containers"
  ON public.containers FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
    AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "tenant reads container events"
  ON public.container_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.tenant_has_product('drayage'));

CREATE POLICY "tenant writes container events"
  ON public.container_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.tenant_has_product('drayage'));

CREATE TRIGGER containers_set_updated_at
  BEFORE UPDATE ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER containers_lock_tenant
  BEFORE UPDATE ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

CREATE INDEX idx_containers_tenant ON public.containers(tenant_id);
CREATE INDEX idx_containers_status ON public.containers(tenant_id, status);
CREATE INDEX idx_container_events_container ON public.container_events(container_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_container_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.container_events (container_id, tenant_id, event_type, note, user_id)
    VALUES (NEW.id, NEW.tenant_id, 'Container Created', NEW.container_number, auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.container_events (container_id, tenant_id, event_type, note, user_id)
    VALUES (NEW.id, NEW.tenant_id, 'Status: ' || NEW.status::text, NULL, auth.uid());

    IF NEW.status = 'Delivered' AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at := now();
    END IF;
    IF NEW.status = 'Returned' AND NEW.returned_at IS NULL THEN
      NEW.returned_at := now();
    END IF;
  END IF;

  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id AND NEW.driver_id IS NOT NULL THEN
    INSERT INTO public.container_events (container_id, tenant_id, event_type, note, user_id)
    VALUES (NEW.id, NEW.tenant_id, 'Driver Assigned',
            (SELECT d.name FROM public.drivers d WHERE d.id = NEW.driver_id), auth.uid());
  END IF;

  IF NEW.chassis_number IS DISTINCT FROM OLD.chassis_number AND NEW.chassis_number IS NOT NULL THEN
    INSERT INTO public.container_events (container_id, tenant_id, event_type, note, user_id)
    VALUES (NEW.id, NEW.tenant_id, 'Chassis Assigned', NEW.chassis_number, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER containers_insert_event
  AFTER INSERT ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.handle_container_changes();

CREATE TRIGGER containers_audit
  BEFORE UPDATE ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.handle_container_changes();
