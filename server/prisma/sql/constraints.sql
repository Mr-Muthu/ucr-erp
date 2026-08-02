-- ─────────────────────────────────────────────────────────────────
-- UCR Fleet ERP — hand-authored constraints Prisma cannot express.
--
-- HOW TO APPLY: once a real Postgres is available, run
--   npx prisma migrate dev --name init
-- to generate prisma/migrations/<timestamp>_init/migration.sql from the
-- current schema.prisma, THEN append the contents of this file to the end
-- of that generated migration.sql (before running it against production).
-- Every subsequent migration is additive per the "migrations are
-- forward-only" rule — do not edit an already-applied migration.
--
-- This file is intentionally NOT wired into `prisma migrate dev` directly
-- because Prisma has no first-class support for EXCLUDE constraints or
-- cross-table triggers; keeping it as reviewable raw SQL is the honest
-- alternative to silently generating something Prisma can't diff against.
-- ─────────────────────────────────────────────────────────────────

-- Declared in schema.prisma via `extensions = [btree_gist]`, but included
-- here defensively in case the target DB role lacks rights for Prisma to
-- create it automatically during migrate.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ───────────────── 1. Vehicle cannot be double-booked (Booking self-overlap) ─────────────────
-- Only rows that actually commit the vehicle participate: vehicleId and
-- dropDateTime must be set, and status must be one of the "holds the
-- vehicle" statuses. INQUIRY/QUOTED bookings don't hold the vehicle yet.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_vehicle_no_overlap;
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_vehicle_no_overlap
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("pickupDateTime", "dropDateTime", '[]') WITH &&
  )
  WHERE (
    "vehicleId" IS NOT NULL
    AND "dropDateTime" IS NOT NULL
    AND status IN ('CONFIRMED', 'DUTY_ASSIGNED', 'IN_PROGRESS')
  );

-- ───────────────── 2. Vehicle cannot be double-deployed (segment self-overlap) ─────────────────
-- endDate NULL means "ongoing" — treated as unbounded (infinity) so an
-- open segment still correctly excludes any future overlapping segment.
ALTER TABLE "DeploymentVehicleSegment" DROP CONSTRAINT IF EXISTS segment_vehicle_no_overlap;
ALTER TABLE "DeploymentVehicleSegment"
  ADD CONSTRAINT segment_vehicle_no_overlap
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("startDate", COALESCE("endDate", 'infinity'), '[]') WITH &&
  );

-- ───────────────── 3. Cross-table: a booking cannot overlap an active deployment segment ─────────────────
-- Native EXCLUDE constraints can't span two tables, so this direction is
-- enforced with a trigger that queries the other table.
CREATE OR REPLACE FUNCTION check_booking_vs_deployment_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW."vehicleId" IS NOT NULL
     AND NEW."dropDateTime" IS NOT NULL
     AND NEW.status IN ('CONFIRMED', 'DUTY_ASSIGNED', 'IN_PROGRESS') THEN
    IF EXISTS (
      SELECT 1 FROM "DeploymentVehicleSegment" s
      WHERE s."vehicleId" = NEW."vehicleId"
        AND tstzrange(s."startDate", COALESCE(s."endDate", 'infinity'), '[]')
            && tstzrange(NEW."pickupDateTime", NEW."dropDateTime", '[]')
    ) THEN
      RAISE EXCEPTION 'Vehicle % is already deployed during this booking window', NEW."vehicleId"
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_vs_deployment ON "Booking";
CREATE TRIGGER trg_booking_vs_deployment
  BEFORE INSERT OR UPDATE ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION check_booking_vs_deployment_overlap();

-- ───────────────── 4. Cross-table: a deployment segment cannot overlap an active booking ─────────────────
CREATE OR REPLACE FUNCTION check_deployment_vs_booking_overlap() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Booking" b
    WHERE b."vehicleId" = NEW."vehicleId"
      AND b."dropDateTime" IS NOT NULL
      AND b.status IN ('CONFIRMED', 'DUTY_ASSIGNED', 'IN_PROGRESS')
      AND tstzrange(b."pickupDateTime", b."dropDateTime", '[]')
          && tstzrange(NEW."startDate", COALESCE(NEW."endDate", 'infinity'), '[]')
  ) THEN
    RAISE EXCEPTION 'Vehicle % already has an active booking during this deployment segment window', NEW."vehicleId"
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deployment_vs_booking ON "DeploymentVehicleSegment";
CREATE TRIGGER trg_deployment_vs_booking
  BEFORE INSERT OR UPDATE ON "DeploymentVehicleSegment"
  FOR EACH ROW EXECUTE FUNCTION check_deployment_vs_booking_overlap();

-- ───────────────── 5. Polymorphic "exactly one counterparty" invariants ─────────────────
ALTER TABLE "VehicleDeployment" DROP CONSTRAINT IF EXISTS deployment_counterparty_exclusive;
ALTER TABLE "VehicleDeployment"
  ADD CONSTRAINT deployment_counterparty_exclusive CHECK (
    ("counterpartyType" = 'VENDOR' AND "vendorId" IS NOT NULL AND "customerId" IS NULL)
    OR ("counterpartyType" = 'CUSTOMER' AND "customerId" IS NOT NULL AND "vendorId" IS NULL)
  );

ALTER TABLE "MonthlyReconciliation" DROP CONSTRAINT IF EXISTS reconciliation_counterparty_exclusive;
ALTER TABLE "MonthlyReconciliation"
  ADD CONSTRAINT reconciliation_counterparty_exclusive CHECK (
    ("counterpartyType" = 'VENDOR' AND "vendorId" IS NOT NULL AND "customerId" IS NULL)
    OR ("counterpartyType" = 'CUSTOMER' AND "customerId" IS NOT NULL AND "vendorId" IS NULL)
  );

-- ───────────────── 6. AuditLog "exactly one actor" invariant ─────────────────
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS auditlog_actor_exclusive;
ALTER TABLE "AuditLog"
  ADD CONSTRAINT auditlog_actor_exclusive CHECK (
    ("actorType" = 'STAFF' AND "staffUserId" IS NOT NULL AND "driverAccountId" IS NULL)
    OR ("actorType" = 'DRIVER' AND "driverAccountId" IS NOT NULL AND "staffUserId" IS NULL)
    OR ("actorType" = 'SYSTEM' AND "staffUserId" IS NULL AND "driverAccountId" IS NULL)
  );
