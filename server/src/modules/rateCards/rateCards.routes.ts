import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';
import { rateCardCreateSchema, rateCardItemCreateSchema } from './rateCards.schemas.js';

export const rateCardsRouter = Router();
rateCardsRouter.use(authenticateStaff);

rateCardsRouter.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.type) where.type = req.query.type;
  if (req.query.branchId) where.branchId = req.query.branchId;
  const cards = await prisma.rateCard.findMany({
    where,
    include: { items: { include: { category: true } } },
    orderBy: { effectiveFrom: 'desc' },
  });
  res.json({ data: cards });
});

rateCardsRouter.post('/', requireStaffRole(...FLEET_MANAGERS), validateBody(rateCardCreateSchema), async (req, res) => {
  const card = await prisma.rateCard.create({ data: req.body });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'RateCard', entityId: card.id, action: 'CREATE', after: card });
  res.status(201).json(card);
});

rateCardsRouter.post('/:id/items', requireStaffRole(...FLEET_MANAGERS), validateBody(rateCardItemCreateSchema), async (req, res) => {
  const card = await prisma.rateCard.findUnique({ where: { id: req.params.id } });
  if (!card) throw ApiError.notFound('Rate card not found');
  const item = await prisma.rateCardItem.create({ data: { ...req.body, rateCardId: card.id } });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'RateCardItem', entityId: item.id, action: 'CREATE', after: item });
  res.status(201).json(item);
});
