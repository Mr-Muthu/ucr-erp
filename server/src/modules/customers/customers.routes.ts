import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS, OWNER_ONLY } from '../../lib/roleGroups.js';
import { customerCreateSchema, customerUpdateSchema, blacklistSchema } from './customers.schemas.js';

export const customersRouter = createCrudRouter({
  entity: 'Customer',
  delegate: prisma.customer,
  createSchema: customerCreateSchema,
  updateSchema: customerUpdateSchema,
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
  softDelete: true,
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.search) {
      const term = String(query.search);
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }
    return where;
  },
});

// Blacklist toggle is OWNER-only per the spec's "blacklist flag with OWNER override".
customersRouter.patch('/:id/blacklist', authenticateStaff, requireStaffRole(...OWNER_ONLY), validateBody(blacklistSchema), async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw ApiError.notFound('Customer not found');
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      isBlacklisted: req.body.isBlacklisted,
      blacklistReason: req.body.blacklistReason,
      blacklistOverrideById: req.staffAuth?.userId,
    },
  });
  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'Customer',
    entityId: customer.id,
    action: req.body.isBlacklisted ? 'BLACKLIST' : 'UNBLACKLIST',
    before: customer,
    after: updated,
  });
  res.json(updated);
});
