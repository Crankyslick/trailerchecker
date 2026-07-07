ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS alert_status text,
  ADD COLUMN IF NOT EXISTS total_distance text,
  ADD COLUMN IF NOT EXISTS expected_pickup timestamptz,
  ADD COLUMN IF NOT EXISTS expected_delivery timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_defect_reason text,
  ADD COLUMN IF NOT EXISTS delivery_defect_reason text,
  ADD COLUMN IF NOT EXISTS carrier_comments text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS trl_location_code text,
  ADD COLUMN IF NOT EXISTS str_trl_location text,
  ADD COLUMN IF NOT EXISTS invoiced boolean;