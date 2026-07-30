DROP POLICY IF EXISTS "authenticated create org" ON public.organizations;
CREATE POLICY "orgless users create org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (public.current_org_id() IS NULL);

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_dispatch() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_load_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_load_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_dispatch() TO authenticated;