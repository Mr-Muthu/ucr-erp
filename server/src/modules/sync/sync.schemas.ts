import { z } from 'zod';

const baseItem = {
  clientMutationId: z.string().min(1),
  clientTimestamp: z.coerce.date(),
};

export const syncItemSchema = z.discriminatedUnion('type', [
  z.object({ ...baseItem, type: z.literal('DUTY_ACCEPT'), dutyId: z.string().min(1) }),
  z.object({ ...baseItem, type: z.literal('DUTY_DECLINE'), dutyId: z.string().min(1), reason: z.string().min(3) }),
  z.object({
    ...baseItem,
    type: z.literal('DUTY_START'),
    dutyId: z.string().min(1),
    deviceStartAt: z.coerce.date(),
    openingOdometer: z.coerce.number().int().min(0),
    openingOdometerPhotoKey: z.string().optional(),
    startGpsLat: z.coerce.number().optional(),
    startGpsLng: z.coerce.number().optional(),
  }),
  z.object({
    ...baseItem,
    type: z.literal('DUTY_COMPLETE'),
    dutyId: z.string().min(1),
    deviceEndAt: z.coerce.date(),
    closingOdometer: z.coerce.number().int().min(0),
    closingOdometerPhotoKey: z.string().optional(),
    endGpsLat: z.coerce.number().optional(),
    endGpsLng: z.coerce.number().optional(),
    passengerSignatureKey: z.string().optional(),
    passengerName: z.string().optional(),
    driverFeedbackNote: z.string().optional(),
    driverFeedbackTags: z.array(z.string()).optional(),
  }),
  z.object({ ...baseItem, type: z.literal('DUTY_SUBMIT'), dutyId: z.string().min(1) }),
  z.object({ ...baseItem, type: z.literal('DUTY_RESUBMIT'), dutyId: z.string().min(1) }),
  z.object({
    ...baseItem,
    type: z.literal('DUTY_ENTRY'),
    dutyId: z.string().min(1),
    entryType: z.enum(['TOLL', 'PARKING', 'OTHER']),
    amount: z.coerce.number().positive(),
    receiptPhotoKey: z.string().optional(),
    reimbursableToDriver: z.boolean().optional(),
  }),
  z.object({
    ...baseItem,
    type: z.literal('DUTY_NIGHT_HALT'),
    dutyId: z.string().min(1),
    haltDate: z.coerce.date(),
    notes: z.string().optional(),
  }),
]);

export const syncRequestSchema = z.object({
  items: z.array(syncItemSchema).min(1).max(200),
});

export type SyncItem = z.infer<typeof syncItemSchema>;
