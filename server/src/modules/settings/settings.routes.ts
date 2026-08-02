import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, OWNER_ONLY } from '../../lib/roleGroups.js';

export const settingsRouter = Router();
settingsRouter.use(authenticateStaff);

// Read-only for everyone (staff need to see current thresholds/defaults);
// write is OWNER-only since these are the business numbers the spec
// explicitly calls out as configurable-not-hardcoded.
settingsRouter.get('/', requireStaffRole(...ALL_STAFF), async (_req, res) => {
  const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
  res.json({ data: settings });
});

const updateSchema = z.object({ value: z.any(), description: z.string().optional() });

settingsRouter.patch('/:key', requireStaffRole(...OWNER_ONLY), validateBody(updateSchema), async (req, res) => {
  const before = await prisma.setting.findUnique({ where: { key: req.params.key } });
  if (!before) throw ApiError.notFound('Setting not found');
  const updated = await prisma.setting.update({
    where: { key: req.params.key },
    data: { value: req.body.value, description: req.body.description ?? before.description },
  });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Setting', entityId: updated.id, action: 'UPDATE', before, after: updated });
  res.json(updated);
});
