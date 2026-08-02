import { Router } from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS, MONEY_MANAGERS } from '../../lib/roleGroups.js';
import { parsePageParams, buildPageResult } from '../../lib/pagination.js';
import { assertBookingTransition, type BookingStatus } from '../../domain/bookingStatus.js';
import { checkVehicleOverlap } from '../../lib/vehicleAvailability.js';
import { assertVehicleDocumentsValid } from '../vehicles/vehicles.routes.js';
import { validateDiscount, type DiscountThresholdMap, type DiscountRole } from '../../settlement/discountPolicy.js';
import { getSetting } from '../../lib/settings.js';
import { documentsQueue, JOB_NAMES } from '../../lib/queue.js';
import { z } from 'zod';
import { bookingCreateSchema, bookingUpdateSchema, bookingTransitionSchema, bookingDiscountSchema } from './bookings.schemas.js';
import { computeInitialBookingQuote } from './bookingQuote.js';
import { confirmBookingSettlement, previewBookingSettlement } from './bookingSettlement.service.js';

export const bookingsRouter = Router();
bookingsRouter.use(authenticateStaff);

function generateBookingNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `BK-${datePart}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

const listQuerySchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().optional(), status: z.string().optional(), customerId: z.string().optional() });

bookingsRouter.get('/', requireStaffRole(...ALL_STAFF), validateQuery(listQuerySchema), async (req, res) => {
  const { limit, page } = parsePageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.customerId) where.customerId = req.query.customerId;
  const rows = await prisma.booking.findMany({
    where,
    include: { customer: { select: { id: true, name: true, phone: true } }, vehicle: { select: { id: true, registrationNumber: true } } },
    orderBy: { id: 'desc' },
    ...page,
  });
  res.json(buildPageResult(rows, limit));
});

bookingsRouter.get('/:id', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { customer: true, vehicle: true, duties: true, invoices: true },
  });
  if (!booking) throw ApiError.notFound('Booking not found');
  res.json(booking);
});

bookingsRouter.post('/', requireStaffRole(...FLEET_MANAGERS), validateBody(bookingCreateSchema), async (req, res) => {
  const rateItem = await prisma.rateCardItem.findUnique({ where: { id: req.body.rateCardItemId }, include: { rateCard: true } });
  if (!rateItem) throw ApiError.badRequest('Rate card item not found', 'rateCardItemId');
  if (rateItem.rateCard.type !== req.body.type) throw ApiError.badRequest('Rate card item type does not match booking type', 'rateCardItemId');

  const quotedAmount = computeInitialBookingQuote(req.body.type, rateItem, req.body.outstationDays);

  const booking = await prisma.booking.create({
    data: {
      branchId: req.body.branchId,
      customerId: req.body.customerId,
      type: req.body.type,
      rateCardItemId: rateItem.id,
      rateSnapshotJson: JSON.parse(JSON.stringify(rateItem)),
      bookingNumber: generateBookingNumber(),
      pickupLocation: req.body.pickupLocation,
      dropLocation: req.body.dropLocation,
      pickupDateTime: req.body.pickupDateTime,
      dropDateTime: req.body.dropDateTime,
      outstationDays: req.body.outstationDays,
      vehicleId: req.body.vehicleId,
      advanceAmount: req.body.advanceAmount ?? 0,
      quotedAmount,
      status: 'INQUIRY',
    },
    include: { customer: true, vehicle: true },
  });

  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Booking', entityId: booking.id, action: 'CREATE', after: booking });
  res.status(201).json(booking);
});

bookingsRouter.patch('/:id', requireStaffRole(...FLEET_MANAGERS), validateBody(bookingUpdateSchema), async (req, res) => {
  const before = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!before) throw ApiError.notFound('Booking not found');
  if (['COMPLETED', 'CLOSED', 'CANCELLED', 'NO_SHOW'].includes(before.status)) {
    throw ApiError.conflict(`Cannot edit a booking that is already ${before.status}`);
  }
  const updated = await prisma.booking.update({ where: { id: before.id }, data: req.body, include: { customer: true, vehicle: true } });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Booking', entityId: updated.id, action: 'UPDATE', before, after: updated });
  res.json(updated);
});

bookingsRouter.patch('/:id/discount', requireStaffRole(...FLEET_MANAGERS), validateBody(bookingDiscountSchema), async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw ApiError.notFound('Booking not found');

  // Stored/seeded as number|null (OWNER: null means "uncapped" — JSON has
  // no Infinity) and normalized to DiscountThresholdMap's actual Infinity
  // below; this raw shape is intentionally looser than DiscountThresholdMap.
  const thresholds = await getSetting<Record<DiscountRole, number | null>>(
    prisma,
    'booking.discount.maxPercentByRole',
    { OPS: 5, MANAGER: 15, ACCOUNTS: 0, VIEWER: 0, OWNER: null }
  );
  const normalizedThresholds: DiscountThresholdMap = {
    OWNER: Infinity,
    MANAGER: thresholds.MANAGER ?? 0,
    OPS: thresholds.OPS ?? 0,
    ACCOUNTS: thresholds.ACCOUNTS ?? 0,
    VIEWER: thresholds.VIEWER ?? 0,
  };

  const result = validateDiscount({
    role: req.staffAuth!.role,
    discountAmount: req.body.discountAmount,
    baseAmount: Number(booking.quotedAmount ?? 0),
    thresholds: normalizedThresholds,
  });
  if (!result.allowed) {
    throw ApiError.forbidden(
      `Your role (${req.staffAuth!.role}) may discount up to ${result.maxAllowedPercent}% (₹${result.maxAllowedAmount}); requested ₹${req.body.discountAmount} exceeds that`
    );
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { discountAmount: req.body.discountAmount, discountApprovedById: req.staffAuth!.userId },
  });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Booking', entityId: booking.id, action: 'APPLY_DISCOUNT', before: booking, after: updated });
  res.json(updated);
});

bookingsRouter.post('/:id/transition', requireStaffRole(...FLEET_MANAGERS), validateBody(bookingTransitionSchema), async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw ApiError.notFound('Booking not found');

  const nextStatus = assertBookingTransition(booking.status as BookingStatus, req.body.action) as BookingStatus;

  if (req.body.action === 'confirm') {
    const vehicleId = req.body.vehicleId ?? booking.vehicleId;
    if (!vehicleId) throw ApiError.badRequest('A vehicle must be assigned before confirming a booking', 'vehicleId');
    if (!booking.dropDateTime) throw ApiError.badRequest('dropDateTime must be set before confirming a booking', 'dropDateTime');

    await assertVehicleDocumentsValid(vehicleId);
    const overlap = await checkVehicleOverlap({
      vehicleId,
      start: booking.pickupDateTime,
      end: booking.dropDateTime,
      excludeBookingId: booking.id,
    });
    if (!overlap.available) throw ApiError.conflict(overlap.reason ?? 'Vehicle is not available for this window');

    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status: nextStatus, vehicleId } });
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Booking', entityId: booking.id, action: 'TRANSITION_CONFIRM', before: booking, after: updated });
    res.json(updated);
    return;
  }

  if (req.body.action === 'assignDuty') {
    if (!booking.vehicleId) throw ApiError.conflict('Booking has no vehicle assigned');
    if (!req.body.driverId) throw ApiError.badRequest('driverId is required to assign a duty', 'driverId');

    const [updated, duty] = await prisma.$transaction([
      prisma.booking.update({ where: { id: booking.id }, data: { status: nextStatus } }),
      prisma.duty.create({
        data: {
          branchId: booking.branchId,
          origin: 'BOOKING',
          bookingId: booking.id,
          driverId: req.body.driverId,
          vehicleId: booking.vehicleId,
          scheduledStart: booking.pickupDateTime,
          scheduledEnd: booking.dropDateTime,
          rateSnapshotJson: booking.rateSnapshotJson ?? undefined,
          clientMutationId: randomUUID(),
        },
      }),
    ]);
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Booking', entityId: booking.id, action: 'TRANSITION_ASSIGN_DUTY', before: booking, after: updated });
    res.json({ booking: updated, duty });
    return;
  }

  const data: Record<string, unknown> = { status: nextStatus };
  if (req.body.action === 'cancel' && req.body.cancellationChargeAmount !== undefined) {
    data.cancellationChargeAmount = req.body.cancellationChargeAmount;
  }
  const updated = await prisma.booking.update({ where: { id: booking.id }, data });
  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'Booking',
    entityId: booking.id,
    action: `TRANSITION_${req.body.action.toUpperCase()}`,
    before: booking,
    after: updated,
  });
  res.json(updated);
});

// ── Settlement: same duty-completion pipeline for local/outstation/airport bookings ──

bookingsRouter.get('/:id/settlement/preview', requireStaffRole(...ALL_STAFF), async (req, res) => {
  res.json(await previewBookingSettlement(req.params.id!));
});

bookingsRouter.post('/:id/settlement/confirm', requireStaffRole(...MONEY_MANAGERS), async (req, res) => {
  const invoice = await confirmBookingSettlement(req.params.id!, req.staffAuth!.userId);
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Invoice', entityId: invoice.id, action: 'GENERATE_FROM_BOOKING', after: invoice });
  await documentsQueue.add(JOB_NAMES.GENERATE_INVOICE_PDF, { invoiceId: invoice.id });
  res.json(invoice);
});
