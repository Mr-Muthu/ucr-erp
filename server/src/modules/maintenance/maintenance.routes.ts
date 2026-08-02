import { z } from 'zod';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';

const maintenanceCreateSchema = z.object({
  vehicleId: z.string().min(1),
  type: z.enum(['SCHEDULED', 'BREAKDOWN']),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  description: z.string().min(1),
  cost: z.coerce.number().min(0).optional(),
  odometerAtService: z.coerce.number().int().min(0).optional(),
  serviceDate: z.coerce.date().optional(),
  nextDueDate: z.coerce.date().optional(),
  nextDueOdometer: z.coerce.number().int().min(0).optional(),
  vendor: z.string().optional(),
});

export const maintenanceRouter = createCrudRouter({
  entity: 'MaintenanceJob',
  delegate: prisma.maintenanceJob,
  createSchema: maintenanceCreateSchema,
  updateSchema: maintenanceCreateSchema.partial(),
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.status) where.status = query.status;
    return where;
  },
});
