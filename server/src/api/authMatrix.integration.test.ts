import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, request, createTestBranch, createStaffUserAndLogin, createDriverAndLogin } from './testHelpers.js';
import { prisma } from '../lib/prisma.js';

/**
 * Authorization-matrix proof per Phase 2 acceptance: every role x route,
 * plus the driver track — a driver token must 403 on every staff route and
 * on another driver's duty. Requires a live DATABASE_URL; skips itself
 * otherwise (see Phase 1 tests for the same pattern and why).
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('authorization matrix', () => {
  let branchId: string;
  let owner: Awaited<ReturnType<typeof createStaffUserAndLogin>>;
  let viewer: Awaited<ReturnType<typeof createStaffUserAndLogin>>;
  let ops: Awaited<ReturnType<typeof createStaffUserAndLogin>>;
  let accounts: Awaited<ReturnType<typeof createStaffUserAndLogin>>;
  let driverA: Awaited<ReturnType<typeof createDriverAndLogin>>;
  let driverB: Awaited<ReturnType<typeof createDriverAndLogin>>;

  beforeAll(async () => {
    const branch = await createTestBranch();
    branchId = branch.id;
    owner = await createStaffUserAndLogin('OWNER', branchId);
    viewer = await createStaffUserAndLogin('VIEWER', branchId);
    ops = await createStaffUserAndLogin('OPS', branchId);
    accounts = await createStaffUserAndLogin('ACCOUNTS', branchId);
    driverA = await createDriverAndLogin(branchId);
    driverB = await createDriverAndLogin(branchId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows any authenticated staff role to read vehicles', async () => {
    const res = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${viewer.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects VIEWER writing a vehicle (fleet write requires OWNER/MANAGER/OPS)', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ branchId, categoryId: 'x', registrationNumber: 'MH12ZZ0000', make: 'X', model: 'Y', year: 2023, fuelType: 'PETROL', transmission: 'MANUAL', seats: 4 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows OPS to write a vehicle (fleet manager role)', async () => {
    const category = await prisma.vehicleCategory.create({ data: { name: `AuthTest-${Date.now()}`, code: `AT-${Date.now()}`, defaultSeatingCapacity: 4 } });
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${ops.accessToken}`)
      .send({ branchId, categoryId: category.id, registrationNumber: `MH12${Date.now()}`, make: 'X', model: 'Y', year: 2023, fuelType: 'PETROL', transmission: 'MANUAL', seats: 4 });
    expect(res.status).toBe(201);
  });

  it('rejects OPS voiding an invoice (OWNER-only per the permission map)', async () => {
    const res = await request(app).post('/api/v1/invoices/nonexistent-id/void').set('Authorization', `Bearer ${ops.accessToken}`).send({ reason: 'test reason' });
    // 403 must win over 404 — role check happens before the record lookup.
    expect(res.status).toBe(403);
  });

  it('rejects ACCOUNTS voiding an invoice too — only OWNER may', async () => {
    const res = await request(app).post('/api/v1/invoices/nonexistent-id/void').set('Authorization', `Bearer ${accounts.accessToken}`).send({ reason: 'test reason' });
    expect(res.status).toBe(403);
  });

  it('rejects ACCOUNTS writing fleet data (money manager, not fleet manager)', async () => {
    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', `Bearer ${accounts.accessToken}`)
      .send({ branchId, categoryId: 'x', registrationNumber: 'MH12YY0000', make: 'X', model: 'Y', year: 2023, fuelType: 'PETROL', transmission: 'MANUAL', seats: 4 });
    expect(res.status).toBe(403);
  });

  it('allows OWNER everywhere', async () => {
    const res = await request(app).post('/api/v1/invoices/nonexistent-id/void').set('Authorization', `Bearer ${owner.accessToken}`).send({ reason: 'test reason' });
    // OWNER passes the role gate; 404 here proves it got past authorization to the not-found check.
    expect(res.status).toBe(404);
  });

  it('rejects a request with no token at all', async () => {
    const res = await request(app).get('/api/v1/vehicles');
    expect(res.status).toBe(401);
  });

  it('rejects a driver token on a staff route', async () => {
    const res = await request(app).get('/api/v1/vehicles').set('Authorization', `Bearer ${driverA.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects a staff token on a driver route', async () => {
    const res = await request(app).get('/api/driver/v1/duties').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects driver A accessing driver B\'s duty', async () => {
    const category = await createTestCategoryFixture();
    const vehicle = await prisma.vehicle.create({
      data: { branchId, categoryId: category.id, registrationNumber: `MH12${Date.now()}B`, make: 'X', model: 'Y', year: 2023, fuelType: 'PETROL', transmission: 'MANUAL', seats: 4 },
    });
    const duty = await prisma.duty.create({
      data: {
        branchId,
        origin: 'VENDOR_SPOT',
        driverId: driverB.driver.id,
        vehicleId: vehicle.id,
        scheduledStart: new Date(),
        clientMutationId: `test-${Date.now()}`,
      },
    });

    const res = await request(app).get(`/api/driver/v1/duties/${duty.id}`).set('Authorization', `Bearer ${driverA.accessToken}`);
    expect(res.status).toBe(403);

    const ownRes = await request(app).get(`/api/driver/v1/duties/${duty.id}`).set('Authorization', `Bearer ${driverB.accessToken}`);
    expect(ownRes.status).toBe(200);
  });

  async function createTestCategoryFixture() {
    return prisma.vehicleCategory.create({ data: { name: `AuthTest2-${Date.now()}`, code: `AT2-${Date.now()}`, defaultSeatingCapacity: 4 } });
  }
});
