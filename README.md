# Me Do Logistics

Build a production-ready web application called:

VTCD Dispatch & Trailer Management System

The application is for dispatchers managing Target trailer operations from Chambersburg PA DC.

The application must feel like a modern Transportation Management System (TMS), not like a spreadsheet.

Use a clean professional UI similar to Motive, Samsara, or Uber Freight.

Use React + TypeScript + Tailwind.

The app must be mobile friendly.

The backend should initially use Google Sheets but be designed so it can easily migrate to Supabase later.

==================================================

DATA SOURCE

==================================================

Google Sheet contains:

Schedule ID

CutOff Date

CutOff Day

Driver

Trailer #

Origin Id

Origin Name

STR #

STR Name

CutOff Time

Arrival Date

Arrival Day

Arrival Time

Delivery Sequence

Schedule Date

Unload Date

Unload Day

Unload Time

Unload Type

Has Sweep

STR TRL #

STR TRL Location

Comments

Never overwrite the original outbound trailer.

The outbound trailer and return trailer are two different trailers.

==================================================

BUSINESS RULE

==================================================

Each load has TWO trailers.

Trailer # = Outbound Trailer

This trailer leaves Chambersburg DC.

It is already known when the load is assigned.

---

STR TRL #

This is the trailer picked up at the store.

This trailer is UNKNOWN until the driver arrives at the store.

Dispatcher manually enters it after receiving it from the driver.

==================================================

IMPORTANT

==================================================

Only the STORE RETURN TRAILER should be tracked for yard duration.

The outbound trailer should NEVER have a yard timer.

The yard timer begins ONLY after:

Return Trailer Location becomes "Yard"

At that exact moment the application automatically records:

Yard Arrival Date

Yard Arrival Time

Yard Start Timestamp

No manual time entry.

==================================================

YARD RULES

==================================================

Trailer at yard less than 24 hours

Green

Trailer at yard between 24 and 48 hours

Yellow

Trailer over 48 hours

Red

Dashboard must display

Under 24 Hours

24-48 Hours

Over 48 Hours

==================================================

HOME DASHBOARD

==================================================

Display KPI Cards

Today's Loads

Active Loads

Completed Loads

Drivers Assigned

Trailers At Yard

Trailers Returning

24-48 Hour Trailers

48+ Hour Trailers

Average Yard Time

==================================================

LIVE LOAD BOARD

==================================================

Columns

Schedule ID

Store Number

Store Name

Driver

Outbound Trailer

Return Trailer

Trailer Location

Sweep

Delivery Sequence

Status

Comments

Allow inline editing for

Driver

Return Trailer

Trailer Location

Comments

==================================================

STATUS WORKFLOW

==================================================

Statuses

Assigned

Heading To DC

Loaded

En Route

Delivered

Picked Up Return Trailer

Returning

At Yard

Returned To DC

Completed

Delayed

Exception

Each status change should automatically update timestamps.

==================================================

TRAILER LOCATION

==================================================

DC

Store

Returning

Yard

Returned To DC

==================================================

NO MANUAL TIMERS

==================================================

If Trailer Location changes to Yard

Automatically save

Arrival Date

Arrival Time

Start counting duration

Display

Hours

Minutes

Current Color

==================================================

YARD INVENTORY PAGE

==================================================

Display only trailers currently located at Yard.

Columns

Return Trailer

Store

Driver

Arrival Time

Time In Yard

Priority

Assigned Next Load

Buttons

Assign

Return To DC

==================================================

TRAILER SEARCH

==================================================

Search by

Trailer Number

Schedule ID

Driver

Store

Display full trailer history.

==================================================

TRAILER HISTORY

==================================================

Every trailer should have an audit timeline.

Example

Delivered to Store

Picked Up From Store

Returning

Arrived Yard

Waiting

Assigned To DC

Returned To DC

Completed

Show date and timestamp for every event.

==================================================

STORE BOARD

==================================================

Cards

1886 Jersey City

2247 Riverdale Rt 23 and Falston

3408 Wall Township

Each card displays

Today's Loads

Assigned Driver

Return Trailer

Current Status

==================================================

DRIVER BOARD

==================================================

Driver

Current Load

Store

Current Trailer

Status

Last Update

==================================================

AUTOMATIC ALERTS

==================================================

No Driver Assigned

Missing Return Trailer

Trailer at Yard over 24 Hours

Trailer at Yard over 48 Hours

Delayed Load

Missing Trailer Number

==================================================

FILTERS

==================================================

Today

Tomorrow

Driver

Store

Sweep

Backhaul

Completed

Returning

At Yard

==================================================

SEARCH

==================================================

Global search.

Can search

Schedule ID

Trailer

Driver

Store

==================================================

REPORTING

==================================================

Dashboard charts

Loads per Store

Loads Completed

Trailers at Yard

Trailer Aging

Driver Workload

==================================================

GOAL

==================================================

The application should replace manual dispatch spreadsheets.

Dispatchers should update operations with one or two clicks.

Operations Manager should be able to open the dashboard and immediately know

Where every driver is

Which trailer is at each store

Which return trailers are sitting in the yard

How long every return trailer has been sitting

Which trailers require immediate return to the DC

The application should look like enterprise logistics software used by professional trucking companies.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://trailerchecker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/590caa48-69e5-493c-9a2f-88efefd52aed).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

### Package manager policy

**Bun is the only supported package manager.** It is pinned in `package.json`
(`"packageManager": "bun@1.3.3"`) and `bun.lock` is the single source of truth.
Do not add `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml` — two
independently generated lockfiles cause dependency drift between contributors
and CI. Transitive security pins live under `overrides` in `package.json`
(currently `js-yaml ^4.3.2`, `nanoid ^3.3.19`).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install --frozen-lockfile   # CI
bun install                     # local, may update bun.lock
bun run dev
```

Checks run in CI: `bun run lint`, `bunx tsgo --noEmit`, `bun run test`,
`bun run build`.

### Health check

`GET /api/public/health` returns `{"status":"ok"}` with HTTP 200 when the
backend is reachable, and HTTP 503 with a reason when it is not. Point uptime
monitoring at it.

### Environment

`.env` holds only publishable client configuration managed by Lovable Cloud.
Privileged keys (service role, database password) are never stored in the
repository; they are injected as deployment secrets at runtime.
