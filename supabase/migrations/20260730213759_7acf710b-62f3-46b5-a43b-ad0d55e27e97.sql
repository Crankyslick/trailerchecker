-- ============ ROLES ENUM ============
CREATE TYPE public.app_role AS ENUM ('admin', 'dispatcher', 'guard');

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  yard_count integer NOT NULL DEFAULT 1,
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Seed the default org for existing data
INSERT INTO public.organizations (id, name, plan, yard_count, onboarded)
VALUES ('11111111-1111-1111-1111-111111111111', 'Vital Transportation Corporation', 'enterprise', 3, true);

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.can_dispatch()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dispatcher')
$$;

-- New signups join the default org; first ever user becomes admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := '11111111-1111-1111-1111-111111111111';
  _first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO _first;
  INSERT INTO public.profiles (id, org_id, email, full_name)
  VALUES (NEW.id, _org, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _first THEN 'admin'::public.app_role ELSE 'dispatcher'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TENANT COLUMNS ON EXISTING TABLES ============
ALTER TABLE public.loads          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.drivers        ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.yard_check_ins ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.trailer_events ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sync_config    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.loads          SET org_id = '11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.drivers        SET org_id = '11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.yard_check_ins SET org_id = '11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.trailer_events SET org_id = '11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;
UPDATE public.sync_config    SET org_id = '11111111-1111-1111-1111-111111111111' WHERE org_id IS NULL;

ALTER TABLE public.loads          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.drivers        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.yard_check_ins ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.trailer_events ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.sync_config    ALTER COLUMN org_id SET DEFAULT public.current_org_id();

CREATE INDEX IF NOT EXISTS loads_org_idx          ON public.loads(org_id);
CREATE INDEX IF NOT EXISTS drivers_org_idx        ON public.drivers(org_id);
CREATE INDEX IF NOT EXISTS yard_check_ins_org_idx ON public.yard_check_ins(org_id);
CREATE INDEX IF NOT EXISTS trailer_events_org_idx ON public.trailer_events(org_id);

-- ============ POLICIES: organizations / profiles / user_roles ============
CREATE POLICY "members read own org" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id());
CREATE POLICY "admins update own org" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "authenticated create org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "read roles in org" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ POLICIES: rewrite existing public access to org-scoped ============
DROP POLICY IF EXISTS "Loads are publicly readable" ON public.loads;
DROP POLICY IF EXISTS "Loads are publicly writable" ON public.loads;
DROP POLICY IF EXISTS "Loads are publicly updatable" ON public.loads;
DROP POLICY IF EXISTS "Loads are publicly deletable" ON public.loads;
CREATE POLICY "org members read loads" ON public.loads FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "dispatchers insert loads" ON public.loads FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.can_dispatch());
CREATE POLICY "dispatchers update loads" ON public.loads FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.can_dispatch())
  WITH CHECK (org_id = public.current_org_id() AND public.can_dispatch());
CREATE POLICY "admins delete loads" ON public.loads FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "drivers public read" ON public.drivers;
DROP POLICY IF EXISTS "drivers public write" ON public.drivers;
DROP POLICY IF EXISTS "drivers public update" ON public.drivers;
DROP POLICY IF EXISTS "drivers public delete" ON public.drivers;
CREATE POLICY "org members read drivers" ON public.drivers FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "dispatchers insert drivers" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.can_dispatch());
CREATE POLICY "dispatchers update drivers" ON public.drivers FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.can_dispatch())
  WITH CHECK (org_id = public.current_org_id() AND public.can_dispatch());
CREATE POLICY "admins delete drivers" ON public.drivers FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "yard_check_ins public read" ON public.yard_check_ins;
DROP POLICY IF EXISTS "yard_check_ins public insert" ON public.yard_check_ins;
DROP POLICY IF EXISTS "yard_check_ins public update" ON public.yard_check_ins;
DROP POLICY IF EXISTS "yard_check_ins public delete" ON public.yard_check_ins;
CREATE POLICY "org members read checkins" ON public.yard_check_ins FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "org members insert checkins" ON public.yard_check_ins FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "org members update checkins" ON public.yard_check_ins FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "admins delete checkins" ON public.yard_check_ins FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Events are publicly readable" ON public.trailer_events;
DROP POLICY IF EXISTS "Events are publicly writable" ON public.trailer_events;
CREATE POLICY "org members read events" ON public.trailer_events FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "org members insert events" ON public.trailer_events FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "sync_config public read" ON public.sync_config;
DROP POLICY IF EXISTS "sync_config public write" ON public.sync_config;
CREATE POLICY "org members read sync" ON public.sync_config FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "admins manage sync" ON public.sync_config FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- Anonymous access is fully revoked now that the app is authenticated.
REVOKE ALL ON public.loads, public.drivers, public.yard_check_ins, public.trailer_events, public.sync_config FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loads, public.drivers, public.yard_check_ins, public.sync_config TO authenticated;
GRANT SELECT, INSERT ON public.trailer_events TO authenticated;

CREATE TRIGGER organizations_touch BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
