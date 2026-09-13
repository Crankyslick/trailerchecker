ALTER TABLE public.trailer_loads ALTER COLUMN company_id SET DEFAULT 'fc654522-3fb2-4d4a-b066-3dd03c644070';
ALTER TABLE public.yard_check_ins ALTER COLUMN company_id SET DEFAULT 'fc654522-3fb2-4d4a-b066-3dd03c644070';

CREATE OR REPLACE FUNCTION public.handle_trailer_load_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
  VALUES (NEW.id, NEW.outbound_trailer, 'Load Created', 'Schedule ' || NEW.schedule_id, auth.uid());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_trailer_load_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.return_trailer_location = 'Yard'
     AND (OLD.return_trailer_location IS DISTINCT FROM 'Yard') THEN
    NEW.yard_arrival_at := now();
    IF NEW.status NOT IN ('Completed','Returned To DC') THEN
      NEW.status := 'At Yard';
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
    VALUES (NEW.id, NEW.return_trailer, 'Arrived Yard', 'Auto-stamped', auth.uid());
  END IF;

  IF NEW.return_trailer_location = 'Returned To DC'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returned To DC' THEN
    NEW.status := 'Returned To DC';
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
    VALUES (NEW.id, NEW.return_trailer, 'Returned To DC', NULL, auth.uid());
  END IF;

  IF NEW.return_trailer_location = 'Store'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Store' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
    VALUES (NEW.id, NEW.outbound_trailer, 'Delivered to Store', NULL, auth.uid());
  END IF;

  IF NEW.return_trailer_location = 'Returning'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returning' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
    VALUES (NEW.id, NEW.return_trailer, 'Returning to Yard', NULL, auth.uid());
  END IF;

  IF NEW.return_trailer IS NOT NULL
     AND OLD.return_trailer IS DISTINCT FROM NEW.return_trailer THEN
    IF NEW.str_return_trailer_started_at IS NULL OR OLD.return_trailer IS NULL THEN
      NEW.str_return_trailer_started_at := now();
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
    VALUES (NEW.id, NEW.return_trailer, 'Return Trailer Assigned', NEW.return_trailer, auth.uid());
  END IF;

  IF NEW.return_trailer IS NULL AND OLD.return_trailer IS NOT NULL THEN
    NEW.str_return_trailer_started_at := NULL;
  END IF;

  IF NEW.driver IS DISTINCT FROM OLD.driver AND NEW.driver IS NOT NULL THEN
    NEW.driver_id := (SELECT d.id FROM public.drivers d
                      WHERE lower(trim(d.name)) = lower(trim(NEW.driver)) LIMIT 1);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, note, user_id)
    VALUES (NEW.id, COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            'Status: ' || NEW.status::text, NULL, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trailer_loads_insert_event ON public.trailer_loads;
CREATE TRIGGER trailer_loads_insert_event AFTER INSERT ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.handle_trailer_load_insert();

DROP TRIGGER IF EXISTS trailer_loads_audit ON public.trailer_loads;
CREATE TRIGGER trailer_loads_audit BEFORE UPDATE ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.handle_trailer_load_changes();