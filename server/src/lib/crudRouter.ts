import { Router } from 'express';
import type { StaffRole } from '@prisma/client';
import { z, type ZodTypeAny } from 'zod';
import { prisma } from './prisma.js';
import { authenticateStaff, requireStaffRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { parsePageParams, buildPageResult } from './pagination.js';
import { recordAudit, auditActorFromRequest } from './auditLog.js';
import { ApiError } from './apiError.js';

const listQuerySchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().optional(), search: z.string().optional() }).passthrough();

/**
 * Generic list/get/create/update/(soft-)delete router for the straightforward
 * resources (vehicles, drivers, customers, vendors, expenses, maintenance,
 * challans, rate-card headers). Domain-specific routes with real business
 * logic (bookings, duties, deployments, invoices, reconciliations) are
 * hand-written, not built on this. Delegate typing is intentionally loose
 * (`any`) — every input is Zod-validated before it reaches Prisma, which is
 * the "validated boundary" the no-`any` rule allows an exception for.
 */
export interface CrudRouterOptions {
  entity: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: any;
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
  readRoles: StaffRole[];
  writeRoles: StaffRole[];
  deleteRoles?: StaffRole[];
  softDelete?: boolean;
  buildWhere?: (query: Record<string, unknown>) => Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  /** Merged into the create payload after Zod validation — e.g. stamping paidById from the authenticated staff user. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  injectOnCreate?: (req: import('express').Request) => Record<string, unknown>;
}

export function createCrudRouter(opts: CrudRouterOptions): Router {
  const router = Router();
  const orderBy = opts.orderBy ?? { id: 'desc' };
  const baseWhere = () => (opts.softDelete ? { deletedAt: null } : {});

  router.use(authenticateStaff);

  router.get('/', requireStaffRole(...opts.readRoles), validateQuery(listQuerySchema), async (req, res) => {
    const { limit, page } = parsePageParams(req.query as Record<string, unknown>);
    const where = { ...baseWhere(), ...(opts.buildWhere ? opts.buildWhere(req.query as Record<string, unknown>) : {}) };
    const rows = await opts.delegate.findMany({ where, orderBy, include: opts.include, ...page });
    res.json(buildPageResult(rows, limit));
  });

  router.get('/:id', requireStaffRole(...opts.readRoles), async (req, res) => {
    const row = await opts.delegate.findFirst({ where: { id: req.params.id, ...baseWhere() }, include: opts.include });
    if (!row) throw ApiError.notFound(`${opts.entity} not found`);
    res.json(row);
  });

  router.post('/', requireStaffRole(...opts.writeRoles), validateBody(opts.createSchema), async (req, res) => {
    const data = { ...req.body, ...(opts.injectOnCreate ? opts.injectOnCreate(req) : {}) };
    const created = await opts.delegate.create({ data, include: opts.include });
    await recordAudit(prisma, auditActorFromRequest(req), { entity: opts.entity, entityId: created.id, action: 'CREATE', after: created });
    res.status(201).json(created);
  });

  router.patch('/:id', requireStaffRole(...opts.writeRoles), validateBody(opts.updateSchema), async (req, res) => {
    const before = await opts.delegate.findFirst({ where: { id: req.params.id, ...baseWhere() } });
    if (!before) throw ApiError.notFound(`${opts.entity} not found`);
    const updated = await opts.delegate.update({ where: { id: req.params.id }, data: req.body, include: opts.include });
    await recordAudit(prisma, auditActorFromRequest(req), { entity: opts.entity, entityId: updated.id, action: 'UPDATE', before, after: updated });
    res.json(updated);
  });

  router.delete('/:id', requireStaffRole(...(opts.deleteRoles ?? opts.writeRoles)), async (req, res) => {
    const before = await opts.delegate.findFirst({ where: { id: req.params.id, ...baseWhere() } });
    if (!before) throw ApiError.notFound(`${opts.entity} not found`);
    if (opts.softDelete) {
      await opts.delegate.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    } else {
      await opts.delegate.delete({ where: { id: req.params.id } });
    }
    await recordAudit(prisma, auditActorFromRequest(req), { entity: opts.entity, entityId: req.params.id!, action: 'DELETE', before });
    res.status(204).send();
  });

  return router;
}
