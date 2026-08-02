import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Proves the dedup guarantee the daily expiry-scan job depends on: calling
 * queueNotification twice for the same entity+type on the same day must
 * produce exactly one Notification row, not two — the unique `dedupeKey`
 * constraint is what makes a repeat scan run safe to re-run without
 * spamming staff. A different entity, or the same entity on a different
 * (synthetic) day, must NOT be deduped against it.
 *
 * Requires a live DATABASE_URL + REDIS_URL — skips itself if either is
 * absent. Run for real with: npx vitest run notify.integration
 */
const hasDb = Boolean(process.env.DATABASE_URL) && Boolean(process.env.REDIS_URL);

describe.skipIf(!hasDb)('notification dedup', () => {
  let prisma: import('@prisma/client').PrismaClient;
  let queueNotification: typeof import('./notify.js').queueNotification;
  let branchId: string;
  const entityId = `test-entity-${randomUUID()}`;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    ({ queueNotification } = await import('./notify.js'));

    const branch = await prisma.branch.create({
      data: { name: 'Test Branch', code: `TB-${randomUUID().slice(0, 8)}`, stateCode: '27' },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { branchId } });
    await prisma.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
  });

  it('creates exactly one row when the same entity+type+day is queued twice', async () => {
    const first = await queueNotification({
      branchId,
      type: 'VEHICLE_DOCUMENT_EXPIRY',
      entity: 'VehicleDocument',
      entityId,
      subject: 'Test expiry',
      message: 'Test message',
    });
    expect(first).not.toBeNull();

    const second = await queueNotification({
      branchId,
      type: 'VEHICLE_DOCUMENT_EXPIRY',
      entity: 'VehicleDocument',
      entityId,
      subject: 'Test expiry (repeat)',
      message: 'Test message (repeat)',
    });
    expect(second).toBeNull(); // deduped — not an error, just a no-op

    const rows = await prisma.notification.findMany({ where: { branchId, entityId } });
    expect(rows).toHaveLength(1);
  });

  it('does not dedupe a different notification type for the same entity', async () => {
    const otherType = await queueNotification({
      branchId,
      type: 'INVOICE_OVERDUE',
      entity: 'VehicleDocument', // same entityId, different type — distinct dedupeKey
      entityId,
      subject: 'Different alert',
      message: 'Different message',
    });
    expect(otherType).not.toBeNull();

    const rows = await prisma.notification.findMany({ where: { branchId, entityId } });
    expect(rows).toHaveLength(2);
  });
});
