-- lovable-cron-fallback-reviewed: yard 24h/48h deadlines are purely time-based; user-supplied spec requires 5-minute alert latency
CREATE TABLE public.alert_state (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alert_type  text NOT NULL CHECK (alert_type IN
    ('no_driver','missing_trailer','missing_return_trailer','yard_deadline','yard_critical','delayed')),
  load_id     uuid NOT NULL REFERENCES public.trailer_loads(id) ON DELETE CASCADE,
  raised_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX alert_state_active_uniq ON public.alert_state(alert_type, load_id) WHERE resolved_at IS NULL;
CREATE INDEX alert_state_company_idx ON public.alert_state(company_id, raised_at DESC);
CREATE INDEX alert_state_load_idx    ON public.alert_state(load_id);

REVOKE ALL ON public.alert_state FROM PUBLIC, anon;
GRANT SELECT ON public.alert_state TO authenticated;
GRANT ALL    ON public.alert_state TO service_role;
ALTER TABLE public.alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company staff read alert state" ON public.alert_state
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());

CREATE OR REPLACE VIEW public.load_alert_conditions AS
WITH s AS (
  SELECT l.id, l.company_id, l.schedule_id, l.status, l.driver_id, l.driver, l.outbound_trailer,
         l.return_trailer, l.return_trailer_location, l.cutoff_date, l.str_number, l.str_name,
         coalesce(cs.yard_deadline_hours, 24) AS dl,
         coalesce(cs.yard_critical_hours, 48) AS cr,
         extract(epoch FROM (now() - l.yard_arrival_at)) / 3600.0 AS yard_hours
  FROM public.trailer_loads l
  LEFT JOIN public.company_settings cs ON cs.company_id = l.company_id
  WHERE l.superseded_by_id IS NULL AND l.status <> 'Completed'
)
SELECT company_id, id AS load_id, 'no_driver'::text AS alert_type,
       'No driver assigned: ' || coalesce(schedule_id, id::text) AS title,
       'Store ' || coalesce(str_number, '?') || ' ' || coalesce(str_name, '') ||
       ' is due ' || cutoff_date::text || ' with no driver assigned.' AS body
FROM s
WHERE btrim(coalesce(driver, '')) = '' AND cutoff_date <= current_date + 1
UNION ALL
SELECT company_id, id, 'missing_trailer',
       'Missing trailer number: ' || coalesce(schedule_id, id::text),
       'Status is ' || status::text || ' but no outbound trailer number is recorded.'
FROM s
WHERE status IN ('Heading To DC', 'Loaded', 'En Route') AND btrim(coalesce(outbound_trailer, '')) = ''
UNION ALL
SELECT company_id, id, 'missing_return_trailer',
       'Missing return trailer: ' || coalesce(schedule_id, id::text),
       'Status is ' || status::text || ' but no return trailer number is recorded.'
FROM s
WHERE status IN ('Picked Up Return Trailer', 'Returning', 'At Yard') AND btrim(coalesce(return_trailer, '')) = ''
UNION ALL
SELECT company_id, id, 'yard_deadline',
       'Trailer at yard over ' || dl || 'h: ' || coalesce(nullif(return_trailer, ''), schedule_id, id::text),
       'At yard for ' || floor(yard_hours)::int || 'h (limit ' || dl || 'h, critical ' || cr || 'h).'
FROM s
WHERE return_trailer_location = 'Yard' AND yard_hours IS NOT NULL AND yard_hours >= dl AND yard_hours < cr
UNION ALL
SELECT company_id, id, 'yard_critical',
       'Trailer at yard over ' || cr || 'h: ' || coalesce(nullif(return_trailer, ''), schedule_id, id::text),
       'At yard for ' || floor(yard_hours)::int || 'h (critical limit ' || cr || 'h).'
FROM s
WHERE return_trailer_location = 'Yard' AND yard_hours IS NOT NULL AND yard_hours >= cr
UNION ALL
SELECT company_id, id, 'delayed',
       'Delayed load: ' || coalesce(schedule_id, id::text),
       'Load is marked Delayed.'
FROM s
WHERE status = 'Delayed';

ALTER VIEW public.load_alert_conditions SET (security_invoker = true);
REVOKE ALL ON public.load_alert_conditions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.load_alert_conditions TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_alerts(p_notify boolean DEFAULT true)
RETURNS TABLE (raised integer, resolved integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_raised   integer := 0;
  v_resolved integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('public.evaluate_alerts')) THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  UPDATE public.alert_state a
     SET resolved_at = now()
   WHERE a.resolved_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.load_alert_conditions c
                      WHERE c.load_id = a.load_id AND c.alert_type = a.alert_type);
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  WITH new_alerts AS (
    INSERT INTO public.alert_state (company_id, alert_type, load_id)
    SELECT c.company_id, c.alert_type, c.load_id
      FROM public.load_alert_conditions c
     WHERE NOT EXISTS (SELECT 1 FROM public.alert_state a
                        WHERE a.load_id = c.load_id AND a.alert_type = c.alert_type AND a.resolved_at IS NULL)
    ON CONFLICT (alert_type, load_id) WHERE resolved_at IS NULL DO NOTHING
    RETURNING company_id, alert_type, load_id
  ),
  sent AS (
    SELECT n.load_id,
           CASE WHEN p_notify THEN
             public.notify_role(n.company_id, 'dispatcher', 'alert_' || n.alert_type,
                                c.title, c.body, '/history/' || n.load_id::text)
           END AS _
      FROM new_alerts n
      JOIN public.load_alert_conditions c ON c.load_id = n.load_id AND c.alert_type = n.alert_type
  )
  SELECT count(*) INTO v_raised FROM sent;

  RETURN QUERY SELECT v_raised, v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_alerts(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_alerts(boolean) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'evaluate-alerts';
    PERFORM cron.schedule('evaluate-alerts', '*/5 * * * *', 'SELECT public.evaluate_alerts()');
  END IF;
END $$;

SELECT * FROM public.evaluate_alerts(false);

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

  IF NEW.driver IS DISTINCT FROM OLD.driver THEN
    IF btrim(coalesce(NEW.driver, '')) = '' THEN
      NEW.driver_id := NULL;
    ELSE
      NEW.driver_id := (SELECT d.id FROM public.drivers d
                        WHERE lower(trim(d.name)) = lower(trim(NEW.driver)) LIMIT 1);
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSIF OLD.status = 'Completed' THEN
      NEW.completed_at := NULL;
    END IF;
    INSERT INTO public.trailer_events(load_id, trailer_number, trailer_role, event_type, note, user_id, source,
                                      from_status, to_status)
    VALUES (NEW.id,
            COALESCE(NEW.return_trailer, NEW.outbound_trailer),
            CASE WHEN NEW.return_trailer IS NOT NULL THEN 'return' ELSE 'outbound' END,
            'Status: ' || NEW.status::text, NULL, auth.uid(), 'trigger',
            OLD.status, NEW.status);
  END IF;

  RETURN NEW;
END;
$function$;