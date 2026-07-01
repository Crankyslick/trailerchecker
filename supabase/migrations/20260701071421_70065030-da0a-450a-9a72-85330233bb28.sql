
-- Drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO anon, authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers public read" ON public.drivers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "drivers public write" ON public.drivers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "drivers public update" ON public.drivers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "drivers public delete" ON public.drivers FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER drivers_touch_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Column T timestamp
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS str_return_trailer_started_at timestamptz;

-- Update trigger to stamp start time when return_trailer transitions to non-null
CREATE OR REPLACE FUNCTION public.handle_load_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.return_trailer_location = 'Yard'
     AND (OLD.return_trailer_location IS DISTINCT FROM 'Yard') THEN
    NEW.yard_arrival_at := now();
    IF NEW.status NOT IN ('Completed','Returned To DC') THEN
      NEW.status := 'At Yard';
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Arrived Yard', 'Auto-stamped');
  END IF;

  IF NEW.return_trailer_location = 'Returned To DC'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returned To DC' THEN
    NEW.status := 'Returned To DC';
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Returned To DC', NULL);
  END IF;

  IF NEW.return_trailer_location = 'Store'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Store' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.outbound_trailer, 'Delivered to Store', NULL);
  END IF;

  IF NEW.return_trailer_location = 'Returning'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returning' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Returning to Yard', NULL);
  END IF;

  -- Stamp start time the instant a return trailer is first assigned
  IF NEW.return_trailer IS NOT NULL
     AND OLD.return_trailer IS DISTINCT FROM NEW.return_trailer THEN
    IF NEW.str_return_trailer_started_at IS NULL OR OLD.return_trailer IS NULL THEN
      NEW.str_return_trailer_started_at := now();
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Return Trailer Assigned', NEW.return_trailer);
  END IF;

  -- Clear timestamp if trailer removed
  IF NEW.return_trailer IS NULL AND OLD.return_trailer IS NOT NULL THEN
    NEW.str_return_trailer_started_at := NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            'Status: ' || NEW.status::text, NULL);
  END IF;

  RETURN NEW;
END;
$function$;

-- Webhook URL for Sheet sync
ALTER TABLE public.sync_config ADD COLUMN IF NOT EXISTS webhook_url text;
