import { z } from 'zod';

export const invoiceVoidSchema = z.object({
  reason: z.string().min(5),
});

export const paymentCreateSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'BANK', 'CARD', 'CHEQUE']),
  amount: z.coerce.number().positive(),
  reference: z.string().optional(),
});
