import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';
import { MONEY_MANAGERS } from '../../lib/roleGroups.js';
import { computeProfitAndLoss } from '../../reporting/profitAndLoss.js';
import { computeAgingReport } from '../../reporting/agingReport.js';
import { computeDriverPayablesLedger } from '../../reporting/driverPayablesLedger.js';
import { computeGstSummary } from '../../reporting/gstSummary.js';

export const reportsRouter = Router();
reportsRouter.use(authenticateStaff);
reportsRouter.use(requireStaffRole(...MONEY_MANAGERS));

const dateRangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

reportsRouter.get('/pnl', validateQuery(dateRangeSchema), async (req, res) => {
  const { from, to } = req.query as unknown as z.infer<typeof dateRangeSchema>;
  const branchId = req.staffAuth!.branchId;

  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({ where: { branchId, issueDate: { gte: from, lte: to } }, select: { type: true, status: true, taxableValue: true } }),
    prisma.expense.findMany({ where: { branchId, expenseDate: { gte: from, lte: to }, deletedAt: null }, select: { category: true, amount: true } }),
  ]);

  const result = computeProfitAndLoss(
    invoices.map((i) => ({ type: i.type, status: i.status, taxableValue: Number(i.taxableValue) })),
    expenses.map((e) => ({ category: e.category, amount: Number(e.amount) }))
  );
  res.json({ period: { from, to }, ...result });
});

const asOfSchema = z.object({ asOf: z.coerce.date().optional() });

reportsRouter.get('/aging', validateQuery(asOfSchema), async (req, res) => {
  const { asOf } = req.query as unknown as z.infer<typeof asOfSchema>;
  const branchId = req.staffAuth!.branchId;

  const invoices = await prisma.invoice.findMany({
    where: { branchId, status: { notIn: ['PAID', 'VOID'] } },
    include: { vendor: { select: { companyName: true } }, customer: { select: { name: true } } },
  });

  const result = computeAgingReport(
    invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      status: i.status,
      totalAmount: Number(i.totalAmount),
      amountPaid: Number(i.amountPaid),
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      counterpartyName: i.vendor?.companyName ?? i.customer?.name ?? 'Unknown',
    })),
    asOf ?? new Date()
  );
  res.json(result);
});

const periodMonthSchema = z.object({ periodMonth: z.string().regex(/^\d{4}-\d{2}$/, 'periodMonth must be YYYY-MM') });

reportsRouter.get('/driver-payables', validateQuery(periodMonthSchema), async (req, res) => {
  const { periodMonth } = req.query as unknown as z.infer<typeof periodMonthSchema>;
  const branchId = req.staffAuth!.branchId;

  const entries = await prisma.driverPayableEntry.findMany({
    where: { periodMonth, driver: { branchId } },
    include: { driver: { select: { name: true } } },
  });

  const result = computeDriverPayablesLedger(
    entries.map((e) => ({ driverId: e.driverId, driverName: e.driver.name, type: e.type, amount: Number(e.amount) }))
  );
  res.json({ periodMonth, drivers: result });
});

reportsRouter.get('/gst-summary', validateQuery(dateRangeSchema), async (req, res) => {
  const { from, to } = req.query as unknown as z.infer<typeof dateRangeSchema>;
  const branchId = req.staffAuth!.branchId;

  const invoices = await prisma.invoice.findMany({
    where: { branchId, issueDate: { gte: from, lte: to } },
    select: { status: true, taxType: true, taxableValue: true, cgstAmount: true, sgstAmount: true, igstAmount: true, totalAmount: true },
  });

  const result = computeGstSummary(
    invoices.map((i) => ({
      status: i.status,
      taxType: i.taxType,
      taxableValue: Number(i.taxableValue),
      cgstAmount: Number(i.cgstAmount),
      sgstAmount: Number(i.sgstAmount),
      igstAmount: Number(i.igstAmount),
      totalAmount: Number(i.totalAmount),
    }))
  );
  res.json({ period: { from, to }, ...result });
});
