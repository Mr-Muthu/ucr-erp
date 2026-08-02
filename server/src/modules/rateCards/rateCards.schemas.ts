import { z } from 'zod';

export const rateCardCreateSchema = z.object({
  branchId: z.string().min(1),
  type: z.enum(['LOCAL_PACKAGE', 'OUTSTATION', 'AIRPORT_TRANSFER', 'FIXED_DUTY_MONTHLY']),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
});

export const rateCardItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  slabLabel: z.string().optional(),
  slabHours: z.coerce.number().int().min(0).optional(),
  slabKm: z.coerce.number().int().min(0).optional(),
  slabBaseRate: z.coerce.number().min(0).optional(),
  extraKmRate: z.coerce.number().min(0).optional(),
  extraHourRate: z.coerce.number().min(0).optional(),
  perKmRate: z.coerce.number().min(0).optional(),
  minKmPerDay: z.coerce.number().int().min(0).optional(),
  driverBattaPerDay: z.coerce.number().min(0).optional(),
  nightHaltRate: z.coerce.number().min(0).optional(),
  routeLabel: z.string().optional(),
  flatRate: z.coerce.number().min(0).optional(),
  fixedMonthlyAmount: z.coerce.number().min(0).optional(),
  includedKm: z.coerce.number().int().min(0).optional(),
  includedHours: z.coerce.number().int().min(0).optional(),
  fixedExtraKmRate: z.coerce.number().min(0).optional(),
  fixedExtraHourRate: z.coerce.number().min(0).optional(),
  hsnSac: z.string().optional(),
});
