
-- 1. Link companies to tenants (one company per tenant)
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.companies SET tenant_id = '11111111-1111-1111-1111-111111111111'
  WHERE tenant_id IS NULL AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = '11111111-1111-1111-1111-111111111111');
CREATE UNIQUE INDEX IF NOT EXISTS companies_tenant_id_key ON public.companies(tenant_id);

-- 2. current_tenant_id / current_company_id
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id FROM public.companies c
  WHERE c.tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;

-- 3. Owner counts as admin everywhere
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (role = 'owner'::public.app_role AND _role = 'admin'::public.app_role))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.current_user_has_any_role(ARRAY['owner','admin','dispatcher','billing']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.is_dispatcher_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.current_user_has_any_role(ARRAY['owner','admin','dispatcher']::public.app_role[]);
$$;

CREATE OR REPLACE FUNCTION public.can_dispatch()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_dispatcher_or_admin()
$$;

-- 4. Onboarding: tenant + company + profile + owner role, atomic and loud
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _tenant uuid;
  _company uuid;
  _name text;
BEGIN
  SELECT p.tenant_id INTO _tenant FROM public.profiles p WHERE p.id = NEW.id;
  IF _tenant IS NOT NULL THEN
    RETURN NEW;
  END IF;

  _name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(COALESCE(NEW.email, 'new user'), '@', 1)
  );

  INSERT INTO public.tenants (name) VALUES (_name) RETURNING id INTO _tenant;

  INSERT INTO public.companies (name, tenant_id)
  VALUES (_name, _tenant)
  RETURNING id INTO _company;

  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, _tenant, NEW.email, COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email))
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'onboarding failed for user % (%): %', NEW.id, NEW.email, SQLERRM;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. tenant_id is immutable everywhere it exists
CREATE OR REPLACE FUNCTION public.prevent_tenant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loads_prevent_tenant_change ON public.loads;
CREATE TRIGGER loads_prevent_tenant_change BEFORE UPDATE ON public.loads
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();
DROP TRIGGER IF EXISTS drivers_prevent_tenant_change ON public.drivers;
CREATE TRIGGER drivers_prevent_tenant_change BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();
DROP TRIGGER IF EXISTS clients_prevent_tenant_change ON public.clients;
CREATE TRIGGER clients_prevent_tenant_change BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

CREATE OR REPLACE FUNCTION public.prevent_company_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.company_id IS NOT NULL AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_company_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trailer_loads_prevent_company_change ON public.trailer_loads;
CREATE TRIGGER trailer_loads_prevent_company_change BEFORE UPDATE ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();
DROP TRIGGER IF EXISTS yard_check_ins_prevent_company_change ON public.yard_check_ins;
CREATE TRIGGER yard_check_ins_prevent_company_change BEFORE UPDATE ON public.yard_check_ins
FOR EACH ROW EXECUTE FUNCTION public.prevent_company_change();

-- 6. Column-level lockdown on profiles.tenant_id
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (email, full_name, updated_at) ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 7. Company-scoped defaults on the live dispatch tables
ALTER TABLE public.trailer_loads ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.yard_check_ins ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.trailer_clients ALTER COLUMN company_id SET DEFAULT public.current_company_id();
ALTER TABLE public.trailer_sync_config ALTER COLUMN company_id SET DEFAULT public.current_company_id();
UPDATE public.trailer_sync_config SET company_id = (SELECT id FROM public.companies WHERE tenant_id = '11111111-1111-1111-1111-111111111111')
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS trailer_loads_company_id_idx ON public.trailer_loads(company_id);
CREATE INDEX IF NOT EXISTS yard_check_ins_company_id_idx ON public.yard_check_ins(company_id);
CREATE INDEX IF NOT EXISTS trailer_clients_company_id_idx ON public.trailer_clients(company_id);

-- 8. Tenant isolation policies on the live tables
DROP POLICY IF EXISTS "Staff read companies" ON public.companies;
CREATE POLICY "read own company" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id());

DROP POLICY IF EXISTS "Staff read trailer_loads" ON public.trailer_loads;
DROP POLICY IF EXISTS "Dispatch/admin write trailer_loads" ON public.trailer_loads;
CREATE POLICY "company read trailer_loads" ON public.trailer_loads FOR SELECT TO authenticated
  USING (company_id = public.current_company_id()
         AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])));
CREATE POLICY "company write trailer_loads" ON public.trailer_loads FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_dispatcher_or_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_dispatcher_or_admin());

DROP POLICY IF EXISTS "Staff read trailer_events" ON public.trailer_events;
DROP POLICY IF EXISTS "Staff write trailer_events" ON public.trailer_events;
CREATE POLICY "company read trailer_events" ON public.trailer_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trailer_loads l
                 WHERE l.id = trailer_events.load_id AND l.company_id = public.current_company_id())
         AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])));
CREATE POLICY "company write trailer_events" ON public.trailer_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.trailer_loads l
                      WHERE l.id = trailer_events.load_id AND l.company_id = public.current_company_id())
              AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])));

DROP POLICY IF EXISTS "Staff/guard read yard_check_ins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "Staff/guard write yard_check_ins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "Staff/guard update yard_check_ins" ON public.yard_check_ins;
CREATE POLICY "company read yard_check_ins" ON public.yard_check_ins FOR SELECT TO authenticated
  USING (company_id = public.current_company_id()
         AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])));
CREATE POLICY "company write yard_check_ins" ON public.yard_check_ins FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id()
              AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])));
CREATE POLICY "company update yard_check_ins" ON public.yard_check_ins FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id()
         AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])))
  WITH CHECK (company_id = public.current_company_id()
              AND (public.is_staff() OR public.current_user_has_any_role(ARRAY['guard']::public.app_role[])));

DROP POLICY IF EXISTS "Staff manage trailer_clients" ON public.trailer_clients;
CREATE POLICY "company manage trailer_clients" ON public.trailer_clients FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff())
  WITH CHECK (company_id = public.current_company_id() AND public.is_staff());

DROP POLICY IF EXISTS "Staff read trailer_sync_config" ON public.trailer_sync_config;
DROP POLICY IF EXISTS "Admin manage trailer_sync_config" ON public.trailer_sync_config;
CREATE POLICY "company read trailer_sync_config" ON public.trailer_sync_config FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company manage trailer_sync_config" ON public.trailer_sync_config FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Staff read entities" ON public.entities;
DROP POLICY IF EXISTS "Admins manage entities" ON public.entities;
CREATE POLICY "company read entities" ON public.entities FOR SELECT TO authenticated
  USING (parent_tenant_id = public.current_company_id() AND public.is_staff());
CREATE POLICY "company manage entities" ON public.entities FOR ALL TO authenticated
  USING (parent_tenant_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (parent_tenant_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 9. user_roles: no self-escalation, tenant scoped reads
DROP POLICY IF EXISTS "read roles in tenant" ON public.user_roles;
CREATE POLICY "read roles in tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (public.has_role(auth.uid(), 'admin'::public.app_role)
             AND EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id())));

DROP POLICY IF EXISTS "admins assign roles in tenant" ON public.user_roles;
CREATE POLICY "admins assign roles in tenant" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              AND role <> 'owner'::public.app_role
              AND EXISTS (SELECT 1 FROM public.profiles p
                          WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id()));

-- 10. Grants
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
REVOKE ALL ON public.companies FROM anon;
