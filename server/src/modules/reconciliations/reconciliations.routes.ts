import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, FLEET_MANAGERS, MONEY_MANAGERS } from '../../lib/roleGroups.js';
import { documentsQueue, JOB_NAMES } from '../../lib/queue.js';
import * as service from './reconciliation.service.js';

const lineAdjustSchema = z.object({
  claimedAmount: z.coerce.number().optional(),
  disputeStatus: z.enum(['NONE', 'OPEN', 'ADJUSTED', 'ACCEPTED']).optional(),
  adjustmentAmount: z.coerce.number().optional(),
  adjustmentReason: z.string().optional(),
});

/** Mounted as /vendors/:id/reconciliations and /customers/:id/reconciliations — one implementation, two counterparty types, per the Phase 1 "one billing engine" design. */
export function createReconciliationsRouter(counterpartyType: 'VENDOR' | 'CUSTOMER'): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticateStaff);
  const idField = counterpartyType === 'VENDOR' ? 'vendorId' : 'customerId';

  router.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
    const list = await prisma.monthlyReconciliation.findMany({
      where: { counterpartyType, [idField]: req.params.id },
      include: { lines: true },
      orderBy: { periodStart: 'desc' },
    });
    res.json({ data: list });
  });

  router.post('/:period/prepare', requireStaffRole(...FLEET_MANAGERS), async (req, res) => {
    // Split into two branches rather than selecting a Prisma delegate by
    // ternary — a union of two delegates' overloaded findUnique signatures
    // isn't callable as one, since TS can't unify the overload sets.
    const counterparty =
      counterpartyType === 'VENDOR'
        ? await prisma.vendor.findUnique({ where: { id: req.params.id! } })
        : await prisma.customer.findUnique({ where: { id: req.params.id! } });
    if (!counterparty) throw ApiError.notFound(`${counterpartyType === 'VENDOR' ? 'Vendor' : 'Customer'} not found`);
    const branchId = counterparty.branchId;

    const reconciliation = await service.prepareReconciliation({
      branchId,
      period: req.params.period!,
      ...(counterpartyType === 'VENDOR' ? { counterpartyType: 'VENDOR' as const, vendorId: req.params.id! } : { counterpartyType: 'CUSTOMER' as const, customerId: req.params.id! }),
    });
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'MonthlyReconciliation', entityId: reconciliation.id, action: 'PREPARE' });
    res.json(reconciliation);
  });

  router.post('/:period/statement', requireStaffRole(...FLEET_MANAGERS), async (req, res) => {
    const reconciliation = await findByPeriod(counterpartyType, idField, req.params.id!, req.params.period!);
    const updated = await service.generateStatement(reconciliation.id);
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'MonthlyReconciliation', entityId: reconciliation.id, action: 'STATEMENT' });
    res.json(updated);
  });

  router.patch('/:period/lines/:lineId', requireStaffRole(...MONEY_MANAGERS), validateBody(lineAdjustSchema), async (req, res) => {
    const updated = await service.adjustLine(req.params.lineId!, req.body);
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'ReconciliationLine', entityId: req.params.lineId!, action: 'ADJUST', after: updated });
    res.json(updated);
  });

  router.post('/:period/finalize', requireStaffRole(...MONEY_MANAGERS), async (req, res) => {
    const reconciliation = await findByPeriod(counterpartyType, idField, req.params.id!, req.params.period!);
    const invoice = await service.finalizeReconciliation(reconciliation.id, req.staffAuth!.userId);
    await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Invoice', entityId: invoice.id, action: 'GENERATE_FROM_RECONCILIATION', after: invoice });
    await documentsQueue.add(JOB_NAMES.GENERATE_INVOICE_PDF, { invoiceId: invoice.id });
    res.json(invoice);
  });

  return router;
}

async function findByPeriod(counterpartyType: 'VENDOR' | 'CUSTOMER', idField: string, id: string, period: string) {
  const { monthPeriodBounds } = await import('../../lib/financialYear.js');
  const { periodStart, periodEnd } = monthPeriodBounds(period);
  const reconciliation = await prisma.monthlyReconciliation.findFirst({
    where: { counterpartyType, [idField]: id, periodStart, periodEnd },
    include: { lines: true },
  });
  if (!reconciliation) throw ApiError.notFound('Reconciliation not found — run prepare first');
  return reconciliation;
}
