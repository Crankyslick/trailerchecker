-- 1. RENAME CORE OBJECTS ------------------------------------------------
ALTER TABLE public.organizations RENAME TO tenants;
ALTER TABLE public.drivers RENAME COLUMN org_id TO tenant_id;
ALTER TABLE public.loads RENAME COLUMN org_id TO tenant_id;
ALTER TABLE public.profiles RENAME COLUMN org_id TO tenant_id;
ALTER TABLE public.sync_config RENAME COLUMN org_id TO tenant_id;
ALTER TABLE public.trailer_events RENAME COLUMN org_id TO tenant_id;
ALTER TABLE public.yard_check_ins RENAME COLUMN org_id TO tenant_id;

-- 2. TENANT CONTEXT FUNCTION ---------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;

ALTER TABLE public.drivers ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.loads ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.sync_config ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.trailer_events ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
ALTER TABLE public.yard_check_ins ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();

DROP FUNCTION IF EXISTS public.current_org_id() CASCADE;

CREATE OR REPLACE FUNCTION public.can_dispatch()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher')
$$;
REVOKE EXECUTE ON FUNCTION public.can_dispatch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_dispatch() TO authenticated, service_role;

-- 3. CLIENTS TABLE --------------------------------------------------------
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_info text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read clients" ON public.clients FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant insert clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_dispatch());
CREATE POLICY "tenant update clients" ON public.clients FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.can_dispatch())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_dispatch());
CREATE POLICY "tenant delete clients" ON public.clients FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- 4. PROFILE TENANT IMMUTABILITY -----------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_tenant_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_prevent_tenant_change ON public.profiles;
CREATE TRIGGER profiles_prevent_tenant_change BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_change();

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, email, updated_at) ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 5. SIGNUP FLOW ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant uuid := '11111111-1111-1111-1111-111111111111';
  _first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _first;
  INSERT INTO public.profiles (id, tenant_id, email, full_name)
  VALUES (NEW.id, _tenant, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _first THEN 'admin'::public.app_role ELSE 'dispatcher'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 6. RLS POLICIES (rebuilt on tenant_id) ---------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read own org" ON public.tenants;
DROP POLICY IF EXISTS "admins update own org" ON public.tenants;
DROP POLICY IF EXISTS "orgless users create org" ON public.tenants;
DROP POLICY IF EXISTS "members read own tenant" ON public.tenants;
DROP POLICY IF EXISTS "admins update own tenant" ON public.tenants;
DROP POLICY IF EXISTS "tenantless users create tenant" ON public.tenants;
CREATE POLICY "members read own tenant" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());
CREATE POLICY "admins update own tenant" ON public.tenants FOR UPDATE TO authenticated
  USING (id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tenantless users create tenant" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.current_tenant_id() IS NULL);

DROP POLICY IF EXISTS "read own profile" ON public.profiles;
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "org members read drivers" ON public.drivers;
DROP POLICY IF EXISTS "dispatchers insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "dispatchers update drivers" ON public.drivers;
DROP POLICY IF EXISTS "admins delete drivers" ON public.drivers;
CREATE POLICY "tenant read drivers" ON public.drivers FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_dispatch());
CREATE POLICY "tenant update drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.can_dispatch())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_dispatch());
CREATE POLICY "tenant delete drivers" ON public.drivers FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "org members read loads" ON public.loads;
DROP POLICY IF EXISTS "dispatchers insert loads" ON public.loads;
DROP POLICY IF EXISTS "dispatchers update loads" ON public.loads;
DROP POLICY IF EXISTS "admins delete loads" ON public.loads;
CREATE POLICY "tenant read loads" ON public.loads FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant insert loads" ON public.loads FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_dispatch());
CREATE POLICY "tenant update loads" ON public.loads FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.can_dispatch())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.can_dispatch());
CREATE POLICY "tenant delete loads" ON public.loads FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "org members read events" ON public.trailer_events;
DROP POLICY IF EXISTS "org members insert events" ON public.trailer_events;
DROP POLICY IF EXISTS "admins correct org trailer events" ON public.trailer_events;
DROP POLICY IF EXISTS "admins remove org trailer events" ON public.trailer_events;
CREATE POLICY "tenant read events" ON public.trailer_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant insert events" ON public.trailer_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update events" ON public.trailer_events FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tenant delete events" ON public.trailer_events FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "org members read checkins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "org members insert checkins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "org members update checkins" ON public.yard_check_ins;
DROP POLICY IF EXISTS "admins delete checkins" ON public.yard_check_ins;
CREATE POLICY "tenant read checkins" ON public.yard_check_ins FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant insert checkins" ON public.yard_check_ins FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant update checkins" ON public.yard_check_ins FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "tenant delete checkins" ON public.yard_check_ins FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "org members read sync" ON public.sync_config;
DROP POLICY IF EXISTS "admins manage sync" ON public.sync_config;
CREATE POLICY "tenant read sync" ON public.sync_config FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
CREATE POLICY "admins manage sync" ON public.sync_config FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "read roles in org" ON public.user_roles;
DROP POLICY IF EXISTS "admins assign roles in org" ON public.user_roles;
DROP POLICY IF EXISTS "admins update roles in org" ON public.user_roles;
DROP POLICY IF EXISTS "admins remove roles in org" ON public.user_roles;
CREATE POLICY "read roles in tenant" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins assign roles in tenant" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id()));
CREATE POLICY "admins update roles in tenant" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id()));
CREATE POLICY "admins remove roles in tenant" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND user_id <> auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.tenant_id = public.current_tenant_id()));

-- 7. INDEXES --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON public.drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loads_tenant ON public.loads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loads_client ON public.loads(client_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_config_tenant ON public.sync_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trailer_events_tenant ON public.trailer_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_yard_check_ins_tenant ON public.yard_check_ins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id);