import { z } from 'zod';

export const deploymentCreateSchema = z
  .object({
    branchId: z.string().min(1),
    counterpartyType: z.enum(['VENDOR', 'CUSTOMER']),
    vendorId: z.string().optional(),
    customerId: z.string().optional(),
    vendorRateCardItemId: z.string().optional(),
    customerRateCardItemId: z.string().optional(),
    defaultDriverId: z.string().optional(),
    startDate: z.coerce.date(),
    vehicleId: z.string().min(1),
    openingOdometer: z.coerce.number().int().min(0),
  })
  .refine(
    (data) =>
      data.counterpartyType === 'VENDOR'
        ? Boolean(data.vendorId && data.vendorRateCardItemId && !data.customerId)
        : Boolean(data.customerId && data.customerRateCardItemId && !data.vendorId),
    { message: 'Exactly one counterparty (vendor or customer) and its matching rate card item must be set' }
  );

export const deploymentEndSchema = z.object({
  endDate: z.coerce.date().optional(),
  closingOdometer: z.coerce.number().int().min(0),
});

export const replaceVehicleSchema = z.object({
  newVehicleId: z.string().min(1),
  effectiveDate: z.coerce.date().optional(),
  closingOdometerForOldVehicle: z.coerce.number().int().min(0),
  openingOdometerForNewVehicle: z.coerce.number().int().min(0),
  replacementReason: z.string().min(3),
});
