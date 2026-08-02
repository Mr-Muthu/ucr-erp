import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';
import { parsePageParams, buildPageResult } from '../../lib/pagination.js';
import { assertDutyTransition, type DutyStatus } from '../../domain/dutyStatus.js';
import { assertVehicleDocumentsValid } from '../vehicles/vehicles.routes.js';
import { assertDriverLicenseValid } from '../drivers/drivers.routes.js';
import { dutyCreateSchema, dutyStaffTransitionSchema } from './duties.schemas.js';

export const dutiesRouter = Router();
dutiesRouter.use(authenticateStaff);

dutiesRouter.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const { limit, page } = parsePageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.driverId) where.driverId = req.query.driverId;
  if (req.query.vehicleId) where.vehicleId = req.query.vehicleId;
  if (req.query.vendorId) where.vendorId = req.query.vendorId;
  if (req.query.deploymentId) where.deploymentId = req.query.deploymentId;
  const rows = await prisma.duty.findMany({
    where,
    include: {
      driver: { select: { id: true, name: true, phone: true } },
      vehicle: { select: { id: true, registrationNumber: true } },
      vendor: { select: { id: true, companyName: true } },
    },
    orderBy: { id: 'desc' },
    ...page,
  });
  res.json(buildPageResult(rows, limit));
});

dutiesRouter.get('/:id', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const duty = await prisma.duty.findUnique({
    where: { id: req.params.id },
    include: { driver: true, vehicle: true, vendor: true, booking: true, deployment: true, expenseEntries: true, nightHalts: true },
  });
  if (!duty) throw ApiError.notFound('Duty not found');
  res.json(duty);
});

dutiesRouter.post('/', requireStaffRole(...FLEET_MANAGERS), validateBody(dutyCreateSchema), async (req, res) => {
  const body = req.body;
  await assertVehicleDocumentsValid(body.vehicleId);
  await assertDriverLicenseValid(body.driverId);

  // Snapshot the rate terms NOW so later rate-card edits never retroactively
  // change this duty's billing (per the Phase 1 snapshot discipline).
  let rateSnapshotJson: Prisma.InputJsonValue | undefined;
  if (body.vendorRateCardItemId) {
    const item = await prisma.vendorRateCardItem.findUnique({ where: { id: body.vendorRateCardItemId } });
    if (!item) throw ApiError.badRequest('Vendor rate card item not found', 'vendorRateCardItemId');
    rateSnapshotJson = JSON.parse(JSON.stringify(item));
  }

  const duty = await prisma.duty.create({
    data: {
      branchId: body.branchId,
      origin: body.deploymentId ? 'DEPLOYMENT' : 'VENDOR_SPOT',
      deploymentId: body.deploymentId,
      vendorId: body.vendorId,
      vendorRateCardItemId: body.vendorRateCardItemId,
      rateSnapshotJson,
      driverId: body.driverId,
      vehicleId: body.vehicleId,
      scheduledStart: body.scheduledStart,
      scheduledEnd: body.scheduledEnd,
      passengerName: body.passengerName,
      passengerPhone: body.passengerPhone,
      routeRemarks: body.routeRemarks,
      clientMutationId: randomUUID(),
    },
  });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: duty.id, action: 'CREATE', after: duty });
  res.status(201).json(duty);
});

dutiesRouter.post('/:id/transition', requireStaffRole(...FLEET_MANAGERS), validateBody(dutyStaffTransitionSchema), async (req, res) => {
  const duty = await prisma.duty.findUnique({ where: { id: req.params.id } });
  if (!duty) throw ApiError.notFound('Duty not found');

  const nextStatus = assertDutyTransition(duty.status as DutyStatus, req.body.action, 'STAFF') as DutyStatus;

  const data: Record<string, unknown> = { status: nextStatus };
  if (req.body.action === 'dispute') data.disputeReason = req.body.reason;
  if (req.body.action === 'reject') data.rejectionReason = req.body.reason;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.duty.update({ where: { id: duty.id }, data });

    if (req.body.action === 'approve') {
      // Create the DriverPayable ledger entries this duty earns — the
      // reconciliation/invoice pipeline reads Duty directly for billing,
      // but the driver's own payout statement is built from these entries.
      const periodMonth = duty.scheduledStart.toISOString().slice(0, 7);

      const expenseEntries = await tx.dutyExpenseEntry.findMany({ where: { dutyId: duty.id, reimbursableToDriver: true } });
      for (const entry of expenseEntries) {
        await tx.driverPayableEntry.create({
          data: { driverId: duty.driverId, dutyId: duty.id, type: 'REIMBURSEMENT', amount: entry.amount, periodMonth },
        });
      }

      const nightHalts = await tx.dutyNightHalt.findMany({ where: { dutyId: duty.id } });
      if (nightHalts.length > 0) {
        const rateSnapshot = (duty.rateSnapshotJson ?? {}) as { nightHaltRate?: number };
        const nightHaltRate = rateSnapshot.nightHaltRate ?? 0;
        if (nightHaltRate > 0) {
          for (const halt of nightHalts) {
            await tx.driverPayableEntry.create({
              data: { driverId: duty.driverId, dutyId: duty.id, type: 'NIGHT_HALT', amount: nightHaltRate, periodMonth },
            });
            void halt; // one entry per night halt row
          }
        }
      }
    }

    return result;
  });

  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'Duty',
    entityId: duty.id,
    action: `TRANSITION_${req.body.action.toUpperCase()}`,
    before: duty,
    after: updated,
  });
  res.json(updated);
});
