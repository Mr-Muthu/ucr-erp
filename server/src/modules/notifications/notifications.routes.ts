import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { parsePageParams, buildPageResult } from '../../lib/pagination.js';
import { ALL_STAFF } from '../../lib/roleGroups.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticateStaff);

notificationsRouter.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const { limit, page } = parsePageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = { branchId: req.staffAuth!.branchId };
  if (req.query.status) where.status = req.query.status;
  const rows = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...page });
  res.json(buildPageResult(rows, limit));
});
