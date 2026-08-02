import { z } from 'zod';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { ALL_STAFF, MONEY_MANAGERS } from '../../lib/roleGroups.js';

const expenseCreateSchema = z.object({
  branchId: z.string().min(1),
  category: z.enum(['FUEL', 'TOLL', 'MAINTENANCE', 'INSURANCE', 'EMI', 'SALARY', 'CHALLAN', 'MISC']),
  vehicleId: z.string().optional(),
  dutyId: z.string().optional(),
  bookingId: z.string().optional(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  expenseDate: z.coerce.date().optional(),
  receiptFileKey: z.string().optional(),
});

export const expensesRouter = createCrudRouter({
  entity: 'Expense',
  delegate: prisma.expense,
  createSchema: expenseCreateSchema,
  updateSchema: expenseCreateSchema.partial(),
  readRoles: ALL_STAFF,
  writeRoles: MONEY_MANAGERS,
  softDelete: true,
  orderBy: { expenseDate: 'desc' },
  injectOnCreate: (req) => ({ paidById: req.staffAuth?.userId }),
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.category) where.category = query.category;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.branchId) where.branchId = query.branchId;
    return where;
  },
});
