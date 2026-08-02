import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import request from 'supertest';
import type { StaffRole } from '@prisma/client';
import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';

export const TEST_PASSWORD = 'Password123!Test';
export const TEST_PIN = '4321';

export async function createTestBranch() {
  return prisma.branch.create({
    data: { name: 'API Test Branch', code: `TEST-${randomUUID().slice(0, 8)}`, stateCode: '27' },
  });
}

export async function createTestCategory() {
  return prisma.vehicleCategory.create({
    data: { name: `TestCat-${randomUUID().slice(0, 6)}`, code: `TC-${randomUUID().slice(0, 6)}`, defaultSeatingCapacity: 4 },
  });
}

export async function createTestVehicle(branchId: string, categoryId: string) {
  return prisma.vehicle.create({
    data: {
      branchId,
      categoryId,
      registrationNumber: `MH12${randomUUID().slice(0, 6).toUpperCase()}`,
      make: 'Test',
      model: 'Car',
      year: 2023,
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      seats: 4,
    },
  });
}

export async function createStaffUserAndLogin(role: StaffRole, branchId: string) {
  const email = `test-${role.toLowerCase()}-${randomUUID()}@example.com`;
  const passwordHash = await argon2.hash(TEST_PASSWORD);
  const user = await prisma.user.create({ data: { branchId, name: `Test ${role}`, email, passwordHash, role } });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`Staff login failed in test setup: ${JSON.stringify(res.body)}`);
  return { user, accessToken: res.body.accessToken as string, refreshToken: res.body.refreshToken as string };
}

export async function createDriverAndLogin(branchId: string) {
  const phone = `9${Math.floor(Math.random() * 900_000_000 + 100_000_000)}`;
  const driver = await prisma.driver.create({
    data: { branchId, name: 'Test Driver', phone, licenseNumber: `DL-${randomUUID().slice(0, 8)}` },
  });
  const pinHash = await argon2.hash(TEST_PIN);
  await prisma.driverAccount.create({ data: { driverId: driver.id, phone, pinHash } });

  const res = await request(app)
    .post('/api/driver/v1/auth/login')
    .send({ phone, pin: TEST_PIN, device: { clientDeviceId: `device-${randomUUID()}` } });
  if (res.status !== 200) throw new Error(`Driver login failed in test setup: ${JSON.stringify(res.body)}`);
  return { driver, accessToken: res.body.accessToken as string, refreshToken: res.body.refreshToken as string };
}

export { app, request };
