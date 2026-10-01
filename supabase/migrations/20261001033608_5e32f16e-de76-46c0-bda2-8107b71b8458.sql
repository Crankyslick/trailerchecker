ALTER TABLE public.company_sites
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer,
  ADD COLUMN IF NOT EXISTS gate_hours text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS dispatch_phone text,
  ADD COLUMN IF NOT EXISTS mc_number text,
  ADD COLUMN IF NOT EXISTS dot_number text;