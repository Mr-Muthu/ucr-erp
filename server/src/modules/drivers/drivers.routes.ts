import { Router } from 'express';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS, OWNER_ONLY } from '../../lib/roleGroups.js';
import { driverCreateSchema, driverUpdateSchema, licenseOverrideSchema } from './drivers.schemas.js';

export const driversRouter = createCrudRouter({
  entity: 'Driver',
  delegate: prisma.driver,
  createSchema: driverCreateSchema,
  updateSchema: driverUpdateSchema,
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
  softDelete: true,
  include: { account: { select: { id: true, phone: true, isActive: true } } },
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      const term = String(query.search);
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { licenseNumber: { contains: term, mode: 'insensitive' } },
      ];
    }
    return where;
  },
});

driversRouter.post(
  '/:id/license-override',
  authenticateStaff,
  requireStaffRole(...OWNER_ONLY),
  validateBody(licenseOverrideSchema),
  async (req, res) => {
    const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
    if (!driver) throw ApiError.notFound('Driver not found');
    const updated = await prisma.driver.update({
      where: { id: driver.id },
      data: { licenseOverrideById: req.staffAuth?.userId, licenseOverrideReason: req.body.overrideReason, licenseOverrideAt: new Date() },
    });
    await recordAudit(prisma, auditActorFromRequest(req), {
      entity: 'Driver',
      entityId: driver.id,
      action: 'OVERRIDE_LICENSE_EXPIRY',
      before: driver,
      after: updated,
    });
    res.json(updated);
  }
);

// Explicit deactivation action (not just a PATCH) — kills the driver's
// sessions immediately (revokes refresh tokens + deactivates devices)
// rather than waiting for their short-lived access token to expire.
driversRouter.post('/:id/deactivate', authenticateStaff, requireStaffRole(...FLEET_MANAGERS), async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) throw ApiError.notFound('Driver not found');

  await prisma.$transaction([
    prisma.driver.update({ where: { id: driver.id }, data: { status: 'INACTIVE' } }),
    prisma.driverAccount.updateMany({ where: { driverId: driver.id }, data: { isActive: false } }),
    prisma.refreshToken.updateMany({
      where: { driverAccount: { driverId: driver.id }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'Driver',
    entityId: driver.id,
    action: 'DEACTIVATE',
    before: driver,
  });
  res.status(204).send();
});

export async function assertDriverLicenseValid(driverId: string): Promise<void> {
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw ApiError.notFound('Driver not found');
  if (driver.licenseExpiry && driver.licenseExpiry.getTime() < Date.now() && !driver.licenseOverrideAt) {
    throw ApiError.conflict(
      `Driver ${driver.name}'s license expired on ${driver.licenseExpiry.toISOString().slice(0, 10)}. An OWNER must log an override before this driver can be assigned.`
    );
  }
}
