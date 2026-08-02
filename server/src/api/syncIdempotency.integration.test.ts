import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, request, createTestBranch, createTestCategory, createTestVehicle, createDriverAndLogin } from './testHelpers.js';
import { prisma } from '../lib/prisma.js';

/**
 * HTTP-level proof of the sync endpoint's idempotency guarantee: the same
 * offline-queued mutation (same clientMutationId), posted 3x in one batch
 * — as a flaky-network retry would — produces exactly one state change,
 * not three. Requires a live DATABASE_URL; skips itself otherwise.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('POST /driver/v1/sync idempotency', () => {
  let branchId: string;
  let driver: Awaited<ReturnType<typeof createDriverAndLogin>>;
  let vehicleId: string;

  beforeAll(async () => {
    const branch = await createTestBranch();
    branchId = branch.id;
    const category = await createTestCategory();
    const vehicle = await createTestVehicle(branchId, category.id);
    vehicleId = vehicle.id;
    driver = await createDriverAndLogin(branchId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('produces exactly one status change when the same DUTY_ACCEPT + DUTY_START mutation is replayed 3x in one batch', async () => {
    const duty = await prisma.duty.create({
      data: {
        branchId,
        origin: 'VENDOR_SPOT',
        driverId: driver.driver.id,
        vehicleId,
        scheduledStart: new Date(),
        clientMutationId: `duty-${randomUUID()}`,
      },
    });

    const acceptMutationId = randomUUID();
    const startMutationId = randomUUID();

    const batch = {
      items: [
        { clientMutationId: acceptMutationId, clientTimestamp: new Date().toISOString(), type: 'DUTY_ACCEPT', dutyId: duty.id },
        {
          clientMutationId: startMutationId,
          clientTimestamp: new Date().toISOString(),
          type: 'DUTY_START',
          dutyId: duty.id,
          deviceStartAt: new Date().toISOString(),
          openingOdometer: 1000,
        },
      ],
    };

    // Replay the exact same batch 3 times — simulating a driver app that
    // never received the ack and retries over a flaky connection.
    let lastResponse;
    for (let i = 0; i < 3; i++) {
      lastResponse = await request(app).post('/api/driver/v1/sync').set('Authorization', `Bearer ${driver.accessToken}`).send(batch);
      expect(lastResponse.status).toBe(200);
    }

    for (const result of lastResponse!.body.results) {
      expect(result.status).toBe('OK');
    }

    const finalDuty = await prisma.duty.findUnique({ where: { id: duty.id } });
    expect(finalDuty?.status).toBe('STARTED');
    expect(finalDuty?.openingOdometer).toBe(1000);

    // The idempotency ledger should have exactly one row per clientMutationId —
    // not three, even though the batch was submitted three times.
    const acceptLogCount = await prisma.syncMutationLog.count({ where: { clientMutationId: acceptMutationId } });
    const startLogCount = await prisma.syncMutationLog.count({ where: { clientMutationId: startMutationId } });
    expect(acceptLogCount).toBe(1);
    expect(startLogCount).toBe(1);

    // And the odometer log (a real side effect of DUTY_START) was only
    // written once, not three times.
    const odometerLogCount = await prisma.odometerLog.count({ where: { dutyId: duty.id, source: 'DUTY_START' } });
    expect(odometerLogCount).toBe(1);
  });

  it('rejects a sync item for a duty owned by a different driver, without corrupting the rest of the batch', async () => {
    const otherDriver = await createDriverAndLogin(branchId);
    const otherDuty = await prisma.duty.create({
      data: {
        branchId,
        origin: 'VENDOR_SPOT',
        driverId: otherDriver.driver.id,
        vehicleId,
        scheduledStart: new Date(),
        clientMutationId: `duty-${randomUUID()}`,
      },
    });

    const res = await request(app)
      .post('/api/driver/v1/sync')
      .set('Authorization', `Bearer ${driver.accessToken}`) // driver, not otherDriver
      .send({ items: [{ clientMutationId: randomUUID(), clientTimestamp: new Date().toISOString(), type: 'DUTY_ACCEPT', dutyId: otherDuty.id }] });

    expect(res.status).toBe(200); // the batch endpoint itself succeeds — failures are per-item
    expect(res.body.results[0].status).toBe('ERROR');
    expect(res.body.results[0].error.code).toBe('FORBIDDEN');
  });
});
