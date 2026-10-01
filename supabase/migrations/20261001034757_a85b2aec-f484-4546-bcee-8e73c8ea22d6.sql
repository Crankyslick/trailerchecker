-- 1. Lock down EXECUTE on every SECURITY DEFINER routine in public.
-- Trigger routines and internal-only routines lose all direct callability;
-- user-facing RPCs keep exactly the authenticated access they have today.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           pg_get_function_result(p.oid) = 'trigger' AS is_trigger,
           has_function_privilege('authenticated', p.oid, 'execute') AS auth_ok
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);

    IF (NOT f.is_trigger) AND f.auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;

    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- 2. Explicit deny-all policies on the locked internal tables.
--    Neither table carries any grant, so this documents and enforces intent.
DROP POLICY IF EXISTS "sync_secrets are never read directly" ON public.sync_secrets;
CREATE POLICY "sync_secrets are never read directly"
  ON public.sync_secrets
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "internal job tokens are never read directly" ON public.internal_job_tokens;
CREATE POLICY "internal job tokens are never read directly"
  ON public.internal_job_tokens
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
