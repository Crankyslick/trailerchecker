# Me Do Logistics merge — staged cutover

Source: uploaded `me-do-logistics_1.zip`.

Constraints: Lovable Cloud runs ONE database (no staging branch), and
service-role keys are not accessible, so the zip's cross-project
`scripts/migrate-trailerflow-data.mjs` cannot run as written. The same
safety was achieved with a shadow-then-flip inside one database.

- [x] Stage 1 — CSV snapshot of loads (136), trailer_events (138), drivers (6),
      profiles (4), tenants (1), user_roles (4) in /mnt/documents/snapshots.
- [x] Stage 2 — additive schema: companies, entities, trailer_loads,
      trailer_clients, trailer_events (new shape), yard_check_ins (new shape),
      trailer_sync_config, plus is_staff/is_dispatcher_or_admin/
      current_user_has_any_role helpers and the guard/billing/driver roles.
      Legacy tables renamed to legacy_trailer_events / legacy_yard_check_ins
      with all rows intact; load triggers and app code repointed at them.
- [x] Stage 3 — data migration: 136/136 loads copied into trailer_loads with
      legacy_load_id traceability, 138/138 events copied, 0 orphans.
- [x] Stage 4 — verification: zero mismatches on trailer numbers, yard timers,
      status and schedule dates; typecheck clean; signed-in click-through of
      dashboard, dispatch board, kiosk and history with no console errors.
- [x] Scope decided: trailer/yard only. Drayage + QuickBooks is a separate,
      later go-live (needs QBO OAuth, second role set, container/chassis flows).
- [x] Drivers linked: trailer_loads.driver_id -> drivers(id), indexed, backfilled
      by exact name match. 10/10 loads with a driver linked, 0 unmatched.
      Free-text `driver` column retained alongside for traceability.
- [x] Stage 5 — CUTOVER DONE (2026-09-13). App reads/writes trailer_loads,
      trailer_events, yard_check_ins. Mirrored triggers added on trailer_loads
      (yard auto-stamp, status/trailer/location events, driver_id auto-link).
      LoadRow/LoadStatus types repointed at trailer_loads/trailer_load_status.
      Verified signed in: 136 loads, 128 archived, 8 active, no console errors.
      sync_config (Sheets settings) intentionally left on the legacy table.
- [ ] Stage 6 — drop legacy tables (loads, legacy_trailer_events,
      legacy_yard_check_ins, sync_config migration) after 1-2 weeks of clean
      daily use. Legacy rows remain untouched as the live fallback.
