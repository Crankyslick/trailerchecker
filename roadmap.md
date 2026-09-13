# Me Do Logistics merge — staged cutover

Source: uploaded `me-do-logistics_1.zip` (merged drayage + trailer/yard app,
`supabase/migrations/20260909120000_trailer_ops_module.sql`,
`scripts/migrate-trailerflow-data.mjs`).

Constraints discovered:
- This project runs on Lovable Cloud: ONE database instance serves preview and
  production. There is no staging/branch copy available, and service-role keys
  are not accessible, so `scripts/migrate-trailerflow-data.mjs` (cross-project,
  needs SOURCE/TARGET service-role keys) cannot run as written.
- Live data today: 136 loads, 6 drivers, 138 trailer_events, 0 yard_check_ins,
  4 profiles, 1 tenant.

Staged plan (shadow-then-flip, all inside one DB, non-destructive):

1. [ ] Stage 1 — additive schema: apply the merged drayage + trailer-ops schema
       as NEW tables (`companies`, `entities`, `trailer_loads`, `trailer_clients`,
       `trailer_sync_config`, drayage tables...). Existing `loads`, `drivers`,
       `tenants`, `trailer_events`, `yard_check_ins` untouched.
2. [ ] Stage 2 — in-database data migration: copy the 136 live `loads` rows (plus
       drivers, events) into `trailer_loads` with column mapping + a
       `legacy_load_id` column for traceability. Re-runnable upsert, no deletes.
3. [ ] Stage 3 — verification on real data: row-count parity, spot-check mapped
       rows, boot the app and click through dispatch board / yard / kiosk /
       history against the migrated rows.
4. [ ] Stage 4 — cutover (requires explicit user go-ahead): swap the app code to
       the merged Me Do Logistics UI reading `trailer_loads`. Old tables kept
       read-only as rollback for at least one cycle.
5. [ ] Stage 5 — cleanup (later, separate approval): drop legacy `loads`/`tenants`
       only after the user confirms the new board is correct.

Blocked / needs user decision:
- [ ] Go-ahead for Stage 4 cutover date (not same-day).
- [ ] QuickBooks Online credentials for the drayage vertical (not configured here).
