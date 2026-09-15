
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.trailer_events
  ADD COLUMN IF NOT EXISTS trailer_role text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS command_id text,
  ADD COLUMN IF NOT EXISTS event_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trailer_events_trailer_role_check') THEN
    ALTER TABLE public.trailer_events
      ADD CONSTRAINT trailer_events_trailer_role_check
      CHECK (trailer_role IS NULL OR trailer_role IN ('outbound','return'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS trailer_events_command_unique
  ON public.trailer_events (command_id) WHERE command_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS trailer_events_load_idx ON public.trailer_events (load_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trailer_events_trailer_trgm ON public.trailer_events USING gin (trailer_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trailer_events_note_trgm ON public.trailer_events USING gin (note gin_trgm_ops);

ALTER TABLE public.trailer_loads ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE INDEX IF NOT EXISTS trailer_loads_company_schedule_idx
  ON public.trailer_loads (company_id, schedule_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS trailer_loads_completed_idx
  ON public.trailer_loads (company_id, completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS trailer_loads_schedule_id_trgm ON public.trailer_loads USING gin (schedule_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trailer_loads_outbound_trgm ON public.trailer_loads USING gin (outbound_trailer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trailer_loads_return_trgm ON public.trailer_loads USING gin (return_trailer gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trailer_loads_driver_trgm ON public.trailer_loads USING gin (driver gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trailer_loads_comments_trgm ON public.trailer_loads USING gin (comments gin_trgm_ops);

UPDATE public.trailer_loads l
SET completed_at = e.ts
FROM (
  SELECT load_id, max(created_at) AS ts
  FROM public.trailer_events
  WHERE event_type = 'Status: Completed'
  GROUP BY load_id
) e
WHERE e.load_id = l.id AND l.completed_at IS NULL AND l.status = 'Completed';

UPDATE public.trailer_loads
SET completed_at = COALESCE(updated_at, created_at)
WHERE status = 'Completed' AND completed_at IS NULL;

UPDATE public.trailer_events SET trailer_role = 'outbound'
WHERE trailer_role IS NULL AND event_type IN ('Load Created','Delivered to Store');
UPDATE public.trailer_events SET trailer_role = 'return'
WHERE trailer_role IS NULL AND event_type IN ('Arrived Yard','Returned To DC','Returning to Yard','Return Trailer Assigned');

CREATE OR REPLACE FUNCTION public.handle_trailer_load_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
  VALUES (NEW.id, NEW.outbound_trailer, 'outbound', 'Load Created', 'Schedule ' || NEW.schedule_id, auth.uid(), 'trigger');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_trailer_load_changes()
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
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return', 'Arrived Yard', 'Auto-stamped', auth.uid(), 'trigger');
  END IF;

  IF NEW.return_trailer_location = 'Returned To DC'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returned To DC' THEN
    NEW.status := 'Returned To DC';
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return', 'Returned To DC', NULL, auth.uid(), 'trigger');
  END IF;

  IF NEW.return_trailer_location = 'Store'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Store' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.outbound_trailer, 'outbound', 'Delivered to Store', NULL, auth.uid(), 'trigger');
  END IF;

  IF NEW.return_trailer_location = 'Returning'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returning' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.return_trailer, 'return', 'Returning to Yard', NULL, auth.uid(), 'trigger');
  END IF;

  IF NEW.outbound_trailer IS DISTINCT FROM OLD.outbound_trailer THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id, NEW.outbound_trailer, 'outbound', 'Correction',
            'Outbound trailer changed from ' || COALESCE(OLD.outbound_trailer,'(none)') || ' to ' || COALESCE(NEW.outbound_trailer,'(none)'),
            auth.uid(), 'trigger');
  END IF;

  IF NEW.return_trailer IS NOT NULL
     AND OLD.return_trailer IS DISTINCT FROM NEW.return_trailer THEN
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
    NEW.driver_id := (SELECT d.id FROM public.drivers d
                      WHERE lower(trim(d.name)) = lower(trim(NEW.driver)) LIMIT 1);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSIF OLD.status = 'Completed' THEN
      NEW.completed_at := NULL;
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source)
    VALUES (NEW.id,
            COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            CASE WHEN NEW.return_trailer IS NOT NULL THEN 'return' ELSE 'outbound' END,
            'Status: ' || NEW.status::text, NULL, auth.uid(), 'trigger');
  END IF;

  RETURN NEW;
END;
$function$;
