import { z } from 'zod';

export const dutyDeclineSchema = z.object({ reason: z.string().min(3) });

export const dutyStartSchema = z.object({
  deviceStartAt: z.coerce.date(),
  openingOdometer: z.coerce.number().int().min(0),
  openingOdometerPhotoKey: z.string().optional(),
  startGpsLat: z.coerce.number().optional(),
  startGpsLng: z.coerce.number().optional(),
});

export const dutyCompleteSchema = z.object({
  deviceEndAt: z.coerce.date(),
  closingOdometer: z.coerce.number().int().min(0),
  closingOdometerPhotoKey: z.string().optional(),
  endGpsLat: z.coerce.number().optional(),
  endGpsLng: z.coerce.number().optional(),
  passengerSignatureKey: z.string().optional(),
  passengerName: z.string().optional(),
  driverFeedbackNote: z.string().optional(),
  driverFeedbackTags: z.array(z.string()).optional(),
});

export const dutyEntrySchema = z.object({
  clientMutationId: z.string().min(1),
  type: z.enum(['TOLL', 'PARKING', 'OTHER']),
  amount: z.coerce.number().positive(),
  receiptPhotoKey: z.string().optional(),
  reimbursableToDriver: z.boolean().optional(),
});

export const nightHaltSchema = z.object({
  clientMutationId: z.string().min(1),
  haltDate: z.coerce.date(),
  notes: z.string().optional(),
});
