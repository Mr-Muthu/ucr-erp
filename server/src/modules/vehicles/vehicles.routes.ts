import { Router } from 'express';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS, OWNER_ONLY } from '../../lib/roleGroups.js';
import { vehicleCreateSchema, vehicleUpdateSchema, vehicleDocumentSchema, documentOverrideSchema } from './vehicles.schemas.js';

export const vehiclesRouter = createCrudRouter({
  entity: 'Vehicle',
  delegate: prisma.vehicle,
  createSchema: vehicleCreateSchema,
  updateSchema: vehicleUpdateSchema,
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
  softDelete: true,
  include: { category: true, documents: true },
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      const term = String(query.search);
      where.OR = [
        { registrationNumber: { contains: term, mode: 'insensitive' } },
        { make: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
      ];
    }
    return where;
  },
});

// ── Documents & the "expired mandatory document blocks assignment" rule ──

const documentsRouter = Router({ mergeParams: true });
documentsRouter.use(authenticateStaff);

documentsRouter.post('/', requireStaffRole(...FLEET_MANAGERS), validateBody(vehicleDocumentSchema), async (req, res) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
  if (!vehicle) throw ApiError.notFound('Vehicle not found');
  const doc = await prisma.vehicleDocument.create({ data: { ...req.body, vehicleId: req.params.id } });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'VehicleDocument', entityId: doc.id, action: 'CREATE', after: doc });
  res.status(201).json(doc);
});

// OWNER-only, logged override of an expired mandatory document — the one
// escape hatch the spec allows for "expired document blocks assignment".
documentsRouter.post('/:docId/override', requireStaffRole(...OWNER_ONLY), validateBody(documentOverrideSchema), async (req, res) => {
  const doc = await prisma.vehicleDocument.findFirst({ where: { id: req.params.docId, vehicleId: req.params.id } });
  if (!doc) throw ApiError.notFound('Document not found');
  const updated = await prisma.vehicleDocument.update({
    where: { id: doc.id },
    data: { overriddenById: req.staffAuth?.userId, overrideReason: req.body.overrideReason, overrideAt: new Date() },
  });
  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'VehicleDocument',
    entityId: doc.id,
    action: 'OVERRIDE_EXPIRY',
    before: doc,
    after: updated,
  });
  res.json(updated);
});

vehiclesRouter.use('/:id/documents', documentsRouter);

vehiclesRouter.get('/meta/expiring-documents', authenticateStaff, requireStaffRole(...ALL_STAFF), async (req, res) => {
  const days = Number(req.query.days) || 30;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);
  const docs = await prisma.vehicleDocument.findMany({
    where: { expiryDate: { lte: threshold }, deletedAt: null },
    include: { vehicle: { select: { registrationNumber: true, make: true, model: true } } },
    orderBy: { expiryDate: 'asc' },
  });
  res.json({ data: docs });
});

/**
 * Enforced by booking/deployment/duty creation: an expired mandatory
 * document (not overridden) blocks assignment. Not applied to soft-deleted
 * / retired vehicles since they're never assignable anyway.
 */
export async function assertVehicleDocumentsValid(vehicleId: string): Promise<void> {
  const expired = await prisma.vehicleDocument.findFirst({
    where: { vehicleId, deletedAt: null, expiryDate: { lt: new Date() }, overrideAt: null },
  });
  if (expired) {
    const expiredOn = expired.expiryDate ? expired.expiryDate.toISOString().slice(0, 10) : 'unknown date';
    throw ApiError.conflict(
      `Vehicle has an expired ${expired.type} document (expired ${expiredOn}). An OWNER must log an override before this vehicle can be booked or deployed.`
    );
  }
}
