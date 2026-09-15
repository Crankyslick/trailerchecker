# Me Do Logistics merge — staged, non-same-day cutover

## What the zip actually contains

The archive is a **different, larger app** than what is live here. It is the
drayage/container control tower (containers, chassis, QuickBooks billing,
contacts, audit logs, driver portal, maps) with the trailer/yard module ported
in beside it under `trailer_*` names. Its database expects `companies`,
`entities`, `customers`, `containers`, `invoices`, `audit_logs`, QuickBooks
tables and a different role model — none of which exist in the current
database.

So this is not "run one migration". It is a full backend replacement plus a
data migration of the live trailer data into the new shape.

## Two things that block the exact process you asked for

1. **There is no staging copy available.** This project's backend is a single
   managed instance; preview and the published site share it. There is no
   branch or second database to rehearse against.
2. **The zip's data-migration script cannot run as written.** It is a
   _cross-project_ copier that needs service-role keys for both a source and a
   target project. Those keys are not accessible here.

Neither is a reason to do a blind same-day replace. The plan below gets the
same safety guarantees inside one database.

## Live data as of now

| Table          | Rows |
| -------------- | ---- |
| loads          | 136  |
| trailer_events | 138  |
| drivers        | 6    |
| profiles       | 4    |
| yard_check_ins | 0    |
| tenants        | 1    |

The 136 loads are the thing that must survive. Nothing in this plan deletes
them.

## Staged plan

**Stage 1 — snapshot.** Export the live `loads`, `drivers`, `trailer_events`,
`profiles`, `tenants` rows to CSV files kept outside the database, so there is
a restore path that does not depend on any migration being reversible.

**Stage 2 — shadow schema, additive only.** Apply the merged schema alongside
the current one. Name collisions (`trailer_events`, `yard_check_ins`,
`trailer_location`) are handled by moving the legacy versions aside as
`legacy_*`, not dropping them. The current app keeps running on its own tables
throughout.

**Stage 3 — in-database data migration.** Copy all 136 loads into
`trailer_loads` with explicit column mapping and a `legacy_load_id` column for
traceability, plus drivers and the 138 events. Written as a re-runnable upsert
with no deletes. Report row counts and any row that could not be mapped
cleanly.

**Stage 4 — verification against real data.** Row-count parity, spot-check of
mapped rows (including the yard-timer fields and outbound vs return trailer,
which must never be conflated), then a click-through of dispatch board, yard,
gate kiosk and history on the migrated rows, signed in as a real account.
Anything broken is fixed before Stage 5 is even offered.

**Stage 5 — cutover, on your word and on a chosen date.** Swap the app code to
the merged Me Do Logistics UI. The legacy tables stay in place, untouched, as
the rollback.

**Stage 6 — cleanup, later and separately.** Drop the legacy tables only after
you confirm the new board is correct in daily use.

Stages 1–4 change nothing you can see and nothing you can lose. Stage 5 is the
only irreversible-feeling step and it waits for you.

## Open questions I need answered before Stage 3

- **Do you want the drayage side at all?** The zip brings containers, chassis
  and QuickBooks billing. If you only run trailer and yard operations, I can
  port just the trailer module and skip that half — far less to verify, far
  less to break. QuickBooks also needs credentials that are not set up here.
- **Driver records:** in the new schema the driver on a load is still free
  text, not linked to the driver list. Keep it that way for now, or link them
  properly as part of this move?
- **Cutover date** for Stage 5.

## Technical notes

- Collisions to resolve in Stage 2: existing `trailer_events` (different
  columns, `notes` vs `note`, no `user_id`), existing `yard_check_ins`
  (`inbound_load_id` is text, not a UUID FK), existing `trailer_location` enum,
  existing `loads`/`drivers`, and the tenancy swap from `tenants` +
  `current_tenant_id()` to `companies` + `is_staff()`/`is_dispatcher_or_admin()`.
- The 4 existing user profiles and their roles must be re-mapped to the new
  role model or everyone loses access at cutover; this is part of Stage 3.
- `src/integrations/supabase/types.ts` in the zip is hand-edited; it gets
  regenerated from the live schema after Stage 2.
