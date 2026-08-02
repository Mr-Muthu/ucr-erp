import { z } from 'zod';

export const driverCreateSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2),
  phone: z.string().min(6),
  licenseNumber: z.string().min(2),
  licenseClass: z.string().optional(),
  licenseExpiry: z.coerce.date().optional(),
  payoutModel: z.enum(['MONTHLY_SALARY', 'PER_DUTY', 'HYBRID']).optional(),
  monthlySalary: z.coerce.number().min(0).optional(),
  perDutyRate: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional(),
  address: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
});

export const driverUpdateSchema = driverCreateSchema.partial();

export const licenseOverrideSchema = z.object({
  overrideReason: z.string().min(3),
});
