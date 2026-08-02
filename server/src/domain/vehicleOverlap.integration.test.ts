import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Concurrency-safety proof for NON-NEGOTIABLE STANDARD #9: a vehicle cannot
 * be double-booked or double-deployed. This exercises the raw Postgres
 * EXCLUDE constraints + cross-table triggers in prisma/sql/constraints.sql.
 *
 * Requires a live DATABASE_URL with that SQL already applied (see the
 * instructions at the top of that file) — this sandbox has no Postgres
 * available, so the suite skips itself rather than reporting a false pass.
 * Run for real with: DATABASE_URL=... npx vitest run vehicleOverlap
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('vehicle double-booking / double-deployment prevention', () => {
  // Imported lazily so this file doesn't fail to load in environments
  // without a generated Prisma client pointed at a real database.
  let prisma: import('@prisma/client').PrismaClient;
  let branchId: string;
  let categoryId: string;
  let vehicleId: string;
  let customerId: string;
  let rateCardItemId: string;
  let vendorId: string;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();

    const branch = await prisma.branch.create({
      data: { name: 'Test Branch', code: `TB-${randomUUID().slice(0, 8)}`, stateCode: '27' },
    });
    branchId = branch.id;

    const category = await prisma.vehicleCategory.create({
      data: { name: `Sedan-${randomUUID().slice(0, 8)}`, code: `SED-${randomUUID().slice(0, 8)}`, defaultSeatingCapacity: 4 },
    });
    categoryId = category.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        branchId,
        categoryId,
        registrationNumber: `MH12AB${Math.floor(Math.random() * 9000 + 1000)}`,
        make: 'Toyota',
        model: 'Etios',
        year: 2022,
        fuelType: 'PETROL',
        transmission: 'MANUAL',
        seats: 4,
      },
    });
    vehicleId = vehicle.id;

    const customer = await prisma.customer.create({
      data: { branchId, name: 'Test Customer', phone: `9${Math.floor(Math.random() * 900000000 + 100000000)}` },
    });
    customerId = customer.id;

    const rateCard = await prisma.rateCard.create({
      data: { branchId, type: 'LOCAL_PACKAGE', effectiveFrom: new Date('2026-01-01') },
    });
    const rateCardItem = await prisma.rateCardItem.create({
      data: { rateCardId: rateCard.id, categoryId, slabLabel: '8/80', slabHours: 8, slabKm: 80, slabBaseRate: 2000 },
    });
    rateCardItemId = rateCardItem.id;

    const vendor = await prisma.vendor.create({
      data: {
        branchId,
        companyName: 'Test Vendor Pvt Ltd',
        gstin: '27AAAAA0000A1Z5',
        billingAddress: 'Test address',
        placeOfSupplyStateCode: '27',
      },
    });
    vendorId = vendor.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a second CONFIRMED booking that overlaps an existing one for the same vehicle', async () => {
    await prisma.booking.create({
      data: {
        branchId,
        bookingNumber: `BK-${randomUUID()}`,
        customerId,
        type: 'LOCAL_PACKAGE',
        rateCardItemId,
        rateSnapshotJson: {},
        status: 'CONFIRMED',
        pickupLocation: 'Pune',
        pickupDateTime: new Date('2026-08-01T09:00:00Z'),
        dropDateTime: new Date('2026-08-01T17:00:00Z'),
        vehicleId,
      },
    });

    await expect(
      prisma.booking.create({
        data: {
          branchId,
          bookingNumber: `BK-${randomUUID()}`,
          customerId,
          type: 'LOCAL_PACKAGE',
          rateCardItemId,
          rateSnapshotJson: {},
          status: 'CONFIRMED',
          pickupLocation: 'Pune',
          pickupDateTime: new Date('2026-08-01T12:00:00Z'), // overlaps the 09:00-17:00 window above
          dropDateTime: new Date('2026-08-01T20:00:00Z'),
          vehicleId,
        },
      })
    ).rejects.toThrow();
  });

  it('allows a second booking for the same vehicle once the first window has passed', async () => {
    await expect(
      prisma.booking.create({
        data: {
          branchId,
          bookingNumber: `BK-${randomUUID()}`,
          customerId,
          type: 'LOCAL_PACKAGE',
          rateCardItemId,
          rateSnapshotJson: {},
          status: 'CONFIRMED',
          pickupLocation: 'Pune',
          pickupDateTime: new Date('2026-08-02T09:00:00Z'),
          dropDateTime: new Date('2026-08-02T17:00:00Z'),
          vehicleId,
        },
      })
    ).resolves.toBeDefined();
  });

  it('rejects a deployment segment that overlaps an existing segment for the same vehicle', async () => {
    const deployment = await prisma.vehicleDeployment.create({
      data: {
        branchId,
        counterpartyType: 'VENDOR',
        vendorId,
        rateSnapshotJson: {},
        startDate: new Date('2026-09-01T00:00:00Z'),
        openingOdometer: 0,
      },
    });

    await prisma.deploymentVehicleSegment.create({
      data: {
        deploymentId: deployment.id,
        vehicleId,
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2026-09-15T00:00:00Z'),
        openingOdometer: 0,
      },
    });

    await expect(
      prisma.deploymentVehicleSegment.create({
        data: {
          deploymentId: deployment.id,
          vehicleId,
          startDate: new Date('2026-09-10T00:00:00Z'), // overlaps 09-01..09-15
          endDate: null,
          openingOdometer: 500,
        },
      })
    ).rejects.toThrow();
  });

  it('rejects a booking that overlaps an active deployment segment for the same vehicle (cross-table)', async () => {
    const deployment = await prisma.vehicleDeployment.create({
      data: {
        branchId,
        counterpartyType: 'VENDOR',
        vendorId,
        rateSnapshotJson: {},
        startDate: new Date('2026-10-01T00:00:00Z'),
        openingOdometer: 0,
      },
    });
    await prisma.deploymentVehicleSegment.create({
      data: {
        deploymentId: deployment.id,
        vehicleId,
        startDate: new Date('2026-10-01T00:00:00Z'),
        endDate: null, // ongoing
        openingOdometer: 0,
      },
    });

    await expect(
      prisma.booking.create({
        data: {
          branchId,
          bookingNumber: `BK-${randomUUID()}`,
          customerId,
          type: 'LOCAL_PACKAGE',
          rateCardItemId,
          rateSnapshotJson: {},
          status: 'CONFIRMED',
          pickupLocation: 'Pune',
          pickupDateTime: new Date('2026-10-05T09:00:00Z'), // vehicle is deployed to a vendor at this time
          dropDateTime: new Date('2026-10-05T17:00:00Z'),
          vehicleId,
        },
      })
    ).rejects.toThrow();
  });
});
