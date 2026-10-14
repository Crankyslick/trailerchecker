CREATE OR REPLACE FUNCTION public.clear_load_parties(p_load_id uuid, p_clear_tractor boolean DEFAULT false, p_clear_broker boolean DEFAULT false)
RETURNS public.trailer_loads LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid; v_row public.trailer_loads;
BEGIN
  v_company := public.current_company_id();
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company is linked to your account'; END IF;
  IF NOT public.is_dispatcher_or_admin() THEN RAISE EXCEPTION 'You do not have permission to update this load'; END IF;
  UPDATE public.trailer_loads
     SET tractor_id = CASE WHEN p_clear_tractor THEN NULL ELSE tractor_id END,
         broker_id = CASE WHEN p_clear_broker THEN NULL ELSE broker_id END
   WHERE id = p_load_id AND company_id = v_company RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Load not found'; END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.clear_load_parties(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_load_parties(uuid, boolean, boolean) TO authenticated, service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['edi_documents','rate_confirmations','tractors','brokers'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;