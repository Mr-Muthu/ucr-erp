import { z } from 'zod';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { ALL_STAFF, OWNER_ONLY } from '../../lib/roleGroups.js';

const branchCreateSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  address: z.string().optional(),
  gstin: z.string().optional(),
  stateCode: z.string().length(2),
  isDefault: z.boolean().optional(),
});

export const branchesRouter = createCrudRouter({
  entity: 'Branch',
  delegate: prisma.branch,
  createSchema: branchCreateSchema,
  updateSchema: branchCreateSchema.partial(),
  readRoles: ALL_STAFF,
  writeRoles: OWNER_ONLY,
  softDelete: true,
});
