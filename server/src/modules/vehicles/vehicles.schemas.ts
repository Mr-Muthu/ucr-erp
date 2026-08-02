import { z } from 'zod';

export const vehicleCreateSchema = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1),
  registrationNumber: z.string().min(4).max(20),
  make: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().optional(),
  year: z.coerce.number().int().min(1980).max(2100),
  fuelType: z.string().min(1),
  transmission: z.string().min(1),
  seats: z.coerce.number().int().min(1).max(60),
  ownership: z.enum(['OWNED', 'LEASED', 'SUBVENDOR']).optional(),
  subVendorName: z.string().optional(),
  subVendorRevenueSharePct: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(['AVAILABLE', 'DEPLOYED', 'ON_TRIP', 'IN_MAINTENANCE', 'BLOCKED', 'RETIRED']).optional(),
  currentOdometer: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial();

export const vehicleDocumentSchema = z.object({
  type: z.enum(['RC', 'INSURANCE', 'PUC', 'PERMIT', 'FITNESS', 'TAX']),
  documentNumber: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  fileKey: z.string().optional(),
});

export const documentOverrideSchema = z.object({
  overrideReason: z.string().min(3),
});
