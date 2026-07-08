
ALTER TABLE public.sync_config
  ADD COLUMN IF NOT EXISTS spreadsheet_id text,
  ADD COLUMN IF NOT EXISTS sheet_name text DEFAULT 'Sheet1';

-- Seed default row if missing
INSERT INTO public.sync_config (id, sheet_name)
VALUES (1, 'Sheet1')
ON CONFLICT (id) DO NOTHING;
