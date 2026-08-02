import { z } from 'zod';

export const dutyCreateSchema = z
  .object({
    branchId: z.string().min(1),
    vendorId: z.string().optional(),
    vendorRateCardItemId: z.string().optional(),
    deploymentId: z.string().optional(),
    driverId: z.string().min(1),
    vehicleId: z.string().min(1),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date().optional(),
    passengerName: z.string().optional(),
    passengerPhone: z.string().optional(),
    routeRemarks: z.string().optional(),
  })
  .refine((data) => Boolean(data.deploymentId) !== Boolean(data.vendorId), {
    message: 'Set exactly one of deploymentId (dedicated) or vendorId (spot duty) — booking-linked duties are created via POST /bookings/:id/transition {action: "assignDuty"}',
  });

export const dutyStaffTransitionSchema = z.object({
  action: z.enum(['approve', 'dispute', 'reject', 'resolve']),
  reason: z.string().optional(),
});
