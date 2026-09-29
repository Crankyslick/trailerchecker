REVOKE ALL ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, text, jsonb, text, text) FROM public;
REVOKE ALL ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, text, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, text, jsonb, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_tracking_event(uuid, text, double precision, double precision, numeric, numeric, timestamptz, timestamptz, text, jsonb, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.recent_tracking_events(integer) FROM anon;
