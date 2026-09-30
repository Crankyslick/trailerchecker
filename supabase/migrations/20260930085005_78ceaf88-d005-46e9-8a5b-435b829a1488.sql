ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS business_model text NOT NULL DEFAULT 'ASSET_BASED_3PL';

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_business_model_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_business_model_check
  CHECK (business_model IN ('ASSET_BASED_3PL', 'FREIGHT_BROKER', 'HYBRID'));

CREATE OR REPLACE FUNCTION public.log_company_setting_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.yard_deadline_hours IS DISTINCT FROM OLD.yard_deadline_hours THEN
    INSERT INTO public.company_setting_events (company_id, field, old_value, new_value, changed_by)
    VALUES (NEW.company_id, 'yard_deadline_hours',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.yard_deadline_hours::text END,
            NEW.yard_deadline_hours::text, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.yard_critical_hours IS DISTINCT FROM OLD.yard_critical_hours THEN
    INSERT INTO public.company_setting_events (company_id, field, old_value, new_value, changed_by)
    VALUES (NEW.company_id, 'yard_critical_hours',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.yard_critical_hours::text END,
            NEW.yard_critical_hours::text, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.business_model IS DISTINCT FROM OLD.business_model THEN
    INSERT INTO public.company_setting_events (company_id, field, old_value, new_value, changed_by)
    VALUES (NEW.company_id, 'business_model',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.business_model END,
            NEW.business_model, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.company_settings.business_model IS
  'Organization operating profile: asset-based 3PL, freight broker, or hybrid. Controls workspace context only; RLS permissions remain unchanged.';

CREATE OR REPLACE FUNCTION public.set_load_client_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT o.client_id
      INTO NEW.client_id
      FROM public.orders o
     WHERE o.id = NEW.order_id
       AND o.company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_load_client_from_order() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trailer_loads_set_client_from_order ON public.trailer_loads;
CREATE TRIGGER trailer_loads_set_client_from_order
  BEFORE INSERT OR UPDATE OF order_id, company_id ON public.trailer_loads
  FOR EACH ROW EXECUTE FUNCTION public.set_load_client_from_order();

UPDATE public.trailer_loads l
   SET client_id = o.client_id
  FROM public.orders o
 WHERE o.id = l.order_id
   AND o.company_id = l.company_id
   AND o.client_id IS NOT NULL
   AND l.client_id IS NULL;