import { prisma } from './prisma.js';

const ACTIVE_BOOKING_STATUSES = ['CONFIRMED', 'DUTY_ASSIGNED', 'IN_PROGRESS'] as const;

/**
 * Application-level pre-check mirroring the Postgres exclusion constraints
 * in prisma/sql/constraints.sql — gives a friendly error before the DB
 * rejects it, but the DB constraint remains the actual source of truth
 * under concurrent writes (this check has a race window; the constraint
 * does not).
 */
export async function checkVehicleOverlap(params: {
  vehicleId: string;
  start: Date;
  end: Date;
  excludeBookingId?: string;
  excludeSegmentId?: string;
}): Promise<{ available: boolean; reason?: string }> {
  const overlappingBooking = await prisma.booking.findFirst({
    where: {
      vehicleId: params.vehicleId,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      ...(params.excludeBookingId ? { id: { not: params.excludeBookingId } } : {}),
      pickupDateTime: { lt: params.end },
      dropDateTime: { not: null, gt: params.start },
    },
  });
  if (overlappingBooking) {
    return { available: false, reason: `Overlapping booking ${overlappingBooking.bookingNumber}` };
  }

  const overlappingSegment = await prisma.deploymentVehicleSegment.findFirst({
    where: {
      vehicleId: params.vehicleId,
      ...(params.excludeSegmentId ? { id: { not: params.excludeSegmentId } } : {}),
      startDate: { lt: params.end },
      OR: [{ endDate: null }, { endDate: { gt: params.start } }],
    },
  });
  if (overlappingSegment) {
    return { available: false, reason: 'Vehicle is already deployed during this window' };
  }

  return { available: true };
}

/** Accounts for maintenance jobs too, per the /availability endpoint's spec ("bookings, deployments, maintenance, turnaround buffer"). */
export async function checkVehicleUnderMaintenance(vehicleId: string, start: Date, end: Date): Promise<boolean> {
  const job = await prisma.maintenanceJob.findFirst({
    where: {
      vehicleId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      OR: [
        { serviceDate: { gte: start, lte: end } },
        { serviceDate: null }, // an open/in-progress job with no fixed date is treated as blocking (unscheduled but active)
      ],
    },
  });
  return Boolean(job);
}
