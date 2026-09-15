CREATE OR REPLACE FUNCTION public.dispatch_trailer(
  p_load_id uuid,
  p_trailer text,
  p_driver text,
  p_destination text DEFAULT NULL,
  p_previous_driver text DEFAULT NULL,
  p_command_id text DEFAULT NULL
)
RETURNS public.trailer_loads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_trailer text;
  v_driver text;
  v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company is linked to your account';
  END IF;

  IF NOT public.is_dispatcher_or_admin() THEN
    RAISE EXCEPTION 'You do not have permission to dispatch trailers';
  END IF;

  v_trailer := upper(btrim(coalesce(p_trailer, '')));
  IF v_trailer = '' THEN
    RAISE EXCEPTION 'Trailer number is required';
  END IF;

  v_driver := btrim(coalesce(p_driver, ''));
  IF v_driver = '' THEN
    RAISE EXCEPTION 'Driver is required';
  END IF;

  IF p_load_id IS NULL THEN
    RAISE EXCEPTION 'A scheduled load must be selected for every dispatch';
  END IF;

  -- Idempotency: the same command replays without creating a second dispatch.
  IF p_command_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trailer_events e WHERE e.command_id = p_command_id
  ) THEN
    SELECT * INTO v_row FROM public.trailer_loads
     WHERE id = p_load_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That load does not belong to your company';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.trailer_loads
     SET outbound_trailer = v_trailer,
         driver = v_driver,
         return_trailer_location = 'Store',
         status = 'Assigned'
   WHERE id = p_load_id AND company_id = v_company
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That load does not belong to your company';
  END IF;

  INSERT INTO public.trailer_events
    (load_id, trailer_number, trailer_role, event_type, note, user_id, source, command_id)
  VALUES
    (v_row.id, v_trailer, 'outbound', 'Dispatched',
     'Trailer ' || v_trailer || ' dispatched to ' || coalesce(nullif(btrim(coalesce(p_destination, '')), ''), 'the default yard')
       || '. Driver: ' || v_driver
       || coalesce(' · Returned by ' || nullif(btrim(coalesce(p_previous_driver, '')), ''), ''),
     auth.uid(), 'rpc', p_command_id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_trailer(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_trailer(uuid, text, text, text, text, text) TO authenticated;