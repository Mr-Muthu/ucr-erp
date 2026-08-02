import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import type { StaffRole } from '@prisma/client';
import { env } from '../config/env.js';

export interface StaffAccessClaims {
  type: 'staff';
  sub: string; // userId
  role: StaffRole;
  branchId: string;
}

export interface DriverAccessClaims {
  type: 'driver';
  sub: string; // driverAccountId
  driverId: string;
  branchId: string;
  deviceId?: string;
}

export function signStaffAccessToken(claims: Omit<StaffAccessClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'staff' } satisfies StaffAccessClaims, env.JWT_ACCESS_SECRET, {
    // env.JWT_ACCESS_TTL is a trusted config value (validated as a
    // duration string like "15m" by env.ts), not user input — the cast
    // bridges it past @types/jsonwebtoken's branded `StringValue` type,
    // which is stricter than a plain `string` for no functional reason.
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signDriverAccessToken(claims: Omit<DriverAccessClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'driver' } satisfies DriverAccessClaims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): StaffAccessClaims | DriverAccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as StaffAccessClaims | DriverAccessClaims;
}

/**
 * Refresh tokens are opaque high-entropy random strings, not JWTs — they're
 * stored (hashed) in the RefreshToken table so they can be individually
 * revoked/rotated. SHA-256 is sufficient here (unlike password/PIN hashing)
 * because the input already has ~384 bits of entropy, not a guessable secret.
 */
export function generateRefreshTokenValue(): string {
  return randomBytes(48).toString('hex');
}

export function hashRefreshToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function ttlToMs(ttl: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL string: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit as string] ?? 1);
}
