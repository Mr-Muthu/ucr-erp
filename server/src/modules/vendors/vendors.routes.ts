import { Router } from 'express';
import { createCrudRouter } from '../../lib/crudRouter.js';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS } from '../../lib/roleGroups.js';
import { vendorCreateSchema, vendorUpdateSchema, vendorRateCardCreateSchema, vendorRateCardItemCreateSchema } from './vendors.schemas.js';

export const vendorsRouter = createCrudRouter({
  entity: 'Vendor',
  delegate: prisma.vendor,
  createSchema: vendorCreateSchema,
  updateSchema: vendorUpdateSchema,
  readRoles: ALL_STAFF,
  writeRoles: FLEET_MANAGERS,
  softDelete: true,
  buildWhere: (query) => {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) where.companyName = { contains: String(query.search), mode: 'insensitive' };
    return where;
  },
});

// ── Nested: vendor rate cards (versioned, per engagement type) ──

const rateCardsRouter = Router({ mergeParams: true });
rateCardsRouter.use(authenticateStaff);

rateCardsRouter.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const cards = await prisma.vendorRateCard.findMany({
    where: { vendorId: req.params.id },
    include: { items: { include: { category: true } } },
    orderBy: { effectiveFrom: 'desc' },
  });
  res.json({ data: cards });
});

rateCardsRouter.post('/', requireStaffRole(...FLEET_MANAGERS), validateBody(vendorRateCardCreateSchema), async (req, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id } });
  if (!vendor) throw ApiError.notFound('Vendor not found');
  const card = await prisma.vendorRateCard.create({ data: { ...req.body, vendorId: req.params.id } });
  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'VendorRateCard', entityId: card.id, action: 'CREATE', after: card });
  res.status(201).json(card);
});

rateCardsRouter.post(
  '/:rateCardId/items',
  requireStaffRole(...FLEET_MANAGERS),
  validateBody(vendorRateCardItemCreateSchema),
  async (req, res) => {
    const card = await prisma.vendorRateCard.findFirst({ where: { id: req.params.rateCardId, vendorId: req.params.id } });
    if (!card) throw ApiError.notFound('Rate card not found');
    const item = await prisma.vendorRateCardItem.create({ data: { ...req.body, rateCardId: card.id } });
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'VendorRateCardItem', entityId: item.id, action: 'CREATE', after: item });
    res.status(201).json(item);
  }
);

vendorsRouter.use('/:id/rate-cards', rateCardsRouter);
