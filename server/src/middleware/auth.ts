import type { NextFunction, Request, Response } from 'express';
import type { StaffRole } from '@prisma/client';
import { ApiError } from '../lib/apiError.js';
import { verifyAccessToken } from '../lib/jwt.js';

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Missing or malformed Authorization header');
  return token;
}

/** Staff-side auth guard for /api/v1 routes. Populates req.staffAuth. */
export function authenticateStaff(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
  if (claims.type !== 'staff') throw ApiError.forbidden('This endpoint requires a staff session');
  req.staffAuth = { userId: claims.sub, role: claims.role, branchId: claims.branchId };
  next();
}

/** Driver-side auth guard for /api/driver/v1 routes. Populates req.driverAuth. */
export function authenticateDriver(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
  if (claims.type !== 'driver') throw ApiError.forbidden('This endpoint requires a driver session');
  req.driverAuth = { driverAccountId: claims.sub, driverId: claims.driverId, branchId: claims.branchId, deviceId: claims.deviceId };
  next();
}

/**
 * Server-side RBAC per the spec's permission policy map:
 * OWNER > MANAGER > OPS/ACCOUNTS (peer, different domains) > VIEWER (read-only).
 * Applied per-route as `requireStaffRole('OWNER', 'MANAGER')` etc.
 */
export function requireStaffRole(...roles: StaffRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.staffAuth) throw ApiError.unauthorized();
    if (!roles.includes(req.staffAuth.role)) throw ApiError.forbidden();
    next();
  };
}
