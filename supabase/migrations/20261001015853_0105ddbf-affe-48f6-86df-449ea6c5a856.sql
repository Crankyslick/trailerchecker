-- ============================================================================
-- Fix: every table the frontend subscribes to via postgres_changes was
-- missing from the supabase_realtime publication. Only `loads` (dead table,
-- pre-rename) and the pre-September `trailer_events` (since archived to
-- legacy_trailer_events) were ever added — found by cross-referencing every
-- `ALTER PUBLICATION supabase_realtime ADD TABLE` statement in this
-- migration history against every `realtimeSubscribe(...)` /
-- `postgres_changes` call site in the frontend. trailer_loads itself,
-- despite being the single most-subscribed table in the app, was never a
-- member. Wrapped in a DO block per table so this is safe to run even if a
-- table was already added manually via the dashboard.
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trailer_loads',
    'trailer_events',
    'yard_check_ins',
    'orders',
    'shipments',
    'stops',
    'legs',
    'equipment',
    'carriers',
    'tenders',
    'customer_invoices',
    'carrier_settlements',
    'notifications',
    'drivers',
    'trailer_sync_config',
    'containers',
    'container_events',
    'chassis'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;