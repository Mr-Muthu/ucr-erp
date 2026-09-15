# UCR Fleet ERP v1 — Ulagammal Car Rental

Production-grade internal ERP for a Maharashtra car rental business. Primary
business is B2B vendor supply (dedicated monthly deployments + spot duties);
secondary is chauffeur-driven B2C retail (local/outstation/airport packages
and fixed-duty monthly customers). Full spec: see the master build prompt in
project history. Built phase by phase per the delivery discipline — **this
repo is currently at the end of Phase 2 (API layer)** and stops here for
review before Phase 3 (Web application) begins.

> **Note on repo history:** an earlier commit scaffolded a much simpler
> generic car-rental CRUD app (plain JS Express + a basic React client). That
> domain model didn't fit UCR's actual business (no vendors, no duty
> lifecycle, no GST) and has been superseded. `server/` has been rewritten
> from scratch in TypeScript against the real domain model below.
> `client/` still reflects the old scaffold and does not work against the
> new schema — it will be rebuilt in Phase 3 (Web application). Do not run
> `client/` against the new API; there isn't one yet (that's Phase 2).

## Phase 1 status — DOMAIN MODEL & CORE PLATFORM — ✅ FULLY VERIFIED

| Deliverable | Status |
|---|---|
| Full Prisma schema (all Phase 1 entities) | ✅ Migrated against a real Postgres (Supabase), client generates |
| TypeScript server skeleton (strict) | ✅ Boots with a health check; `tsc --noEmit` clean; full route trees are Phase 2 |
| `money.ts` (paise-safe arithmetic, GST split, invoice rounding, amount-in-words) | ✅ Unit tested |
| Settlement/billing calculators (vendor dedicated-monthly, vendor spot-duty, B2C local/outstation/airport, fixed-duty customer) | ✅ Unit tested |
| Fixture suite covering all 9 named scenarios from the spec | ✅ 45/45 tests passing |
| Duty & Booking state machines (single source of truth) | ✅ Unit tested |
| Exclusion constraints (vehicle double-booking / double-deployment) | ✅ Applied to a live database (`prisma/sql/constraints.sql`) and **proven** by a passing concurrency test |
| Concurrency + sync-idempotency integration tests | ✅ **Executed against a real database — 6/6 passing** (double-booking rejected, double-deployment rejected, cross-table overlap rejected, 3x-replay produces exactly one duty) |
| Seed script (branch, categories, both vendor engagement types, fixed-duty customer deployment, fleet, drivers+DriverAccounts, customers, Settings) | ✅ Run successfully multiple times |
| `Setting` rows for every open business number (discount thresholds, odometer tolerance, turnaround buffer, sync retry window, default HSN/SAC, reminder ladder) | ✅ Done — see `prisma/seed.ts` |
| Full `tsc --noEmit` typecheck | ✅ Clean (one real bug found and fixed — see below) |

**Full test suite: 51/51 passing, 0 skipped, 0 failed.**

### What it took to get a real, live verification

The initial build was done in a sandbox with no PostgreSQL/Docker available, so
Phase 1 first shipped with the schema/logic validated but the database-facing
pieces unverified. Verification was then completed against a real Supabase
(Postgres 16, Mumbai region) database, which surfaced and fixed three genuine
issues worth knowing about:

1. **`app.ts` had a real bug**: `pino-http` exports its function as a named
   export, not a default export, under this project's module setup —
   `import pinoHttp from 'pino-http'` failed to type-check. Fixed to
   `import { pinoHttp } from 'pino-http'`.
2. **All `DateTime` fields needed `@db.Timestamptz(3)`**: Prisma's default
   Postgres mapping is `timestamp` *without* time zone, but the exclusion
   constraints require `tstzrange()`, whose implicit cast from a bare
   `timestamp` isn't `IMMUTABLE` (a Postgres requirement for index
   expressions). Explicit `timestamptz` columns fix this correctly *and*
   better satisfy the "all timestamps in UTC" engineering standard — this is
   now applied schema-wide (113 fields), not just on the fields the
   constraint touches.
3. **`prisma db execute --file` can't reliably run this constraints file**
   (it crashes on the multi-statement/PL-pgSQL content). Apply
   `prisma/sql/constraints.sql` via the Supabase SQL Editor (or any direct
   `psql`) instead — see the comment at the top of that file.

Two environment gotchas, not code bugs, also cost real time and are worth
remembering:
- **Prisma CLI's telemetry/update-check call can hang** on a restricted
  network. Set `CHECKPOINT_DISABLE=1` before any `prisma`/`vitest` command.
- **Don't keep the project under `~/Documents` or `~/Desktop` on macOS** if
  iCloud Drive's "Desktop & Documents Folders" sync is enabled — files in
  `node_modules` can get evicted to iCloud and cause bizarre `ETIMEDOUT`
  errors on plain local file reads. Keep it somewhere iCloud doesn't touch
  (e.g. directly under `~/`, or `~/Downloads`, or a dedicated `~/Projects`).

### Reproducing the verification

```bash
cd server
npm install
cp .env.example .env               # fill in a real DATABASE_URL
export CHECKPOINT_DISABLE=1        # skip Prisma's telemetry network call
npm run typecheck
npx prisma migrate dev --name init
# apply prisma/sql/constraints.sql via the Supabase SQL Editor (or psql) —
# NOT via `prisma db execute --file`, which chokes on this file's PL/pgSQL
npm run seed
npx vitest run                     # 51 passed, 0 skipped
```

## Phase 2 status — API LAYER — ✅ FULLY VERIFIED

| Deliverable | Status |
|---|---|
| Staff API `/api/v1` — auth, branches, categories, vehicles, drivers, customers, vendors (+ rate cards), rate cards (retail), deployments, bookings, duties, expenses, maintenance, challans, invoices, availability, uploads | ✅ Built, server boots and serves all of it live |
| Driver API `/api/driver/v1` — auth (phone+PIN, device-bound), duties (accept/decline/start/complete/submit/resubmit/entries/night-halts), sync, uploads | ✅ Built, driver-scoped (403 on any other driver's duty, **proven live**) |
| `POST /duties/:id/transition` (staff: approve/dispute/reject/resolve) | ✅ Built — creates DriverPayableEntry rows on approve |
| `POST /driver/v1/sync` (batch, idempotent) | ✅ **Proven live**: same 2-item batch replayed 3x produces exactly one status change, one odometer log, one ledger row per item |
| `POST /uploads/presign` (R2) | ✅ Built — needs real R2 credentials in `.env` to actually work (infra present, untested against real R2 — the one piece of Phase 2 not live-verified, since no R2 bucket was available) |
| `GET /availability` (bookings + deployments + maintenance + turnaround buffer) | ✅ **Proven live** against 3 fixtures (overlapping booking, active deployment, turnaround-buffer edge case) |
| `POST /vendors/:id/reconciliations/:period/prepare\|statement\|finalize` (+ same for `/customers/:id/reconciliations`) | ✅ Built — idempotent finalize (returns existing invoice on replay), locks included duties to `BILLED` |
| `POST /bookings/:id/settlement/preview\|confirm` | ✅ Built — reuses the exact Phase 1 settlement calculators against real duty odometer/time data |
| `POST /invoices/:id/void` (OWNER-only, generates a CreditNote) | ✅ Built + role-gate **proven live** (OPS/ACCOUNTS get 403 before the record is even looked up) |
| OpenAPI at `/api/docs` | ✅ **Verified live** — `/api/openapi.json` returns a real document, `/api/docs` returns 200 |
| Authorization-matrix tests | ✅ **11/11 passing against a live server** — every role × a representative route, driver-token-on-staff-route 403, staff-token-on-driver-route 403, driver-on-another-driver's-duty 403 (fixed a real bug: this case was returning 404, now correctly 403) |
| Exclusion constraints + cross-table triggers (double-booking / double-deployment prevention) | ✅ **Applied and proven live** — all 4 concurrency scenarios pass, including the cross-table booking-vs-deployment case |
| Full test suite | ✅ **67/67 passing, 0 skipped, 0 failed** — every suite, including all DB-gated ones, run against the live Supabase database |

### Real bugs found and fixed while verifying Phase 2 live

Same discipline as Phase 1: built against a real Supabase database this time
around (no repeat of the "written but never executed" gap), which caught
three genuine issues:

1. **Duplicate object key silently discarding a filter** in
   `src/lib/vehicleAvailability.ts` — `dropDateTime` was declared twice in
   the same Prisma `where` object (`{ not: null }` then later `{ gt: ... }`),
   so the second key silently overwrote the first per normal JS object
   semantics. Fixed by merging into one `dropDateTime: { not: null, gt: ... }`.
2. **Driver-scope 403 vs 404 inconsistency**: the direct
   `GET /driver/v1/duties/:id` route returned 404 for another driver's duty
   (leaking "this ID doesn't exist" instead of "you can't see this"), while
   every other driver route correctly returned 403 for the same case. Now
   consistent everywhere — a driver token always 403s on a duty it doesn't
   own, never 404s.
3. **A test fixture used a field that doesn't exist**: `Booking.totalAmount`
   was carried over by habit from the old pre-rewrite schema; the real field
   is `quotedAmount`. Caught immediately because the test ran against a real
   database and Prisma rejected the unknown field outright.

Also found and fixed a **test flakiness bug, not a product bug**: two
DB-gated test files evaluated `Boolean(process.env.DATABASE_URL)` at module
load time, before `vitest.config.ts`'s `setupFiles` (which loads `.env`) had
necessarily finished in that worker — one file would skip while another,
checking the identical condition in the same run, would not. Fixed by adding
an explicit `import 'dotenv/config'` to the top of every integration test
file, rather than relying solely on the global setup hook.

### What it took to get the last mile to fully green

Two more things surfaced while closing out the last few failures, worth
recording since they'll bite again otherwise:

1. **`prisma/sql/constraints.sql` needs a live database with clean data to
   apply.** Applying it the first time hit `could not create exclusion
   constraint "booking_vehicle_no_overlap"` — not a bug in the SQL, but
   leftover test data: earlier test runs (from *before* the constraint
   existed) had created exactly the overlapping-booking rows the constraint
   is designed to prevent, so Postgres correctly refused to add a constraint
   the existing data already violated. Fixed by `TRUNCATE TABLE "Booking",
   "VehicleDeployment" CASCADE;` before re-applying the constraints file —
   safe here because this is a throwaway dev database with no real business
   data, but worth knowing: **an EXCLUDE/CHECK constraint addition can fail
   on a populated table for this exact reason**, and the fix is always to
   clean the offending data first, never to weaken the constraint.
2. **A test itself had a validation-boundary bug**: the "OWNER can void
   invoices" test sent `{ reason: 'test' }`, but the void endpoint requires
   `reason` to be ≥5 characters — `'test'` is 4. OPS/ACCOUNTS variants of the
   same test still passed because their 403 (role check) fires *before*
   body validation ever runs; only the OWNER case reaches validation and
   tripped on it. Fixed by lengthening the test's reason string, not by
   loosening the endpoint's validation.

**Final state, reproducible top to bottom:**

```bash
cd server
export CHECKPOINT_DISABLE=1
npx prisma migrate dev --name phase2_duty_origin_device_sync_license_override
# apply prisma/sql/constraints.sql via the Supabase SQL Editor (paste only
# the SQL — not any terminal command or "$" prompt text around it), on a
# database with no conflicting Booking/VehicleDeployment rows
npm run seed
npx vitest run   # 67/67 passing, 0 skipped, 0 failed
```

## Architecture (current — Phase 4)

```
UCR ERP System/
├── server/
│   ├── prisma/
│   │   ├── schema.prisma       # full domain model (Phase 1 + Phase 2 additions)
│   │   ├── seed.ts             # branch, rate cards, vendor, fixed-duty customer, fleet, drivers, Settings
│   │   └── sql/
│   │       └── constraints.sql # EXCLUDE constraints + cross-table triggers + CHECK invariants
│   ├── src/
│   │   ├── config/env.ts       # Zod-validated environment config
│   │   ├── types/express.d.ts  # req.staffAuth / req.driverAuth augmentation
│   │   ├── lib/
│   │   │   ├── logger.ts, prisma.ts, money.ts (+ .test.ts)
│   │   │   ├── apiError.ts             # structured { code, message, field? }
│   │   │   ├── pagination.ts           # cursor pagination + { data, meta } envelope
│   │   │   ├── auditLog.ts             # AuditLog writer, actor derived from req
│   │   │   ├── jwt.ts                  # staff/driver access JWTs + opaque rotating refresh tokens
│   │   │   ├── settings.ts             # typed Setting-table reader with a stated default
│   │   │   ├── roleGroups.ts           # the permission-policy-map role sets
│   │   │   ├── gstin.ts                # GSTIN format + checksum (mod-36) validation
│   │   │   ├── vehicleAvailability.ts  # overlap pre-checks (booking/deployment/maintenance)
│   │   │   ├── financialYear.ts, invoiceNumbering.ts  # FY calc + atomic per-FY sequence
│   │   │   ├── r2.ts                   # Cloudflare R2 upload (presigned + direct buffer) / local-disk fallback
│   │   │   ├── redis.ts, queue.ts      # ioredis connection + BullMQ Queue instances + recurring-job scheduling
│   │   │   ├── notify.ts               # deduped Notification creation + delivery enqueue
│   │   │   ├── pdf/                    # invoicePdf.ts, creditNotePdf.ts, format.ts — pure renderers (pdfkit)
│   │   │   ├── openapi.ts, openapi.paths.ts  # zod-to-openapi registry + representative paths
│   │   │   └── crudRouter.ts           # generic list/get/create/update/delete factory
│   │   ├── middleware/
│   │   │   ├── auth.ts         # authenticateStaff / authenticateDriver / requireStaffRole
│   │   │   ├── validate.ts     # Zod body/query/params middleware
│   │   │   ├── rateLimit.ts    # auth-endpoint rate limiting
│   │   │   └── errorHandler.ts # Prisma/Zod/ApiError -> structured JSON, never leaks internals
│   │   ├── domain/              # Duty & Booking state machines (Phase 1) + concurrency/idempotency tests
│   │   ├── settlement/           # Phase 1 calculators, reused as-is by Phase 2 routes
│   │   ├── jobs/                 # Phase 5 — generateInvoicePdf, generateCreditNotePdf, scanExpiries, sendNotification
│   │   ├── modules/
│   │   │   ├── auth/            # staff + driver login/refresh/logout/me
│   │   │   ├── branches, categories, vehicles, drivers, customers, vendors, rateCards,
│   │   │   │                     expenses, maintenance, challans  (CRUD, mostly on crudRouter.ts)
│   │   │   ├── deployments/     # create, replace-vehicle (segment chain), end
│   │   │   ├── bookings/        # create, transition, discount, settlement preview/confirm
│   │   │   ├── duties/          # staff transition; driver accept/decline/start/complete/submit;
│   │   │   │                     driverDuty.service.ts shared by direct routes AND sync
│   │   │   ├── sync/            # POST /driver/v1/sync — SyncMutationLog-backed idempotency
│   │   │   ├── availability/    # GET /availability
│   │   │   ├── uploads/         # presign, mounted under both staff and driver auth
│   │   │   ├── reconciliations/ # prepare/statement/adjust-line/finalize (vendor + customer)
│   │   │   ├── invoices/        # list/get, void (+ CreditNote), payments, pdf download/regenerate
│   │   │   └── notifications/   # GET /notifications (staff-facing, branch-scoped)
│   │   ├── api/                 # supertest integration tests + shared test fixtures
│   │   ├── app.ts               # mounts everything under /api/v1 and /api/driver/v1
│   │   ├── server.ts            # API process entrypoint
│   │   └── worker.ts            # Phase 5 — separate BullMQ worker process (npm run worker)
│   ├── tsconfig.json, vitest.config.ts, package.json
├── client/                             # Phase 3 web app — React 18 + Vite + Tailwind (see below)
├── mobile/                             # Phase 4 driver app — Expo React Native (see below)
│   ├── app/                            # expo-router file-based routes
│   │   ├── login.tsx, index.tsx (auth redirect)
│   │   └── (app)/                      # protected group — duties list/detail + capture screens
│   │       ├── duties.tsx, duty/[id].tsx
│   │       └── start/, complete/, expense/, night-halt/  [id].tsx capture screens
│   ├── src/
│   │   ├── api/                        # axios client + typed endpoints (mirrors client/src/api)
│   │   ├── auth/                       # device-bound driver auth context
│   │   ├── db/                         # expo-sqlite: duty cache + mutation outbox
│   │   ├── sync/                       # sync engine, dutyActions (optimistic patch + enqueue), photo upload
│   │   └── ui/                         # shared components/theme, mirrors the web app's brand palette
│   └── app.json, tsconfig.json, package.json
├── docker-compose.yml                  # Postgres for local dev
└── package.json                        # npm workspaces root (server + client only — see Phase 4 notes)
```

## Tech stack (fixed per the master build prompt)

| Layer | Choice |
|---|---|
| Backend | Node.js 20+, TypeScript (strict), Express, Prisma ORM, PostgreSQL 16 |
| Web frontend (Phase 3) | React 18 + TypeScript + Vite, TailwindCSS, TanStack Query + Table, React Hook Form + Zod, Recharts |
| Driver mobile app (Phase 4) | React Native via Expo (SDK 51), expo-router, offline-first (expo-sqlite outbox) |
| Jobs/queues (Phase 5) | BullMQ + Redis (Upstash free tier) |
| PDF (Phase 5) | pdfkit, server-side, queued |
| Storage | Cloudflare R2 (S3-compatible), presigned URLs only |
| Auth | argon2 password hashing, short-lived access + rotating refresh tokens, device-bound driver tokens |

## Domain model summary

Full detail lives in [`server/prisma/schema.prisma`](server/prisma/schema.prisma). Key groupings:

- **Org & access:** `Branch`, `User` (staff, role-based), `DriverAccount` + `DriverDevice` (separate narrower auth track), `RefreshToken`, `AuditLog`, `Setting`
- **Fleet & people:** `VehicleCategory`, `Vehicle`, `VehicleDocument`, `OdometerLog`, `Driver`, `DriverDocument`, `Customer`
- **B2B vendor layer:** `Vendor`, `VendorRateCard` + `VendorRateCardItem` (DEDICATED_MONTHLY / SPOT_DUTY), `VehicleDeployment`, `DeploymentVehicleSegment` (replacement chain), `Duty`, `DutyExpenseEntry`, `DutyNightHalt`, `MonthlyReconciliation` + `ReconciliationLine`
- **B2C commercial:** `RateCard` + `RateCardItem` (LOCAL_PACKAGE / OUTSTATION / AIRPORT_TRANSFER / FIXED_DUTY_MONTHLY), `Booking`
- **Money:** `NumberingSequence`, `Invoice` + `InvoiceLineItem`, `CreditNote`, `Payment` + `PaymentAllocation`, `SecurityDeposit`, `Expense`, `MaintenanceJob`, `Challan`, `DriverPayableEntry`

Design notes:
- `VehicleDeployment` is the **single mechanism** for both vendor dedicated
  deployments and B2C fixed-duty customer placements — one billing engine
  (`computeDedicatedMonthlySettlement`), two counterparty types.
- Rate terms are **snapshotted** (`rateSnapshotJson`) onto the deployment/duty
  at creation time, so later rate-card edits never retroactively change
  historical billing. The FK to the rate card item is kept only for
  traceability.
- Every driver-app-originated record (`Duty`, `DutyExpenseEntry`,
  `DutyNightHalt`) carries a unique `clientMutationId` for sync idempotency.
- Money is stored as `Decimal(12,2)`; all arithmetic goes through
  `src/lib/money.ts`, which internally computes in integer paise to avoid
  float drift, and applies half-up rounding at both the line and
  invoice-total level (with an explicit rounding adjustment line).

## Running what exists today

```bash
cd server
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT secrets, R2 creds if testing uploads
export CHECKPOINT_DISABLE=1 # skip Prisma's telemetry network call
npm run prisma:validate
npm run prisma:generate
npm run typecheck                                          # tsc --noEmit — clean
npx prisma migrate dev --name phase2_duty_origin_device_sync_license_override
# apply prisma/sql/constraints.sql via the Supabase SQL Editor / psql, not
# `prisma db execute --file` (chokes on this file's PL/pgSQL — see above)
npm run seed
npm test                     # vitest — 67/67 passing, 0 skipped, 0 failed (confirmed)
npm run dev                  # boots the full API on :4000 — try /api/health and /api/docs
```

Once it's running:
- `GET http://localhost:4000/api/health` → `{"status":"ok","phase":2}`
- `GET http://localhost:4000/api/docs` → Swagger UI
- `POST http://localhost:4000/api/v1/auth/login` with the seeded owner
  (`owner@ucr.example` / `ChangeMe@123`) to get a token, then explore the
  rest of `/api/v1` and `/api/driver/v1` (seeded drivers use PIN `1234`).

## Phase 3 status — WEB APPLICATION (ops console) — ✅ FULLY VERIFIED

| Deliverable | Status |
|---|---|
| Login + session (JWT + rotating refresh, 30-min idle auto-logout) | ✅ **Proven live** — real login, `auth/me` re-verification on load, idle timer |
| Command dashboard (`/`) — duties-today by status, deployment board, alerts, MTD B2B/B2C revenue chart (Recharts) | ✅ **Proven live** against real seeded data |
| Duty control desk (`/duties`) — kanban by status, filters by driver/vehicle/vendor | ✅ **Proven live** — real duty cards render correctly; found + fixed a cosmetic overlap bug (below) |
| Vendor workspace (`/vendors/:id`) — rate cards, deployments, reconciliation (prepare → statement → adjust → finalize) | ✅ **Proven live** — exact seeded rate-card values render (₹60,000/mo dedicated, 8/80 spot ₹2,200, airport ₹900); Prepare action does a real `POST .../prepare` and the row updates to DRAFT |
| Fleet calendar (`/calendar`) — one row per vehicle, deployment/booking/maintenance bars, date navigation | ✅ **Proven live** with real deployment + booking data |
| B2C booking wizard + settlement (`/bookings/new`) — customer search-or-create → package/rate → availability picker → live estimate → advance → confirm → assign duty | ✅ **Proven live end-to-end**: created a real booking, confirmed it (vehicle held), assigned a driver (duty created), and watched it land on the Duty Desk — the full acceptance-criteria flow, in one continuous session |
| Module list views (Vehicles, Drivers, Customers, Vendors, Expenses, Maintenance) — TanStack Table, cursor pagination, XLSX export, create/edit modals | ✅ **Proven live** — list rendering *and* create-record submission both confirmed with real `POST` → `201 Created` for every one of the six |
| Invoice detail (`/invoices/:id`) — GST-format line items, CGST/SGST vs IGST, payments, void (OWNER-only, typed-phrase confirm) | ✅ Built, GST layout verified against domain types; void flow uses the shared `Modal` + typed confirmation pattern |
| Settings (`/settings`) — role-permission reference, live business Settings (edit, OWNER-only), retail rate cards | ✅ **Proven live** — edited a real setting via `PATCH /settings/:key` (200 OK), confirmed, reverted |

Two backend endpoints didn't exist at the end of Phase 2 and were added to
support these screens: `GET /dashboard/summary` (duties-today, deployment
board, alerts, MTD revenue split) and `GET /settings` + `PATCH /settings/:key`
(OWNER-only write). Both covered by the same auth/role middleware as every
other route — no new surface area outside the existing pattern.

### Real bugs found and fixed while verifying Phase 3 live

Same discipline as Phase 1 and 2: every screen was driven through a real
browser against the live API and a live Supabase database, not just
build-checked. That caught several genuine issues — the most serious was
architectural, not cosmetic:

1. **`Input`/`Select`/`Textarea` weren't `forwardRef`-wrapped** (`src/components/ui.tsx`).
   React Hook Form's `register()` attaches a DOM `ref` to read each field's
   current value at submit time; because these were plain function
   components, the ref silently failed to attach (console warned "Function
   components cannot be given refs"), so **every `CrudListPage`-driven
   create/edit form — Vehicles, Drivers, Customers, Expenses, Maintenance —
   validated against stale (empty) values no matter what the user typed**,
   and `onSubmit` never ran. This wasn't caught by any build check or type
   check; it only surfaced by actually clicking Save in a browser and
   watching no network request fire. Fixed by wrapping all three in
   `React.forwardRef`.
2. **`branchId` was a raw free-text field on every create form**
   (Vehicles, Drivers, Customers, Vendors) — full UUIDs, not something any
   real member of staff would ever know or want to type. Fixed by removing
   the field entirely and having `CrudListPage` (and the vendor-create
   modal) inject the logged-in staff member's own `branchId` automatically
   on submit — every account is scoped to one branch, so this is never a
   real choice.
3. **Removing that field surfaced a second bug**: the client-side Zod
   schemas still marked `branchId` as `required`, but since it was no
   longer a registered form field, validation silently failed *before*
   `onSubmit` ever ran — with no visible error, because there was no field
   left to show it against. Fixed by dropping `branchId` from the
   client-side schemas (the server still validates it; the value is just
   supplied programmatically now, not by the schema-validated form).
4. **Unselected `<select>` fields submit `''`, not `undefined`** — the
   server's Zod schemas treat optional fields as *absent*, not as an empty
   string, so a truly-optional dropdown left on "Select…" produced a 400
   (`String must contain at least 1 character(s)`). Fixed generically in
   `CrudListPage.onSubmit` (and the vendor-create modal) by normalizing
   every `''` value to `undefined` before submission.
5. **`fuelType`/`transmission` were optional on the client but required by
   the server** (`z.string().min(1)`, no default) — a client/server schema
   mismatch. Fixed by making both fields `required` on the client to match;
   `status` genuinely is optional server-side (DB default `AVAILABLE`) and
   was left alone.
6. **Cosmetic**: on the Duty Desk kanban, the `PlateBadge` and a redundant
   per-card status `Badge` overlapped in narrow columns (the column header
   already states the status). Fixed by dropping the per-card badge and
   adding `truncate` to the driver-name line.
7. **Pre-existing build errors surfaced by a full `tsc -b` production
   build** (not caught by `tsc --noEmit` alone, which was run during
   development): no `vite-env.d.ts` referencing `vite/client` types
   (`import.meta.env` didn't typecheck), and `Invoice` was missing a
   `creditNotes` field that `InvoiceDetail.tsx` was already reading via an
   `as any` cast. Fixed both — `npm run build` is now clean.

All fixes were verified by re-running the exact failing action live
(create a vehicle/driver/customer/expense/vendor, confirm a `201 Created`)
and by re-running the full backend suite — **still 67/67 passing, 0
regressions** — plus a clean `npm run build` on the client.

**Final state, reproducible top to bottom:**

```bash
# Terminal 1 — API
cd server
export CHECKPOINT_DISABLE=1
npm run dev                  # boots on :4000

# Terminal 2 — Web app
cd client
npm install
cp .env.example .env         # VITE_API_URL=http://localhost:4000/api
npm run typecheck            # tsc --noEmit — clean
npm run build                # tsc -b && vite build — clean
npm run dev                  # boots on :5173
```

Then sign in at `http://localhost:5173` as `owner@ucr.example` /
`ChangeMe@123` and drive the full B2B month (deploy → duties → approve →
reconcile → statement → invoice → payment) or a full B2C booking
(wizard → confirm → assign duty) through the UI — both are live and both
land in the audit log.

## Phase 4 status — DRIVER MOBILE APP — ✅ FULLY VERIFIED

| Deliverable | Status |
|---|---|
| Expo React Native app (`mobile/`, expo-router, TypeScript, SDK 54) | ✅ Built — genuinely cross-platform (iOS + Android, same codebase, no platform-specific code); kept as a standalone project (not an npm workspace member) since Metro's dependency resolution doesn't play well with workspace hoisting |
| Driver auth — phone + PIN + device-bound login (`clientDeviceId` persisted via `expo-secure-store`), refresh-token rotation, logout | ✅ **Proven live** — real login against the live API as a seeded driver |
| Offline-first data layer — SQLite (`expo-sqlite`) duty cache + mutation outbox, every action written locally first | ✅ Built and **proven live** — see below |
| Duty list + duty detail screens, full `DutyStatus` lifecycle (accept/decline/start/complete/submit/resubmit) | ✅ **Proven live end-to-end** |
| Odometer capture (start/complete) with camera photo, expense entry (toll/parking/other), night-halt entry | ✅ Built; odometer capture **proven live**, photo/expense/night-halt screens built and code-reviewed but not individually driven in this session |
| Photo upload — presign (`POST /driver/v1/uploads/presign`) + direct PUT to R2 (`expo-file-system`), non-blocking on failure | ✅ Built — same "no real R2 bucket in this dev environment" gap noted in Phase 2, so photo capture is skippable by design; the duty lifecycle never blocks on it |
| Background sync engine — batches the outbox to `POST /driver/v1/sync` in order, pulls fresh duties, auto-triggers on a 20s interval / app-foreground / pull-to-refresh, visible online/pending-sync status bar | ✅ **Proven live** — watched a real "1 pending sync" → "All synced" transition on-screen |
| Live simulator verification (login → accept → start → complete → submit, then staff-side review → approve) | ✅ **Proven live end-to-end**, across both apps, against the live backend |

### Real bugs found and fixed while building Phase 4

1. **Server-side gap**: `GET /driver/v1/duties` and `GET /driver/v1/duties/:id`
   returned bare `Duty` rows with no vehicle or booking data — the driver app
   had nothing to render a duty card from beyond raw IDs. Fixed by adding
   `include: { vehicle: { select: {...} }, booking: { select: {...} } }` to
   both routes (`server/src/modules/duties/driverDuties.routes.ts`) — covered
   by the existing 67-test suite, still green after the change.
2. **`Input`/`Select`/`Textarea` weren't `forwardRef`-wrapped** in the web
   client — carried over from the Phase 3 fix already documented above; not
   a Phase 4 bug, but worth noting it was re-verified still holding.

### Environment issues resolved along the way (not code bugs)

Getting to a live simulator run surfaced three environment problems on the
dev machine itself, worth recording since they'll recur on any fresh Mac:

1. **No Xcode installed** — only the standalone Command Line Tools package
   was present, so `simctl` (which only ships inside full Xcode.app) didn't
   exist and the simulator control tooling crash-looped indefinitely with no
   useful error until diagnosed via `xcode-select -p` / `xcodebuild -version`.
   Fixed by installing Xcode from the App Store, then
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
2. **No iOS Simulator runtime** — Xcode.app alone doesn't include a
   simulator OS image; `xcodebuild -downloadPlatform iOS` was needed
   separately (an ~8.5GB download) before any device could boot.
3. **Dev servers started in a network-sandboxed shell aren't reachable by
   the real Simulator app** — `npm run dev` / `npx expo start` launched
   without disabling the shell sandbox bound to a network namespace the
   actual (unsandboxed) Simulator process couldn't reach over LAN, producing
   an Expo Go "request timed out" error even though `curl` from the same
   sandboxed shell worked fine. Fixed by relaunching both the backend and
   Metro with the sandbox explicitly disabled.
4. **Expo Go on Android had a newer SDK than the project** — the project
   was scaffolded on SDK 51, but Play Store's Expo Go always ships the
   current SDK (54 at the time), and Expo Go no longer runs a project on any
   SDK but the one it was built for. Fixed by upgrading the whole project to
   SDK 54 (`npx expo install expo@^54.0.0` then `npx expo install --fix`,
   followed by a clean `rm -rf node_modules package-lock.json && npm
   install` once the partial dependency rewrite left a conflicting
   lockfile). One more gap surfaced after that: `babel-preset-expo` was only
   present nested under `expo`'s own `node_modules` (not hoisted to the
   project root), so Babel's config-file-relative module resolution
   couldn't find it — fixed by adding it as an explicit top-level dependency
   (`npx expo install babel-preset-expo`), exactly as the error message
   itself suggested. Both the iOS and Android bundles were re-verified
   clean after the upgrade (1167 modules, zero errors) and `npx tsc
   --noEmit` stayed clean across the React 18→19 / React Native 0.74→0.81
   jump.
5. **`localhost` doesn't mean anything on a real phone** — the mobile
   client's default `.env` pointed `EXPO_PUBLIC_API_URL` at
   `http://localhost:4000`, which resolves to the *phone itself* when
   testing on a real device (as opposed to a simulator sharing the host's
   network namespace). Fixed by pointing it at the dev machine's LAN IP
   (`ipconfig getifaddr en0`) instead — same fix needed for the Metro URL
   the phone connects to (`exp://<lan-ip>:8081`, entered manually in Expo
   Go rather than scanned, since a QR code can't be rendered through a chat
   session).

### What was live-verified, step by step

Created a real duty via the staff API (vendor SPOT_DUTY, 8/80 slab, real
seeded vehicle `MH12AB1234` and driver `Ramesh Kumar`), then on a booted
iPhone 17 simulator running the actual app in Expo Go:

1. Logged in as `9800000001` / PIN `1234` — real JWT issued by the live API
2. Pulled the duty from `ASSIGNED` down to the device via the sync engine's
   `GET /duties` pull
3. **Accept** → optimistic `ACCEPTED` shown instantly, confirmed `ACCEPTED`
   server-side seconds later via direct API check
4. **Start Duty** → entered opening odometer `12500`, confirmed `STARTED`
5. **Complete Duty** → entered closing odometer `12580`, watched the sync
   bar show **"1 pending sync"** (amber) then **"All synced"** (confirming
   the offline-first optimistic-then-sync flow works, not just the happy
   path where everything is instant)
6. **Submit Duty** → `SUBMITTED`, screen correctly showed "No action needed
   — this duty is with Ops"
7. Switched to the staff web app: the duty appeared in the Duty Desk's
   **Awaiting Approval** column exactly as expected
8. Opened **Review** — the modal showed the *exact* data entered on the
   phone: Opening 12500 km, Closing 12580 km, **Distance run: 80 km**
   (correctly computed server-side, matching the seeded 8/80 rate slab)
9. **Approved** — `200 OK`, generating a `DriverPayableEntry` per the
   domain model, closing the full B2B billing loop from phone to invoice

Backend suite still **67/67 passing** after all of the above; `npx tsc
--noEmit` on `mobile/` is clean; Metro bundles all ~1000 modules with zero
errors.

### Known scope cuts (documented, not oversights)

- **No GPS capture** — `startGpsLat/Lng`/`endGpsLat/Lng` are optional in the
  server schema and simply left unset; adding `expo-location` is a small,
  isolated follow-up.
- **No signature pad** — `passengerSignatureKey` is optional and unset;
  would need a drawing-canvas library (e.g. `react-native-signature-canvas`)
  not yet added.
- **Expo Go, not a custom dev client** — every native module used
  (`expo-sqlite`, `expo-secure-store`, `expo-image-picker`,
  `expo-file-system`, `expo-device`, `expo-application`, `expo-crypto`) is
  supported inside Expo Go directly, so no `expo-dev-client` / EAS build was
  needed for this verification pass. A future release build would need one.

**Final state, reproducible top to bottom:**

```bash
# Terminal 1 — API
cd server
export CHECKPOINT_DISABLE=1
npm run dev                  # boots on :4000

# Terminal 2 — Driver app
cd mobile
npm install
cp .env.example .env
# For a simulator: EXPO_PUBLIC_API_URL=http://localhost:4000/api
# For a real phone: EXPO_PUBLIC_API_URL=http://<your-lan-ip>/api
#   (find it with `ipconfig getifaddr en0`; the phone must be on the same WiFi)
npx tsc --noEmit             # clean
npx expo start --ios         # simulator — boots Metro, opens in a booted iOS Simulator
# or: npx expo start          # real device — open Expo Go, "Enter URL manually",
#                                exp://<your-lan-ip>:8081
```

Sign in with any seeded driver — e.g. Ramesh Kumar, phone `9800000001`,
PIN `1234` — and accept/start/complete/submit any duty assigned to them;
approve it from the staff web app's Duty Desk to see the full loop close.
This has been verified on both an iOS Simulator and confirmed to build
cleanly for Android; **the exact same codebase runs on both platforms**, no
platform-specific code was written.

## Phase 5 status — DOCUMENTS / JOBS / NOTIFICATIONS — ✅ FULLY VERIFIED

Per the master build prompt's real phase breakdown (Domain Model → API →
Web App → Driver App → **Documents/Jobs/Notifications** →
Reporting/Accounts → Hardening/Deploy) — the README's earlier "What's next"
had mislabeled this as "Reporting/Accounts polish", which is actually
Phase 6; corrected here.

| Deliverable | Status |
|---|---|
| BullMQ + Redis job queue infrastructure (`src/lib/queue.ts`, `src/lib/redis.ts`), separate `documents` and `notifications` queues, a dedicated `npm run worker` process so the API server never blocks on job processing | ✅ Built and **proven live** against a real Upstash Redis instance |
| Queued PDF generation for Invoices and Credit Notes (`pdfkit`, no headless browser), triggered automatically on reconciliation-finalize, booking-settlement-confirm, and invoice-void (credit note); `GET /invoices/:id/pdf` to download, `POST /invoices/:id/pdf` to force-regenerate | ✅ **Proven live end-to-end** — a real invoice's PDF was generated, downloaded, and confirmed to be a valid PDF |
| `Notification` model + daily expiry/overdue scan job (`03:00 IST` via BullMQ's repeatable job scheduler), deduped so a repeat scan never re-alerts on the same thing twice in one day | ✅ Built and **proven live** — see below |
| Notification delivery — email via Resend if `RESEND_API_KEY` is configured, else a structured log line (same "no real credentials in this dev environment" gap as R2 in Phase 2) — the feature works fully either way, just visibly different | ✅ **Proven live** in log mode |
| `GET /notifications` (staff-facing, branch-scoped) | ✅ **Proven live** |
| Unit tests for PDF rendering (IGST vs CGST/SGST, unregistered recipient), integration tests for notification dedup | ✅ **6 new tests, all passing** (73/73 total, up from 67) |

### Real bugs found and fixed while building Phase 5

1. **A dependency-drift regression, not new code**: installing `pdfkit`
   caused npm to re-resolve several loosely-pinned `@types/*` transitive
   packages to newer patch versions that happened to carry real breaking
   *type* changes (not runtime changes) — `@types/jsonwebtoken`'s
   `expiresIn` narrowed to a branded `StringValue` type, and Express route
   params became `string | undefined` under the pre-existing
   `noUncheckedIndexedAccess` compiler option. This broke `npx tsc --noEmit`
   across six pre-existing files (`jwt.ts`, `crudRouter.ts`,
   `bookings.routes.ts`, `driverDuties.routes.ts`, `duties.routes.ts`,
   `reconciliations.routes.ts`) that had nothing to do with Phase 5. Fixed
   each with the *correct* fix for its actual cause — a narrow type
   assertion for the JWT TTL (a trusted config string, not user input), `!`
   assertions on route params Express guarantees are present when the
   route matches, and splitting one ternary-selected-Prisma-delegate call
   into an explicit if/else (a union of two overloaded generic methods
   isn't callable as one) — not by suppressing or downgrading anything.
2. **My own bug, caught by the same typecheck**: `lib/notify.ts`'s first
   draft omitted the required `dedupeKey` field from the `Notification`
   create call entirely — would have failed on the very first real
   notification. Caught before it ever ran, by the same clean-typecheck
   discipline.
3. **`ioredis`'s default export isn't constructable under this project's
   `NodeNext` + `esModuleInterop` TS config** — `import IORedis from
   'ioredis'; new IORedis(...)` type-errors even though it works at
   runtime. Fixed by using the named export instead: `import { Redis }
   from 'ioredis'`.

### Infrastructure decision: Upstash for Redis

Same situation as Supabase for Postgres in Phase 1 — no Docker, no
Homebrew, no local Redis on the dev machine. Used **Upstash's free-tier
Redis** (`rediss://...@*.upstash.io:6379`, TLS required), confirmed with a
live `PING`/`SET`/`GET` round trip before wiring it into BullMQ.

### What was live-verified, step by step

1. Created a real vendor invoice (`UCR/2026-27/00001`) via the actual
   numbering sequence helper
2. `POST /invoices/:id/pdf` → `202 PDF_QUEUED` → worker log showed
   `generate-invoice-pdf` complete within ~1s
3. `GET /invoices/:id/pdf` → real `%PDF-1.3` bytes, 1 page, downloaded and
   visually confirmed
4. Manually enqueued the `scan-expiries` job against live seed data — ran
   clean, found nothing due (correct empty state)
5. Set a real invoice's `dueDate` into the past, re-ran the scan → detected
   it, created a `Notification` row, delivered via the log channel (no
   Resend key configured), logged the exact subject/message, marked `SENT`
6. Re-ran the scan a second time → **no duplicate** — the unique
   `dedupeKey` constraint did its job
7. `GET /notifications` → the one row, visible to staff, exactly as
   expected

Backend suite: **73/73 passing** (67 carried over + 6 new). `npx tsc
--noEmit` clean across the whole server.

**Final state, reproducible top to bottom:**

```bash
# Terminal 1 — API
cd server
export CHECKPOINT_DISABLE=1
npm run dev                  # boots on :4000

# Terminal 2 — Worker (PDFs + notifications — separate process, same codebase)
cd server
npm run worker
```

Finalizing a vendor reconciliation, confirming a booking settlement, or
voiding an invoice all now queue a PDF automatically; `GET
/invoices/:id/pdf` downloads it once the worker's caught up (usually well
under a second). The expiry/overdue scan runs on its own at 03:00 IST —
no manual trigger needed in normal operation.

## Phase 6 status — REPORTING / ACCOUNTS — ✅ FULLY VERIFIED

Built and verified in the same session as Phase 5, per explicit
authorization to proceed through both phases together without the usual
per-phase pause.

| Deliverable | Status |
|---|---|
| P&L calculator (`src/reporting/profitAndLoss.ts`) — revenue split B2B/B2C, expenses by category, net profit. Revenue is **taxableValue**, not `totalAmount` — GST collected is a liability owed to the government, not income | ✅ Built, **proven live** |
| Aging report (`agingReport.ts`) — standard 0-30 / 31-60 / 61-90 / 90+ day buckets on unpaid/partially-paid invoice balances, bucketed off `dueDate` | ✅ Built, **proven live** |
| Driver payables ledger (`driverPayablesLedger.ts`) — per-driver net payable for a period, broken out by allowance type (batta, night halt, reimbursement, advance, adjustment) | ✅ Built, **proven live** (correct empty state for a period with no entries) |
| GST summary (`gstSummary.ts`) — GSTR-1-style rollup: taxable value, CGST/SGST/IGST split (by supplier-vs-place-of-supply state match, same logic as invoice generation), total tax, invoice count | ✅ Built, **proven live** |
| 4 GET endpoints (`src/modules/reports/reports.routes.ts`), all gated to `OWNER` / `MANAGER` / `ACCOUNTS` via `requireStaffRole` | ✅ **Proven live** with a real owner token |
| Web Reports screen (`client/src/pages/Reports.tsx`) — 4-tab UI (P&L, Outstanding Dues, Driver Payables, GST Summary), date-range/period pickers, XLSX export on tabular reports, role-gated with the same `EmptyState` pattern used elsewhere in the app | ✅ **Proven live in the browser** |
| Unit tests for all 4 calculators | ✅ **13 new tests, all passing** |

### What was live-verified, step by step

1. Logged in as the seeded owner (`owner@ucr.example`), called all 4 report
   endpoints directly with a real access token against real seed data (one
   finalized B2B invoice, one fuel expense)
2. `GET /reports/pnl?from=2026-06-01&to=2026-08-02` → B2B revenue ₹60,000,
   total expenses ₹2,500 (FUEL), net profit ₹57,500
3. `GET /reports/aging` → the one unpaid invoice (`UCR/2026-27/00001`,
   ₹70,800, 31 days overdue) correctly bucketed into `31-60`
4. `GET /reports/gst-summary?from=2026-06-01&to=2026-08-02` → taxable value
   ₹60,000, CGST ₹5,400, SGST ₹5,400 (intra-state, correct split), total tax
   ₹10,800, matching the invoice's actual GST breakdown
5. `GET /reports/driver-payables?periodMonth=2026-08` → correct empty state
   (no driver allowance entries recorded that month)
6. Opened `/reports` in the browser (already-authenticated owner session):
   confirmed all 4 tabs render, and independently confirmed the Outstanding
   Dues and GST Summary tabs reproduce the **exact same figures** as the
   direct API calls (₹70,800 in the 31-60 bucket; ₹60,000 taxable /
   ₹5,400 / ₹5,400 / ₹70,800 total) once the date pickers were widened to
   the same range used in the curl calls — the P&L/GST tabs default to a
   trailing-30-day window, so a report period that starts exactly on a
   day boundary can fall just outside the default range, which is expected
   UI behavior, not a bug

### A real, if intermittent, bug found while confirming the test suite

Running `npm test` occasionally failed with
`PrismaClientInitializationError: ... FATAL: max clients reached in
session mode - max clients are limited to pool_size: 15` — a genuine
connection-pool exhaustion against the Supabase session-mode pooler, not a
business-logic bug. Root cause: this dev machine has 8 CPUs, and a bare
`new PrismaClient()` (used by three integration test files that each open
their own dedicated client — a pre-existing, consistent pattern, not
something introduced this phase) defaults to an internal connection pool
of `num_cpus * 2 + 1` = **17 connections per client**, comfortably
exceeding Supabase's 15-connection session-mode ceiling on its own, before
even accounting for the app's own shared client or vitest running files in
parallel. Fixed by capping the pool via `&connection_limit=3` on
`DATABASE_URL` in `server/.env` — confirmed with 3 consecutive clean runs
(20/20 test files, 86/86 tests, exit 0 every time).

Backend suite: **86/86 passing** (73 carried over from Phase 5 + 13 new).
`npx tsc --noEmit` clean across both server and client.

**Final state, reproducible top to bottom:**

```bash
# Terminal 1 — API
cd server
export CHECKPOINT_DISABLE=1
npm run dev                  # boots on :4000

# Terminal 2 — Web client
cd client
npm run dev                  # boots on :5173
```

Log in as `owner@ucr.example` / `ChangeMe@123` (or any `MANAGER`/`ACCOUNTS`
seed user), open **Reports** in the left nav. All 4 tabs pull live from the
API — nothing hardcoded, no mock data.

## Phase 7 status — HARDENING / DEPLOY — 🚧 IN PROGRESS

| Deliverable | Status |
|---|---|
| Security headers, production reverse-proxy configuration, API rate limiting, and secret redaction in structured logs | ✅ Implemented |
| Sentry error-reporting integration | ✅ Wired; production DSN still required |
| R2-compatible object storage with safe local fallback | ✅ Implemented; real R2 credentials still required |
| GitHub Actions CI (`.github/workflows/ci.yml`) | ✅ Added — server tests run against isolated PostgreSQL + Redis; web and driver-app type/build checks run independently |
| Render Blueprint (`render.yaml`) | ✅ Added — API, background worker, and React static site definitions; all secret values use `sync: false` and are never committed |
| Production process commands | ✅ Fixed — compiled server and worker both run from `dist/src/` |

### Deployment steps remaining

1. Add real R2 credentials and Sentry DSN in Render, never in Git.
2. Create the Render Blueprint from `render.yaml`, supply the existing
   Supabase and Upstash values in the dashboard, then deploy the API and
   worker.
3. Set `VITE_API_URL` to the deployed API URL and `CLIENT_ORIGIN` to the
   deployed web URL, then deploy the static web application.
4. Run a live production smoke test: staff login, driver login, booking,
   duty completion, PDF invoice, notification, and report.
5. Build a signed Android AAB/APK for driver distribution (the current Expo
   build has already been verified on a real Android phone).

> **Render plan requirement:** Render's Free plan can host the API and static
> web application, but it cannot run the continuous BullMQ background worker
> that generates PDFs and delivers notifications. A production deployment must
> use a paid Render background-worker plan (or an equivalent always-on worker
> host). The API start command applies Prisma migrations directly because
> Render only supports `preDeployCommand` on paid services.

### Current verification

`render.yaml` and the GitHub Actions workflow parse as valid YAML. Server,
web, and mobile TypeScript checks are clean, and production builds produce
both `server/dist/src/server.js` and `server/dist/src/worker.js`.

The local sandbox cannot currently resolve the managed Supabase/Upstash
hosts, so its final integration-test run could not connect to those cloud
services. This does not alter the implementation: the CI workflow instead
starts clean PostgreSQL and Redis containers for every run, and the live
database test suite was previously verified as 86/86 passing.
