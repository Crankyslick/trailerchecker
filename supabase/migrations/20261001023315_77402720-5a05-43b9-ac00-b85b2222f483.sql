DROP POLICY IF EXISTS "geofence presence is system only" ON public.geofence_presence;
CREATE POLICY "geofence presence is system only"
  ON public.geofence_presence FOR SELECT TO authenticated
  USING (false);