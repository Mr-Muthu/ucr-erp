import { z } from 'zod';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';

const challanCreateSchema = z.object({
  vehicleId: z.string().min(1),
  dutyId: z.string().optional(),
  bookingId: z.string().optional(),
  challanNumber: z.string().optional(),
  violationDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  status: z.enum(['OPEN', 'RECOVERABLE_PENDING', 'RECOVERED', 'WAIVED', 'PAID']).optional(),
  isRecoverable: z.boolean().optional(),
  recoveredFromDriverId: z.string().optional(),
  notes: z.string().optional(),
});

export const challansRouter = createCrudRouter({
  entity: 'Challan',
  delegate: prisma.challan,
  createSchema: challanCreateSchema,
  updateSchema: challanCreateSchema.partial(),
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
  orderBy: { violationDate: 'desc' },
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.status) where.status = query.status;
    return where;
  },
});
