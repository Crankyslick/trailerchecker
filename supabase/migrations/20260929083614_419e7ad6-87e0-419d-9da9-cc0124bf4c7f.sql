-- Direct-to-user notification helper (service/definer use only)
CREATE OR REPLACE FUNCTION public.notify_user(
  p_company_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (company_id, user_id, role_target, type, title, body, link)
  VALUES (p_company_id, p_user_id, NULL, p_type, p_title, p_body, p_link);
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text) TO service_role;

-- Alert the assigned driver when a load is assigned or reassigned
CREATE OR REPLACE FUNCTION public.notify_driver_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  SELECT d.user_id INTO v_user_id FROM public.drivers d WHERE d.id = NEW.driver_id;
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_user(
    NEW.company_id,
    v_user_id,
    'load_assigned',
    'New load assigned: ' || NEW.schedule_id,
    COALESCE(NEW.origin_name, 'Origin') || ' to ' || COALESCE(NEW.str_name, 'Destination')
      || COALESCE(' - trailer ' || NEW.outbound_trailer, ''),
    '/driver'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trailer_loads_notify_driver_assignment ON public.trailer_loads;
CREATE TRIGGER trailer_loads_notify_driver_assignment
AFTER INSERT OR UPDATE OF driver_id ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.notify_driver_assignment();

-- Alert dispatchers when proof of delivery is captured
CREATE OR REPLACE FUNCTION public.notify_on_pod()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load public.trailer_loads%ROWTYPE;
BEGIN
  SELECT * INTO v_load FROM public.trailer_loads WHERE id = NEW.load_id;

  PERFORM public.notify_role(
    NEW.company_id,
    'dispatcher'::app_role,
    'pod_captured',
    'POD captured: ' || COALESCE(v_load.schedule_id, 'load'),
    'Signed by ' || NEW.recipient_name
      || COALESCE(' - driver ' || v_load.driver, '')
      || COALESCE(' - trailer ' || v_load.outbound_trailer, ''),
    '/history/' || NEW.load_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proof_of_delivery_notify ON public.proof_of_delivery;
CREATE TRIGGER proof_of_delivery_notify
AFTER INSERT ON public.proof_of_delivery
FOR EACH ROW EXECUTE FUNCTION public.notify_on_pod();

-- Alert dispatchers when a load is marked delayed
CREATE OR REPLACE FUNCTION public.notify_on_delayed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Delayed'::trailer_load_status
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_role(
      NEW.company_id,
      'dispatcher'::app_role,
      'load_delayed',
      'Load delayed: ' || NEW.schedule_id,
      COALESCE(NEW.origin_name, 'Origin') || ' to ' || COALESCE(NEW.str_name, 'Destination')
        || COALESCE(' - driver ' || NEW.driver, '')
        || COALESCE(' - ' || NEW.exception_reason, ''),
      '/loads'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trailer_loads_notify_delayed ON public.trailer_loads;
CREATE TRIGGER trailer_loads_notify_delayed
AFTER UPDATE OF status ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.notify_on_delayed();
