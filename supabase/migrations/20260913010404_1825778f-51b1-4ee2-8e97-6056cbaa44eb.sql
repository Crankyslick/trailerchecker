REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_dispatcher_or_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dispatcher_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) TO authenticated;