-- 1. Every tenant/company scoped row must carry an owner.
UPDATE public.companies c SET tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.tenant_id IS NOT NULL LIMIT 1) WHERE c.tenant_id IS NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('drivers','tenant_id'),('loads','tenant_id'),('sync_config','tenant_id'),
      ('legacy_trailer_events','tenant_id'),('legacy_yard_check_ins','tenant_id'),
      ('companies','tenant_id'),
      ('trailer_loads','company_id'),('yard_check_ins','company_id'),
      ('trailer_clients','company_id'),('trailer_sync_config','company_id')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I IS NULL', r.tbl, r.col);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', r.tbl, r.col);
  END LOOP;
END $$;

ALTER TABLE public.companies ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();

-- 2. A user must never be able to author their own profile row (and pick a tenant).
--    handle_new_user() is SECURITY DEFINER and is the only writer.
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
REVOKE INSERT ON public.profiles FROM authenticated;

-- 3. Company records are permanently bound to one tenant.
DROP TRIGGER IF EXISTS companies_lock_tenant ON public.companies;
CREATE TRIGGER companies_lock_tenant
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

-- 4. Foreign keys must not point across tenant boundaries.
CREATE OR REPLACE FUNCTION public.assert_same_company_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid;
BEGIN
  SELECT c.tenant_id INTO _tenant FROM public.companies c WHERE c.id = NEW.company_id;

  IF TG_TABLE_NAME = 'trailer_loads' THEN
    IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.drivers d WHERE d.id = NEW.driver_id AND d.tenant_id = _tenant
    ) THEN
      RAISE EXCEPTION 'driver belongs to a different organization';
    END IF;
    IF NEW.client_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.trailer_clients tc WHERE tc.id = NEW.client_id AND tc.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'client belongs to a different organization';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'yard_check_ins' THEN
    IF NEW.inbound_load_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.trailer_loads l WHERE l.id = NEW.inbound_load_id AND l.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'load belongs to a different organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trailer_loads_assert_refs ON public.trailer_loads;
CREATE TRIGGER trailer_loads_assert_refs
  BEFORE INSERT OR UPDATE ON public.trailer_loads
  FOR EACH ROW EXECUTE FUNCTION public.assert_same_company_refs();

DROP TRIGGER IF EXISTS yard_check_ins_assert_refs ON public.yard_check_ins;
CREATE TRIGGER yard_check_ins_assert_refs
  BEFORE INSERT OR UPDATE ON public.yard_check_ins
  FOR EACH ROW EXECUTE FUNCTION public.assert_same_company_refs();

CREATE OR REPLACE FUNCTION public.assert_same_tenant_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers d WHERE d.id = NEW.driver_id AND d.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'driver belongs to a different organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS containers_assert_refs ON public.containers;
CREATE TRIGGER containers_assert_refs
  BEFORE INSERT OR UPDATE ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.assert_same_tenant_refs();

-- 5. Admins must not be able to mint owners (including themselves).
DROP POLICY IF EXISTS "admins update roles in tenant" ON public.user_roles;
CREATE POLICY "admins update roles in tenant"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'owner'::app_role
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = current_tenant_id())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'owner'::app_role
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = current_tenant_id())
  );

-- 6. Only a genuinely tenantless user may create a tenant, and only one.
DROP POLICY IF EXISTS "tenantless users create tenant" ON public.tenants;
CREATE POLICY "tenantless users create tenant"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (current_tenant_id() IS NULL AND auth.uid() IS NOT NULL);