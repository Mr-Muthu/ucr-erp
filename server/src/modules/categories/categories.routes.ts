import { z } from 'zod';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';

const categoryCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  defaultSeatingCapacity: z.coerce.number().int().min(1).max(60),
  description: z.string().optional(),
});

export const categoriesRouter = createCrudRouter({
  entity: 'VehicleCategory',
  delegate: prisma.vehicleCategory,
  createSchema: categoryCreateSchema,
  updateSchema: categoryCreateSchema.partial(),
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
});
