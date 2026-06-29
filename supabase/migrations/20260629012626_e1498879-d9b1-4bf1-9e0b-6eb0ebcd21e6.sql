
-- loads: drop permissive write/update/delete policies
DROP POLICY IF EXISTS "Loads are publicly deletable" ON public.loads;
DROP POLICY IF EXISTS "Loads are publicly updatable" ON public.loads;
DROP POLICY IF EXISTS "Loads are publicly writable" ON public.loads;

CREATE POLICY "Authenticated users can insert loads" ON public.loads
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update loads" ON public.loads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete loads" ON public.loads
  FOR DELETE TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.loads FROM anon;
GRANT INSERT, UPDATE, DELETE ON public.loads TO authenticated;

-- trailer_events: drop permissive insert policy
DROP POLICY IF EXISTS "Events are publicly writable" ON public.trailer_events;

CREATE POLICY "Authenticated users can insert trailer events" ON public.trailer_events
  FOR INSERT TO authenticated WITH CHECK (true);

REVOKE INSERT ON public.trailer_events FROM anon;
GRANT INSERT ON public.trailer_events TO authenticated;
