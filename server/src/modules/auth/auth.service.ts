import argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/apiError.js';
import {
  generateRefreshTokenValue,
  hashRefreshToken,
  signDriverAccessToken,
  signStaffAccessToken,
  ttlToMs,
} from '../../lib/jwt.js';
import { getSetting } from '../../lib/settings.js';
import type { driverLoginSchema } from './auth.schemas.js';
import { businessLog } from '../../lib/logger.js';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function getLockoutSettings(prisma: PrismaClient) {
  const maxFailedAttempts = await getSetting(prisma, 'auth.lockout.maxFailedAttempts', 5);
  const durationMinutes = await getSetting(prisma, 'auth.lockout.durationMinutes', 15);
  return { maxFailedAttempts, durationMinutes };
}

function assertNotLocked(lockedUntil: Date | null) {
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
    throw new ApiError(423, 'ACCOUNT_LOCKED', `Account temporarily locked. Try again in ${minutesLeft} minute(s).`);
  }
}

// ───────────────────────── Staff ─────────────────────────

export async function staffLogin(
  prisma: PrismaClient,
  params: { email: string; password: string; ip?: string }
): Promise<TokenPair & { user: { id: string; name: string; email: string; role: string; branchId: string } }> {
  const user = await prisma.user.findUnique({ where: { email: params.email } });
  if (!user || user.deletedAt) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  assertNotLocked(user.lockedUntil);

  const valid = await argon2.verify(user.passwordHash, params.password);
  if (!valid) {
    const { maxFailedAttempts, durationMinutes } = await getLockoutSettings(prisma);
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= maxFailedAttempts;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + durationMinutes * 60_000) : null,
      },
    });
    if (shouldLock) businessLog.warn({ userId: user.id }, 'Staff account locked after repeated failed logins');
    throw ApiError.unauthorized('Invalid email or password');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signStaffAccessToken({ sub: user.id, role: user.role, branchId: user.branchId });
  const refreshToken = generateRefreshTokenValue();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
      createdByIp: params.ip,
    },
  });

  businessLog.info({ userId: user.id }, 'Staff login');
  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId },
  };
}

export async function staffRefresh(prisma: PrismaClient, refreshTokenValue: string, ip?: string): Promise<TokenPair> {
  const tokenHash = hashRefreshToken(refreshTokenValue);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now() || !existing.userId || !existing.user) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  if (!existing.user.isActive || existing.user.deletedAt) throw ApiError.forbidden('This account has been deactivated');

  const newRefreshToken = generateRefreshTokenValue();
  const [, created] = await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(newRefreshToken),
        userId: existing.userId,
        expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
        createdByIp: ip,
      },
    }),
  ]);
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { replacedByTokenId: created.id } });

  const accessToken = signStaffAccessToken({ sub: existing.user.id, role: existing.user.role, branchId: existing.user.branchId });
  return { accessToken, refreshToken: newRefreshToken };
}

export async function staffLogout(prisma: PrismaClient, refreshTokenValue: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshTokenValue);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

// ───────────────────────── Driver ─────────────────────────

type DriverLoginInput = typeof driverLoginSchema._type;

export async function driverLogin(
  prisma: PrismaClient,
  params: DriverLoginInput & { ip?: string }
): Promise<TokenPair & { driver: { id: string; name: string; branchId: string } }> {
  const account = await prisma.driverAccount.findUnique({ where: { phone: params.phone }, include: { driver: true } });
  if (!account) throw ApiError.unauthorized('Invalid phone number or PIN');
  if (!account.isActive || account.driver.status === 'INACTIVE' || account.driver.deletedAt) {
    throw ApiError.forbidden('This driver account has been deactivated');
  }

  assertNotLocked(account.lockedUntil);

  const valid = await argon2.verify(account.pinHash, params.pin);
  if (!valid) {
    const { maxFailedAttempts, durationMinutes } = await getLockoutSettings(prisma);
    const attempts = account.failedPinAttempts + 1;
    const shouldLock = attempts >= maxFailedAttempts;
    await prisma.driverAccount.update({
      where: { id: account.id },
      data: {
        failedPinAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + durationMinutes * 60_000) : null,
      },
    });
    if (shouldLock) businessLog.warn({ driverAccountId: account.id }, 'Driver account locked after repeated failed PIN attempts');
    throw ApiError.unauthorized('Invalid phone number or PIN');
  }

  const device = await prisma.driverDevice.upsert({
    where: { driverAccountId_clientDeviceId: { driverAccountId: account.id, clientDeviceId: params.device.clientDeviceId } },
    update: {
      expoPushToken: params.device.expoPushToken,
      deviceModel: params.device.deviceModel,
      appVersion: params.device.appVersion,
      osVersion: params.device.osVersion,
      lastSeenAt: new Date(),
      isActive: true,
    },
    create: {
      driverAccountId: account.id,
      clientDeviceId: params.device.clientDeviceId,
      expoPushToken: params.device.expoPushToken,
      deviceModel: params.device.deviceModel,
      appVersion: params.device.appVersion,
      osVersion: params.device.osVersion,
      lastSeenAt: new Date(),
    },
  });

  await prisma.driverAccount.update({
    where: { id: account.id },
    data: { failedPinAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signDriverAccessToken({
    sub: account.id,
    driverId: account.driverId,
    branchId: account.driver.branchId,
    deviceId: device.id,
  });
  const refreshToken = generateRefreshTokenValue();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      driverAccountId: account.id,
      driverDeviceId: device.id,
      expiresAt: new Date(Date.now() + ttlToMs(env.DRIVER_JWT_REFRESH_TTL)),
      createdByIp: params.ip,
    },
  });

  businessLog.info({ driverAccountId: account.id, deviceId: device.id }, 'Driver login');
  return { accessToken, refreshToken, driver: { id: account.driverId, name: account.driver.name, branchId: account.driver.branchId } };
}

export async function driverRefresh(prisma: PrismaClient, refreshTokenValue: string, ip?: string): Promise<TokenPair> {
  const tokenHash = hashRefreshToken(refreshTokenValue);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { driverAccount: { include: { driver: true } }, driverDevice: true },
  });

  if (
    !existing ||
    existing.revokedAt ||
    existing.expiresAt.getTime() < Date.now() ||
    !existing.driverAccountId ||
    !existing.driverAccount
  ) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  // The core "deactivating a driver kills their sessions" guarantee: any of
  // these being false fails the refresh immediately, ending the session
  // within one sync cycle since access tokens are short-lived.
  const account = existing.driverAccount;
  if (!account.isActive || account.driver.status === 'INACTIVE' || account.driver.deletedAt) {
    throw ApiError.forbidden('This driver account has been deactivated');
  }
  if (existing.driverDevice && !existing.driverDevice.isActive) {
    throw ApiError.forbidden('This device has been deactivated');
  }

  const newRefreshToken = generateRefreshTokenValue();
  const created = await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(newRefreshToken),
      driverAccountId: account.id,
      driverDeviceId: existing.driverDeviceId,
      expiresAt: new Date(Date.now() + ttlToMs(env.DRIVER_JWT_REFRESH_TTL)),
      createdByIp: ip,
    },
  });
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date(), replacedByTokenId: created.id } });

  const accessToken = signDriverAccessToken({
    sub: account.id,
    driverId: account.driverId,
    branchId: account.driver.branchId,
    deviceId: existing.driverDeviceId ?? undefined,
  });
  return { accessToken, refreshToken: newRefreshToken };
}

export async function driverLogout(prisma: PrismaClient, refreshTokenValue: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshTokenValue);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}
