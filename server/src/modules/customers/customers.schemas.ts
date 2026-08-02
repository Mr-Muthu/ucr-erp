import { z } from 'zod';

export const customerCreateSchema = z.object({
  branchId: z.string().min(1),
  type: z.enum(['INDIVIDUAL', 'BUSINESS']).optional(),
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  address: z.string().optional(),
  idProofType: z.string().optional(),
  idProofNumber: z.string().optional(),
  gstin: z.string().optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const blacklistSchema = z.object({
  isBlacklisted: z.boolean(),
  blacklistReason: z.string().optional(),
});
