import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Proves the DB-level guarantee the Phase 2 `/driver/v1/sync` endpoint will
 * rely on: every app-originated record carries a client-generated UUID
 * (`clientMutationId`, @unique on Duty), and the server upserts on it — so
 * the same duty payload posted 3x from a flaky connection produces exactly
 * one row, never three. The HTTP-level sync endpoint itself is Phase 2
 * scope; this test proves the schema invariant it will depend on.
 *
 * Requires a live DATABASE_URL — skips itself in this sandbox (no Postgres
 * available). Run for real with: DATABASE_URL=... npx vitest run dutyIdempotency
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('duty sync idempotency (clientMutationId upsert)', () => {
  let prisma: import('@prisma/client').PrismaClient;
  let branchId: string;
  let driverId: string;
  let vehicleId: string;

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

    const vehicle = await prisma.vehicle.create({
      data: {
        branchId,
        categoryId: category.id,
        registrationNumber: `MH12CD${Math.floor(Math.random() * 9000 + 1000)}`,
        make: 'Maruti',
        model: 'Dzire',
        year: 2023,
        fuelType: 'PETROL',
        transmission: 'MANUAL',
        seats: 4,
      },
    });
    vehicleId = vehicle.id;

    const driver = await prisma.driver.create({
      data: {
        branchId,
        name: 'Test Driver',
        phone: `9${Math.floor(Math.random() * 900000000 + 100000000)}`,
        licenseNumber: `DL-${randomUUID().slice(0, 8)}`,
      },
    });
    driverId = driver.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly one duty when the same clientMutationId is synced 3 times', async () => {
    const clientMutationId = randomUUID();
    const scheduledStart = new Date('2026-08-05T09:00:00Z');

    const upsertPayload = {
      where: { clientMutationId },
      create: {
        branchId,
        origin: 'DEPLOYMENT' as const,
        driverId,
        vehicleId,
        scheduledStart,
        clientMutationId,
        status: 'STARTED' as const,
        openingOdometer: 15_000,
      },
      update: {}, // idempotent: a retry of the same create is a no-op
    };

    // Simulate the mobile app retrying the same offline-queued mutation 3x.
    await prisma.duty.upsert(upsertPayload);
    await prisma.duty.upsert(upsertPayload);
    await prisma.duty.upsert(upsertPayload);

    const duties = await prisma.duty.findMany({ where: { clientMutationId } });
    expect(duties).toHaveLength(1);
    expect(duties[0]?.openingOdometer).toBe(15_000);
  });

  it('rejects a raw duplicate insert (not an upsert) as a uniqueness violation', async () => {
    const clientMutationId = randomUUID();
    const scheduledStart = new Date('2026-08-06T09:00:00Z');
    const base = {
      branchId,
      origin: 'DEPLOYMENT' as const,
      driverId,
      vehicleId,
      scheduledStart,
      clientMutationId,
    };

    await prisma.duty.create({ data: base });
    await expect(prisma.duty.create({ data: base })).rejects.toThrow();
  });
});
