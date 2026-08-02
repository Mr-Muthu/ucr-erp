import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateDriver } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import * as dutyService from './driverDuty.service.js';
import { dutyCompleteSchema, dutyDeclineSchema, dutyEntrySchema, dutyStartSchema, nightHaltSchema } from './driverDuties.schemas.js';

export const driverDutiesRouter = Router();
driverDutiesRouter.use(authenticateDriver);

// Driver-facing detail always includes the vehicle plate and pickup/drop —
// the app has nothing else to render a duty card from otherwise.
const driverDutyInclude = {
  vehicle: { select: { registrationNumber: true, make: true, model: true } },
  booking: { select: { pickupLocation: true, dropLocation: true } },
} as const;

driverDutiesRouter.get('/', async (req, res) => {
  const duties = await prisma.duty.findMany({
    where: { driverId: req.driverAuth?.driverId },
    orderBy: { scheduledStart: 'desc' },
    take: 50,
    include: driverDutyInclude,
  });
  res.json({ data: duties });
});

driverDutiesRouter.get('/:id', async (req, res) => {
  const duty = await prisma.duty.findUnique({ where: { id: req.params.id! }, include: driverDutyInclude });
  if (!duty) throw ApiError.notFound('Duty not found');
  // Distinct from "doesn't exist": a duty that exists but belongs to
  // another driver must 403, not 404 — the driver-scope guarantee the spec
  // requires ("a driver token must 403 ... on another driver's duty").
  if (duty.driverId !== req.driverAuth?.driverId) throw ApiError.forbidden('This duty does not belong to you');
  res.json(duty);
});

driverDutiesRouter.post('/:id/accept', async (req, res) => {
  const updated = await dutyService.acceptDuty(req.driverAuth!.driverId, req.params.id!);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: req.params.id!, action: 'DRIVER_ACCEPT', after: updated });
  res.json(updated);
});

driverDutiesRouter.post('/:id/decline', validateBody(dutyDeclineSchema), async (req, res) => {
  const updated = await dutyService.declineDuty(req.driverAuth!.driverId, req.params.id!, req.body.reason);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: req.params.id!, action: 'DRIVER_DECLINE', after: updated });
  res.json(updated);
});

driverDutiesRouter.post('/:id/start', validateBody(dutyStartSchema), async (req, res) => {
  const updated = await dutyService.startDuty(req.driverAuth!.driverId, req.params.id!, req.body);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: req.params.id!, action: 'DRIVER_START', after: updated });
  res.json(updated);
});

driverDutiesRouter.post('/:id/complete', validateBody(dutyCompleteSchema), async (req, res) => {
  const updated = await dutyService.completeDuty(req.driverAuth!.driverId, req.params.id!, req.body);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: req.params.id!, action: 'DRIVER_COMPLETE', after: updated });
  res.json(updated);
});

driverDutiesRouter.post('/:id/submit', async (req, res) => {
  const updated = await dutyService.submitDuty(req.driverAuth!.driverId, req.params.id!);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: req.params.id!, action: 'DRIVER_SUBMIT', after: updated });
  res.json(updated);
});

driverDutiesRouter.post('/:id/resubmit', async (req, res) => {
  const updated = await dutyService.resubmitDuty(req.driverAuth!.driverId, req.params.id!);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Duty', entityId: req.params.id!, action: 'DRIVER_RESUBMIT', after: updated });
  res.json(updated);
});

driverDutiesRouter.post('/:id/entries', validateBody(dutyEntrySchema), async (req, res) => {
  const entry = await dutyService.addEntry(req.driverAuth!.driverId, req.params.id!, req.body);
  res.status(201).json(entry);
});

driverDutiesRouter.post('/:id/night-halts', validateBody(nightHaltSchema), async (req, res) => {
  const halt = await dutyService.addNightHalt(req.driverAuth!.driverId, req.params.id!, req.body);
  res.status(201).json(halt);
});
