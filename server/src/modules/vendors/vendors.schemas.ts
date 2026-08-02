import { z } from 'zod';
import { isValidGstinChecksum, isValidGstinFormat } from '../../lib/gstin.js';

const gstinSchema = z
  .string()
  .refine(isValidGstinFormat, 'Invalid GSTIN format')
  .refine(isValidGstinChecksum, 'Invalid GSTIN checksum');

export const vendorCreateSchema = z.object({
  branchId: z.string().min(1),
  companyName: z.string().min(2),
  gstin: gstinSchema,
  billingAddress: z.string().min(3),
  placeOfSupplyStateCode: z.string().length(2),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  billingCycleDay: z.coerce.number().int().min(1).max(28).optional(),
  creditTermDays: z.coerce.number().int().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLACKLISTED']).optional(),
});

export const vendorUpdateSchema = vendorCreateSchema.partial();

export const vendorRateCardCreateSchema = z.object({
  engagementType: z.enum(['DEDICATED_MONTHLY', 'SPOT_DUTY']),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
});

const dedicatedMonthlyItemFields = {
  fixedMonthlyAmount: z.coerce.number().min(0).optional(),
  includedKm: z.coerce.number().int().min(0).optional(),
  includedHours: z.coerce.number().int().min(0).optional(),
  extraKmRate: z.coerce.number().min(0).optional(),
  extraHourRate: z.coerce.number().min(0).optional(),
  driverOvertimeHourlyRate: z.coerce.number().min(0).optional(),
  nightHaltRate: z.coerce.number().min(0).optional(),
  outstationBattaRate: z.coerce.number().min(0).optional(),
  fuelResponsibility: z.enum(['VENDOR_FUEL', 'UCR_FUEL']).optional(),
};

const spotDutyItemFields = {
  slabLabel: z.string().optional(),
  slabHours: z.coerce.number().int().min(0).optional(),
  slabKm: z.coerce.number().int().min(0).optional(),
  slabBaseRate: z.coerce.number().min(0).optional(),
  extraKmRateSpot: z.coerce.number().min(0).optional(),
  extraHourRateSpot: z.coerce.number().min(0).optional(),
};

export const vendorRateCardItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  hsnSac: z.string().optional(),
  ...dedicatedMonthlyItemFields,
  ...spotDutyItemFields,
});
