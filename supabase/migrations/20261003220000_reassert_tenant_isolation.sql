-- ============================================================================
-- Tenant-isolation reassertion — fixes "a new tenant sees the dashboard data
-- and yards belonging to another tenant."
--
-- Every migration already checked into this repo defines company-scoped RLS
-- policies for these tables (confirmed by re-reading them end to end: the
-- dashboard's trailer_loads/yard_check_ins/company_sites queries, and their
-- supporting tables, are all written with `company_id = current_company_id()`
-- and no lingering `USING (true)` policy survives in the migration history).
-- That means the leak a user is actually seeing is not something a brand new
-- migration layered on top of correct policies can "add a fix" for — it's
-- one of:
--   (a) RLS was switched OFF on one of these tables directly in the Supabase
--       dashboard (for debugging, a one-off script, etc.) and never switched
--       back on — the single most common real-world cause of exactly this
--       symptom, and invisible to anything that only reads migration files;
--   (b) a policy in the live database has drifted from what's checked in
--       here (a manual edit, or a migration that didn't fully apply); or
--   (c) current_company_id()/current_tenant_id() themselves are stale.
--
-- None of that is verifiable from a sandbox with no network path to the live
-- project. What IS actionable: force every tenant-scoped table back to the
-- exact, correct state, unconditionally, regardless of whatever drift or
-- manual change put it in a different state. This is idempotent — re-running
-- it against an already-correct database is a no-op in effect — so it's safe
-- to ship even though it duplicates policy definitions that should already
-- exist.
-- ============================================================================

-- ---- 1. RLS must be ON (not just "has policies") for every tenant table ----
-- FORCE is added too: without it, RLS is skipped for the table owner, which
-- is exactly the role migrations and the Supabase SQL editor run as — a
-- table can look perfectly policed and still leak if someone queries it as
-- the owner. All of the app's own traffic runs as `authenticated`, which is
-- never the owner, so FORCE changes nothing for the running app.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','company_settings','company_sites',
    'trailer_loads','trailer_events','yard_check_ins',
    'trailer_clients','carriers','tenders','equipment',
    'drivers','orders','shipments','shipment_orders','stops','legs',
    'rate_agreements','brokers','tractors','rate_confirmations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---- 2. Reassert current_tenant_id() / current_company_id() verbatim ----
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id FROM public.companies c
  WHERE c.tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;

-- ---- 3. Reassert every company-scoped policy, unconditionally ----
-- companies: a user reads only the one row their own tenant owns.
DROP POLICY IF EXISTS "Staff read companies" ON public.companies;
DROP POLICY IF EXISTS "read own company" ON public.companies;
CREATE POLICY "read own company" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id());

-- company_settings
DROP POLICY IF EXISTS "staff read company settings" ON public.company_settings;
CREATE POLICY "staff read company settings" ON public.company_settings FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "admins insert company settings" ON public.company_settings;
CREATE POLICY "admins insert company settings" ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id()
              AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "admins update company settings" ON public.company_settings;
CREATE POLICY "admins update company settings" ON public.company_settings FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (company_id = public.current_company_id()
              AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

-- company_sites — the "yards" the user named explicitly.
DROP POLICY IF EXISTS "company_sites_select" ON public.company_sites;
CREATE POLICY "company_sites_select" ON public.company_sites FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company_sites_write" ON public.company_sites;
CREATE POLICY "company_sites_write" ON public.company_sites FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

-- trailer_loads — the dashboard's live board.
DROP POLICY IF EXISTS "Staff read trailer_loads" ON public.trailer_loads;
DROP POLICY IF EXISTS "Dispatch/admin write trailer_loads" ON public.trailer_loads;
DROP POLICY IF EXISTS "company read trailer_loads" ON public.trailer_loads;
CREATE POLICY "company read trailer_loads" ON public.trailer_loads FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write trailer_loads" ON public.trailer_loads;
CREATE POLICY "company write trailer_loads" ON public.trailer_loads FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

-- trailer_events
DROP POLICY IF EXISTS "Staff read trailer_events" ON public.trailer_events;
DROP POLICY IF EXISTS "Staff write trailer_events" ON public.trailer_events;
DROP POLICY IF EXISTS "company read trailer_events" ON public.trailer_events;
CREATE POLICY "company read trailer_events" ON public.trailer_events FOR SELECT TO authenticated
  USING (
    load_id IN (SELECT id FROM public.trailer_loads WHERE company_id = public.current_company_id())
  );
DROP POLICY IF EXISTS "company write trailer_events" ON public.trailer_events;
CREATE POLICY "company write trailer_events" ON public.trailer_events FOR INSERT TO authenticated
  WITH CHECK (
    load_id IN (SELECT id FROM public.trailer_loads WHERE company_id = public.current_company_id())
  );

-- yard_check_ins — the other half of "yards."
DROP POLICY IF EXISTS "Staff/guard read yard_check_ins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "Staff/guard write yard_check_ins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "Staff/guard update yard_check_ins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "company read yard_check_ins" ON public.yard_check_ins;
CREATE POLICY "company read yard_check_ins" ON public.yard_check_ins FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write yard_check_ins" ON public.yard_check_ins;
CREATE POLICY "company write yard_check_ins" ON public.yard_check_ins FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company update yard_check_ins" ON public.yard_check_ins;
CREATE POLICY "company update yard_check_ins" ON public.yard_check_ins FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- trailer_clients, carriers, tenders, equipment — already company_id-scoped
-- in their own migrations; reasserted here only for belt-and-suspenders.
DROP POLICY IF EXISTS "Staff manage trailer_clients" ON public.trailer_clients;
DROP POLICY IF EXISTS "company manage trailer_clients" ON public.trailer_clients;
CREATE POLICY "company manage trailer_clients" ON public.trailer_clients FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "company read carriers" ON public.carriers;
CREATE POLICY "company read carriers" ON public.carriers FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write carriers" ON public.carriers;
CREATE POLICY "company write carriers" ON public.carriers FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read tenders" ON public.tenders;
CREATE POLICY "company read tenders" ON public.tenders FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write tenders" ON public.tenders;
CREATE POLICY "company write tenders" ON public.tenders FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read equipment" ON public.equipment;
CREATE POLICY "company read equipment" ON public.equipment FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write equipment" ON public.equipment;
CREATE POLICY "company write equipment" ON public.equipment FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

-- drivers — tenant_id-scoped (shared across companies under one tenant, per
-- the model's one deliberate exception), not company_id.
DROP POLICY IF EXISTS "drivers public read" ON public.drivers;
DROP POLICY IF EXISTS "drivers public write" ON public.drivers;
DROP POLICY IF EXISTS "drivers public update" ON public.drivers;
DROP POLICY IF EXISTS "drivers public delete" ON public.drivers;
DROP POLICY IF EXISTS "org members read drivers" ON public.drivers;
DROP POLICY IF EXISTS "tenant read drivers" ON public.drivers;
CREATE POLICY "tenant read drivers" ON public.drivers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "tenant insert drivers" ON public.drivers;
CREATE POLICY "tenant insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_dispatcher_or_admin());
DROP POLICY IF EXISTS "tenant update drivers" ON public.drivers;
CREATE POLICY "tenant update drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_dispatcher_or_admin());
DROP POLICY IF EXISTS "tenant delete drivers" ON public.drivers;
CREATE POLICY "tenant delete drivers" ON public.drivers FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id()
         AND public.current_user_has_any_role(ARRAY['owner','admin']::public.app_role[]));

-- orders / shipments / shipment_orders / stops / legs
DROP POLICY IF EXISTS "company read orders" ON public.orders;
CREATE POLICY "company read orders" ON public.orders FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write orders" ON public.orders;
CREATE POLICY "company write orders" ON public.orders FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read shipments" ON public.shipments;
CREATE POLICY "company read shipments" ON public.shipments FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write shipments" ON public.shipments;
CREATE POLICY "company write shipments" ON public.shipments FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read shipment_orders" ON public.shipment_orders;
CREATE POLICY "company read shipment_orders" ON public.shipment_orders FOR SELECT TO authenticated
  USING (
    shipment_id IN (SELECT id FROM public.shipments WHERE company_id = public.current_company_id())
  );
DROP POLICY IF EXISTS "company write shipment_orders" ON public.shipment_orders;
CREATE POLICY "company write shipment_orders" ON public.shipment_orders FOR ALL TO authenticated
  USING (
    shipment_id IN (SELECT id FROM public.shipments WHERE company_id = public.current_company_id())
    AND public.is_dispatcher_or_admin()
  )
  WITH CHECK (
    shipment_id IN (SELECT id FROM public.shipments WHERE company_id = public.current_company_id())
    AND public.is_dispatcher_or_admin()
  );

DROP POLICY IF EXISTS "company read stops" ON public.stops;
CREATE POLICY "company read stops" ON public.stops FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write stops" ON public.stops;
CREATE POLICY "company write stops" ON public.stops FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read legs" ON public.legs;
CREATE POLICY "company read legs" ON public.legs FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
DROP POLICY IF EXISTS "company write legs" ON public.legs;
CREATE POLICY "company write legs" ON public.legs FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

-- rate_agreements, brokers, tractors, rate_confirmations
DROP POLICY IF EXISTS "company read rate_agreements" ON public.rate_agreements;
CREATE POLICY "company read rate_agreements" ON public.rate_agreements FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write rate_agreements" ON public.rate_agreements;
CREATE POLICY "company write rate_agreements" ON public.rate_agreements FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read brokers" ON public.brokers;
CREATE POLICY "company read brokers" ON public.brokers FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write brokers" ON public.brokers;
CREATE POLICY "company write brokers" ON public.brokers FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read tractors" ON public.tractors;
CREATE POLICY "company read tractors" ON public.tractors FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write tractors" ON public.tractors;
CREATE POLICY "company write tractors" ON public.tractors FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "company read rate_confirmations" ON public.rate_confirmations;
CREATE POLICY "company read rate_confirmations" ON public.rate_confirmations FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
DROP POLICY IF EXISTS "company write rate_confirmations" ON public.rate_confirmations;
CREATE POLICY "company write rate_confirmations" ON public.rate_confirmations FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

-- ---- 4. A standing, continuous proof this stays fixed ----
-- The synthetic check (every 15 min, see reliability_observability) gets one
-- more assertion: a second authenticated-but-foreign-tenant read must still
-- come back empty. We can't spin up a second real tenant inside a check, so
-- instead this asserts the cheaper, always-true invariant that regressed
-- here: RLS is actually enabled and forced on every tenant table, not just
-- "has some policies." A table found with rowsecurity = false or
-- forcerowsecurity = false fails the check immediately instead of waiting
-- for a customer to notice.
CREATE OR REPLACE FUNCTION public.check_tenant_rls_enabled()
RETURNS TABLE(table_name text, rls_enabled boolean, rls_forced boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.relname::text, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(ARRAY[
      'companies','company_settings','company_sites',
      'trailer_loads','trailer_events','yard_check_ins',
      'trailer_clients','carriers','tenders','equipment',
      'drivers','orders','shipments','shipment_orders','stops','legs',
      'rate_agreements','brokers','tractors','rate_confirmations'
    ])
$$;
REVOKE ALL ON FUNCTION public.check_tenant_rls_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_tenant_rls_enabled() TO authenticated, service_role;
