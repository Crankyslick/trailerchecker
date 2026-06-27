
-- Enums
CREATE TYPE public.load_status AS ENUM (
  'Assigned','Heading To DC','Loaded','En Route','Delivered',
  'Picked Up Return Trailer','Returning','At Yard','Returned To DC',
  'Completed','Delayed','Exception'
);

CREATE TYPE public.trailer_location AS ENUM (
  'DC','Store','Returning','Yard','Returned To DC'
);

-- Loads table
CREATE TABLE public.loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id TEXT NOT NULL,
  cutoff_date DATE,
  cutoff_day TEXT,
  driver TEXT,
  outbound_trailer TEXT,
  origin_id TEXT,
  origin_name TEXT,
  str_number TEXT,
  str_name TEXT,
  cutoff_time TIME,
  arrival_date DATE,
  arrival_day TEXT,
  arrival_time TIME,
  delivery_sequence INTEGER,
  schedule_date DATE,
  unload_date DATE,
  unload_day TEXT,
  unload_time TIME,
  unload_type TEXT,
  has_sweep BOOLEAN DEFAULT FALSE,
  return_trailer TEXT,
  return_trailer_location public.trailer_location DEFAULT 'DC',
  yard_arrival_at TIMESTAMPTZ,
  comments TEXT,
  status public.load_status DEFAULT 'Assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loads TO anon, authenticated;
GRANT ALL ON public.loads TO service_role;
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Loads are publicly readable" ON public.loads FOR SELECT USING (true);
CREATE POLICY "Loads are publicly writable" ON public.loads FOR INSERT WITH CHECK (true);
CREATE POLICY "Loads are publicly updatable" ON public.loads FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Loads are publicly deletable" ON public.loads FOR DELETE USING (true);

-- Trailer event audit log
CREATE TABLE public.trailer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES public.loads(id) ON DELETE CASCADE,
  trailer_number TEXT,
  event_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trailer_events TO anon, authenticated;
GRANT ALL ON public.trailer_events TO service_role;
ALTER TABLE public.trailer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are publicly readable" ON public.trailer_events FOR SELECT USING (true);
CREATE POLICY "Events are publicly writable" ON public.trailer_events FOR INSERT WITH CHECK (true);

CREATE INDEX idx_loads_status ON public.loads(status);
CREATE INDEX idx_loads_location ON public.loads(return_trailer_location);
CREATE INDEX idx_loads_schedule_date ON public.loads(schedule_date);
CREATE INDEX idx_events_load ON public.trailer_events(load_id, created_at DESC);
CREATE INDEX idx_events_trailer ON public.trailer_events(trailer_number);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER loads_touch BEFORE UPDATE ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Yard arrival auto-stamp + status + audit
CREATE OR REPLACE FUNCTION public.handle_load_changes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Yard arrival: set timestamp + status when location becomes Yard
  IF NEW.return_trailer_location = 'Yard'
     AND (OLD.return_trailer_location IS DISTINCT FROM 'Yard') THEN
    NEW.yard_arrival_at := now();
    IF NEW.status NOT IN ('Completed','Returned To DC') THEN
      NEW.status := 'At Yard';
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Arrived Yard', 'Auto-stamped');
  END IF;

  -- Returned To DC clears yard timer
  IF NEW.return_trailer_location = 'Returned To DC'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returned To DC' THEN
    NEW.status := 'Returned To DC';
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Returned To DC', NULL);
  END IF;

  -- Location -> Store
  IF NEW.return_trailer_location = 'Store'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Store' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.outbound_trailer, 'Delivered to Store', NULL);
  END IF;

  -- Location -> Returning
  IF NEW.return_trailer_location = 'Returning'
     AND OLD.return_trailer_location IS DISTINCT FROM 'Returning' THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Returning to Yard', NULL);
  END IF;

  -- Return trailer assigned
  IF NEW.return_trailer IS NOT NULL
     AND OLD.return_trailer IS DISTINCT FROM NEW.return_trailer THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, NEW.return_trailer, 'Return Trailer Assigned', NEW.return_trailer);
  END IF;

  -- Status change
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
    VALUES (NEW.id, COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            'Status: ' || NEW.status::text, NULL);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER loads_audit BEFORE UPDATE ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.handle_load_changes();

-- Insert event on create
CREATE OR REPLACE FUNCTION public.handle_load_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.trailer_events(load_id, trailer_number, event_type, notes)
  VALUES (NEW.id, NEW.outbound_trailer, 'Load Created',
          'Schedule ' || NEW.schedule_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER loads_insert_event AFTER INSERT ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.handle_load_insert();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.loads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trailer_events;
