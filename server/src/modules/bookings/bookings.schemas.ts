import { z } from 'zod';

export const bookingCreateSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  type: z.enum(['LOCAL_PACKAGE', 'OUTSTATION', 'AIRPORT_TRANSFER']),
  rateCardItemId: z.string().min(1),
  pickupLocation: z.string().min(1),
  dropLocation: z.string().optional(),
  pickupDateTime: z.coerce.date(),
  dropDateTime: z.coerce.date().optional(),
  outstationDays: z.coerce.number().int().min(1).optional(),
  vehicleId: z.string().optional(),
  advanceAmount: z.coerce.number().min(0).optional(),
});

export const bookingUpdateSchema = z.object({
  pickupLocation: z.string().min(1).optional(),
  dropLocation: z.string().optional(),
  pickupDateTime: z.coerce.date().optional(),
  dropDateTime: z.coerce.date().optional(),
  outstationDays: z.coerce.number().int().min(1).optional(),
  vehicleId: z.string().optional(),
  advanceAmount: z.coerce.number().min(0).optional(),
});

export const bookingTransitionSchema = z.object({
  action: z.enum(['quote', 'confirm', 'assignDuty', 'startTrip', 'complete', 'close', 'cancel', 'noShow']),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  cancellationChargeAmount: z.coerce.number().min(0).optional(),
});

export const bookingDiscountSchema = z.object({
  discountAmount: z.coerce.number().min(0),
});
