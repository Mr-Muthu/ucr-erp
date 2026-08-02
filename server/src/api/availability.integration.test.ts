import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, request, createTestBranch, createTestCategory, createTestVehicle, createStaffUserAndLogin } from './testHelpers.js';
import { prisma } from '../lib/prisma.js';

/**
 * Proves GET /v1/availability correctly accounts for bookings, deployments,
 * AND the configurable turnaround buffer — the Phase 2 acceptance line
 * "availability proven against overlap fixtures including deployments."
 * Requires a live DATABASE_URL; skips itself otherwise.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('GET /v1/availability', () => {
  let branchId: string;
  let categoryId: string;
  let staff: Awaited<ReturnType<typeof createStaffUserAndLogin>>;
  let rateCardItemId: string;
  let customerId: string;

  beforeAll(async () => {
    const branch = await createTestBranch();
    branchId = branch.id;
    const category = await createTestCategory();
    categoryId = category.id;
    staff = await createStaffUserAndLogin('OWNER', branchId);

    const rateCard = await prisma.rateCard.create({ data: { branchId, type: 'LOCAL_PACKAGE', effectiveFrom: new Date('2026-01-01') } });
    const item = await prisma.rateCardItem.create({
      data: { rateCardId: rateCard.id, categoryId, slabLabel: '8/80', slabHours: 8, slabKm: 80, slabBaseRate: 2000 },
    });
    rateCardItemId = item.id;

    const customer = await prisma.customer.create({ data: { branchId, name: 'Availability Test Customer', phone: `9${Date.now()}` } });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('marks a vehicle unavailable when it has a CONFIRMED booking overlapping the window', async () => {
    const busyVehicle = await createTestVehicle(branchId, categoryId);
    const freeVehicle = await createTestVehicle(branchId, categoryId);

    await prisma.booking.create({
      data: {
        branchId,
        customerId,
        bookingNumber: `BK-TEST-${randomUUID()}`,
        type: 'LOCAL_PACKAGE',
        rateCardItemId,
        rateSnapshotJson: {},
        status: 'CONFIRMED',
        pickupLocation: 'Test',
        pickupDateTime: new Date('2026-09-01T09:00:00Z'),
        dropDateTime: new Date('2026-09-01T17:00:00Z'),
        vehicleId: busyVehicle.id,
        quotedAmount: 2000,
      },
    });

    const res = await request(app)
      .get('/api/v1/availability')
      .query({ categoryId, start: '2026-09-01T10:00:00Z', end: '2026-09-01T14:00:00Z' })
      .set('Authorization', `Bearer ${staff.accessToken}`);

    expect(res.status).toBe(200);
    const busyResult = res.body.data.find((r: { vehicleId: string }) => r.vehicleId === busyVehicle.id);
    const freeResult = res.body.data.find((r: { vehicleId: string }) => r.vehicleId === freeVehicle.id);
    expect(busyResult.available).toBe(false);
    expect(busyResult.reason).toMatch(/overlapping booking/i);
    expect(freeResult.available).toBe(true);
  });

  it('marks a vehicle unavailable when it has an active (open-ended) deployment overlapping the window', async () => {
    const deployedVehicle = await createTestVehicle(branchId, categoryId);
    const vendor = await prisma.vendor.create({
      data: { branchId, companyName: 'Availability Test Vendor', gstin: '27AAAAA0000A1Z5', billingAddress: 'x', placeOfSupplyStateCode: '27' },
    });
    const deployment = await prisma.vehicleDeployment.create({
      data: {
        branchId,
        counterpartyType: 'VENDOR',
        vendorId: vendor.id,
        rateSnapshotJson: {},
        startDate: new Date('2026-10-01T00:00:00Z'),
        openingOdometer: 0,
      },
    });
    await prisma.deploymentVehicleSegment.create({
      data: { deploymentId: deployment.id, vehicleId: deployedVehicle.id, startDate: new Date('2026-10-01T00:00:00Z'), openingOdometer: 0 },
    });

    const res = await request(app)
      .get('/api/v1/availability')
      .query({ categoryId, start: '2026-10-05T09:00:00Z', end: '2026-10-05T17:00:00Z' })
      .set('Authorization', `Bearer ${staff.accessToken}`);

    const result = res.body.data.find((r: { vehicleId: string }) => r.vehicleId === deployedVehicle.id);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/deployed/i);
  });

  it('applies the turnaround buffer around an existing booking', async () => {
    const vehicle = await createTestVehicle(branchId, categoryId);
    await prisma.booking.create({
      data: {
        branchId,
        customerId,
        bookingNumber: `BK-TEST-${randomUUID()}`,
        type: 'LOCAL_PACKAGE',
        rateCardItemId,
        rateSnapshotJson: {},
        status: 'CONFIRMED',
        pickupLocation: 'Test',
        pickupDateTime: new Date('2026-11-01T09:00:00Z'),
        dropDateTime: new Date('2026-11-01T12:00:00Z'), // ends at 12:00
        vehicleId: vehicle.id,
        quotedAmount: 2000,
      },
    });

    // Query window starts at 12:30 — only 30 min after drop-off, inside the
    // default 60-minute turnaround buffer, so this vehicle should still show
    // as unavailable.
    const res = await request(app)
      .get('/api/v1/availability')
      .query({ categoryId, start: '2026-11-01T12:30:00Z', end: '2026-11-01T18:00:00Z' })
      .set('Authorization', `Bearer ${staff.accessToken}`);

    const result = res.body.data.find((r: { vehicleId: string }) => r.vehicleId === vehicle.id);
    expect(result.available).toBe(false);
    expect(res.body.meta.bufferMinutes).toBe(60);
  });
});
