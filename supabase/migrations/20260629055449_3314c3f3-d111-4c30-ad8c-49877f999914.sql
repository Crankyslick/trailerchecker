
-- Restore public write access (internal tool, no auth) per project memory
DROP POLICY IF EXISTS "Authenticated users can insert loads" ON public.loads;
DROP POLICY IF EXISTS "Authenticated users can update loads" ON public.loads;
DROP POLICY IF EXISTS "Authenticated users can delete loads" ON public.loads;
DROP POLICY IF EXISTS "Authenticated users can insert trailer events" ON public.trailer_events;

CREATE POLICY "Loads are publicly writable" ON public.loads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Loads are publicly updatable" ON public.loads FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Loads are publicly deletable" ON public.loads FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Events are publicly writable" ON public.trailer_events FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT INSERT, UPDATE, DELETE ON public.loads TO anon, authenticated;
GRANT INSERT ON public.trailer_events TO anon, authenticated;

-- Add Target identifiers
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS target_load_id text,
  ADD COLUMN IF NOT EXISTS trip_id text,
  ADD COLUMN IF NOT EXISTS pro_number text;

-- Yard check-ins table (24-hour ticker)
CREATE TABLE IF NOT EXISTS public.yard_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_number text NOT NULL,
  inbound_load_id text,
  arrival_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yard_check_ins TO anon, authenticated;
GRANT ALL ON public.yard_check_ins TO service_role;
ALTER TABLE public.yard_check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yard_check_ins public read" ON public.yard_check_ins FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "yard_check_ins public insert" ON public.yard_check_ins FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "yard_check_ins public update" ON public.yard_check_ins FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "yard_check_ins public delete" ON public.yard_check_ins FOR DELETE TO anon, authenticated USING (true);

-- Sync config (single-row table for showing "Last sync" indicator)
CREATE TABLE IF NOT EXISTS public.sync_config (
  id int PRIMARY KEY DEFAULT 1,
  endpoint_url text,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.sync_config TO anon, authenticated;
GRANT ALL ON public.sync_config TO service_role;
ALTER TABLE public.sync_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_config public read" ON public.sync_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sync_config public write" ON public.sync_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
INSERT INTO public.sync_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Wipe existing seeded loads and replace with the 3 real schedules
DELETE FROM public.trailer_events;
DELETE FROM public.loads;

INSERT INTO public.loads (schedule_id, target_load_id, trip_id, pro_number, origin_id, origin_name, str_number, str_name, cutoff_date, cutoff_time, schedule_date)
VALUES
  ('76608458','75483812','5261691', NULL, '589','Chambersburg Pa Dc','2247','Riverdale Rt 23 And Falston','2026-06-28','22:38','2026-06-28'),
  ('76609100','75483912','5261741','318496','589','Chambersburg Pa Dc','1886','Jersey City','2026-06-28','22:35','2026-06-28'),
  ('76609104','75429019','5254858','231613','589','Chambersburg Pa Dc','1886','Jersey City','2026-06-28','22:35','2026-06-28');
