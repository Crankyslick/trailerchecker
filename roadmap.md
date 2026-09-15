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

# Me Do Logistics — two-product platform (Vendasta ready)

- [x] Rebrand app from "TrailerFlow Pro" to "Me Do Logistics" everywhere
      (landing, auth, sidebar, meta tags, README).
- [x] Product entitlements: tenant_products table (trailer | drayage),
      chosen at signup, editable in Settings, enforced in RLS helpers.
- [x] Separate signup funnels: landing shows two products; /auth?product=…
      grants only that product. Sidebar + routes gated per product.
- [x] Drayage module build phase 1: containers + container_events tables,
      /containers board (LFD countdown, chassis, driver, status), product-gated.
      Billing/invoicing and QuickBooks still a later phase.
- [ ] Vendasta listing readiness: per-product pricing page, demo account,
      activation webhook (/api/public/vendasta) once Vendasta creds exist.

# Reliability hardening (post-audit)

- [x] Automated tests: 50 passing (date parsing, yard aging, product rules,
      anonymous access denied on every tenant table) + Playwright smoke test.
- [x] Durable two-way Sheets sync: sheet_sync_outbox queue (company-scoped RLS),
      processSheetOutbox drain with exponential backoff (1/5/15/60/180m, 6 tries),
      unmatched row = permanent failure, background worker in AppShell,
      Sheet Sync Queue panel in Settings (counts, retry one/all, discard).
      Dispatch, guard check-in and DLM bulk ingest all queue instead of
      fire-and-forget.
- [ ] Supervised 1-2 week pilot before the sheet stops being system of record.
- [x] P1 workflow audit (01-09): - Check-ins go through yard_check_in / yard_check_out database commands:
      explicit company + load references, normalized trailer number,
      idempotency key, partial unique index on active check-ins. - Yard "Return to DC" is a mutation hook: verifies exactly one row
      changed, disables while pending, refreshes the board. - Route-level product/role guards (src/lib/route-guard.ts) on every
      screen; RLS remains the authoritative control. - Yard sites stored in company_sites; dispatch destination and gate
      check-in yard list come from the company default, not hard-coded. - Sheet settings read/written only from trailer_sync_config via
      src/lib/sync-config.ts; legacy sync_config no longer used by the app. - trailer_loads.yard_arrival_at documented as the canonical yard timer.

## Reliability audit P2-01…P2-12 (done)
- [x] P2-01 Query errors surfaced (no silent empty lists) + stale/offline banner; edits and Return to DC blocked while data is unavailable
- [x] P2-02 Realtime channel status tracked, bounded backoff reconnect, last-refresh time in banner
- [x] P2-03 Board query limited to a 14-day active window with server-side filters; history paginated (50/page)
- [x] P2-04 Server-side indexed search across loads (incl. comments/status/archived) and the event timeline, paginated
- [x] P2-05 trailer_loads.completed_at stamped by trigger + backfilled; reports chart completions by actual completion day (America/New_York)
- [x] P2-06 Single YARD_POLICY (24h deadline / 48h critical) shared by board, yard page, ticker and reports
- [x] P2-07 Inline edits commit explicitly (Enter or ✓), blur cancels, saving/saved/failed indicator, dedupe + rollback
- [x] P2-08 Drivers are retired (deactivated), never deleted; retire warns when loads reference them
- [x] P2-09 trailer_events.trailer_role records outbound vs return per transition
- [x] P2-10 trailer_events gains source, event_version, unique command_id; corrections recorded as 'Correction' events
- [x] P2-11 Prettier pass; eslint clean apart from one auto-generated file
- [x] P2-12 bun is the single package manager (packageManager pinned, package-lock.json removed)
