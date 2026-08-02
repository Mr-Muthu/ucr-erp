import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';
import { parsePageParams, buildPageResult } from '../../lib/pagination.js';
import { checkVehicleOverlap } from '../../lib/vehicleAvailability.js';
import { assertVehicleDocumentsValid } from '../vehicles/vehicles.routes.js';
import { deploymentCreateSchema, deploymentEndSchema, replaceVehicleSchema } from './deployments.schemas.js';

export const deploymentsRouter = Router();
deploymentsRouter.use(authenticateStaff);

// Open-ended segments are checked against a far-future sentinel rather than
// a real "infinity" Date object (DB-side uses Postgres 'infinity', but JS
// Date can't represent that — this is just for the pre-check query).
const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

deploymentsRouter.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const { limit, page } = parsePageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.vendorId) where.vendorId = req.query.vendorId;
  if (req.query.customerId) where.customerId = req.query.customerId;
  const rows = await prisma.vehicleDeployment.findMany({
    where,
    include: { vendor: true, customer: true, vehicleSegments: { orderBy: { startDate: 'asc' } }, defaultDriver: true },
    orderBy: { id: 'desc' },
    ...page,
  });
  res.json(buildPageResult(rows, limit));
});

deploymentsRouter.get('/:id', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const deployment = await prisma.vehicleDeployment.findUnique({
    where: { id: req.params.id },
    include: { vendor: true, customer: true, vehicleSegments: { include: { vehicle: true }, orderBy: { startDate: 'asc' } }, duties: true },
  });
  if (!deployment) throw ApiError.notFound('Deployment not found');
  res.json(deployment);
});

deploymentsRouter.post('/', requireStaffRole(...FLEET_MANAGERS), validateBody(deploymentCreateSchema), async (req, res) => {
  const body = req.body;

  const rateSnapshot =
    body.counterpartyType === 'VENDOR'
      ? await prisma.vendorRateCardItem.findUnique({ where: { id: body.vendorRateCardItemId } })
      : await prisma.rateCardItem.findUnique({ where: { id: body.customerRateCardItemId } });
  if (!rateSnapshot) throw ApiError.badRequest('Rate card item not found', 'vendorRateCardItemId');

  await assertVehicleDocumentsValid(body.vehicleId);
  const overlap = await checkVehicleOverlap({ vehicleId: body.vehicleId, start: body.startDate, end: FAR_FUTURE });
  if (!overlap.available) throw ApiError.conflict(overlap.reason ?? 'Vehicle is not available for this window');

  const [deployment] = await prisma.$transaction([
    prisma.vehicleDeployment.create({
      data: {
        branchId: body.branchId,
        counterpartyType: body.counterpartyType,
        vendorId: body.vendorId,
        customerId: body.customerId,
        vendorRateCardItemId: body.vendorRateCardItemId,
        customerRateCardItemId: body.customerRateCardItemId,
        rateSnapshotJson: JSON.parse(JSON.stringify(rateSnapshot)),
        defaultDriverId: body.defaultDriverId,
        startDate: body.startDate,
        openingOdometer: body.openingOdometer,
      },
    }),
  ]);
  await prisma.deploymentVehicleSegment.create({
    data: { deploymentId: deployment.id, vehicleId: body.vehicleId, startDate: body.startDate, openingOdometer: body.openingOdometer },
  });
  await prisma.vehicle.update({ where: { id: body.vehicleId }, data: { status: 'DEPLOYED' } });

  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'VehicleDeployment', entityId: deployment.id, action: 'CREATE', after: deployment });
  res.status(201).json(deployment);
});

deploymentsRouter.post('/:id/replace-vehicle', requireStaffRole(...FLEET_MANAGERS), validateBody(replaceVehicleSchema), async (req, res) => {
  const deployment = await prisma.vehicleDeployment.findUnique({ where: { id: req.params.id } });
  if (!deployment) throw ApiError.notFound('Deployment not found');
  if (deployment.status !== 'ACTIVE') throw ApiError.conflict('Deployment is not active');

  const currentSegment = await prisma.deploymentVehicleSegment.findFirst({
    where: { deploymentId: deployment.id, endDate: null },
  });
  if (!currentSegment) throw ApiError.conflict('No open segment found for this deployment');

  const effectiveDate = req.body.effectiveDate ?? new Date();

  await assertVehicleDocumentsValid(req.body.newVehicleId);
  const overlap = await checkVehicleOverlap({ vehicleId: req.body.newVehicleId, start: effectiveDate, end: FAR_FUTURE });
  if (!overlap.available) throw ApiError.conflict(overlap.reason ?? 'Replacement vehicle is not available for this window');

  await prisma.$transaction([
    prisma.deploymentVehicleSegment.update({
      where: { id: currentSegment.id },
      data: { endDate: effectiveDate, closingOdometer: req.body.closingOdometerForOldVehicle },
    }),
    prisma.deploymentVehicleSegment.create({
      data: {
        deploymentId: deployment.id,
        vehicleId: req.body.newVehicleId,
        startDate: effectiveDate,
        openingOdometer: req.body.openingOdometerForNewVehicle,
        replacementReason: req.body.replacementReason,
      },
    }),
    prisma.vehicle.update({ where: { id: currentSegment.vehicleId }, data: { status: 'AVAILABLE' } }),
    prisma.vehicle.update({ where: { id: req.body.newVehicleId }, data: { status: 'DEPLOYED' } }),
  ]);

  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'VehicleDeployment',
    entityId: deployment.id,
    action: 'REPLACE_VEHICLE',
    before: { vehicleId: currentSegment.vehicleId },
    after: { vehicleId: req.body.newVehicleId, reason: req.body.replacementReason },
  });

  const updated = await prisma.vehicleDeployment.findUnique({
    where: { id: deployment.id },
    include: { vehicleSegments: { orderBy: { startDate: 'asc' } } },
  });
  res.json(updated);
});

deploymentsRouter.post('/:id/end', requireStaffRole(...FLEET_MANAGERS), validateBody(deploymentEndSchema), async (req, res) => {
  const deployment = await prisma.vehicleDeployment.findUnique({ where: { id: req.params.id } });
  if (!deployment) throw ApiError.notFound('Deployment not found');
  if (deployment.status !== 'ACTIVE') throw ApiError.conflict('Deployment is not active');

  const currentSegment = await prisma.deploymentVehicleSegment.findFirst({ where: { deploymentId: deployment.id, endDate: null } });
  const endDate = req.body.endDate ?? new Date();

  await prisma.$transaction([
    prisma.vehicleDeployment.update({ where: { id: deployment.id }, data: { status: 'ENDED', endDate } }),
    ...(currentSegment
      ? [
          prisma.deploymentVehicleSegment.update({
            where: { id: currentSegment.id },
            data: { endDate, closingOdometer: req.body.closingOdometer },
          }),
          prisma.vehicle.update({ where: { id: currentSegment.vehicleId }, data: { status: 'AVAILABLE' } }),
        ]
      : []),
  ]);

  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'VehicleDeployment', entityId: deployment.id, action: 'END', before: deployment });
  res.status(204).send();
});
