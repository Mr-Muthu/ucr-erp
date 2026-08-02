import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { ALL_STAFF } from '../../lib/roleGroups.js';
import { getSetting } from '../../lib/settings.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticateStaff);

/**
 * Small, purpose-built aggregation for the command dashboard — added in
 * Phase 3 because the screen needs cross-entity roll-ups (duties-today by
 * status, deployment board, alerts, MTD revenue split) that would otherwise
 * mean the client fanning out across a dozen paginated list endpoints and
 * aggregating client-side. Everything here is read-only.
 */
dashboardRouter.get('/summary', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const branchId = req.staffAuth!.branchId;
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [dutiesToday, deployments, invoices] = await Promise.all([
    prisma.duty.findMany({
      where: { branchId, scheduledStart: { gte: todayStart, lt: todayEnd } },
      include: {
        driver: { select: { name: true } },
        vehicle: { select: { registrationNumber: true } },
        vendor: { select: { companyName: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.vehicleDeployment.findMany({
      where: { branchId, status: 'ACTIVE' },
      include: {
        vendor: { select: { companyName: true } },
        customer: { select: { name: true } },
        vehicleSegments: { where: { endDate: null }, include: { vehicle: { select: { registrationNumber: true } } } },
      },
    }),
    prisma.invoice.findMany({
      where: { branchId, issueDate: { gte: monthStart }, status: { not: 'VOID' } },
      select: { type: true, totalAmount: true },
    }),
  ]);

  const dutiesByStatus: Record<string, number> = {};
  for (const duty of dutiesToday) dutiesByStatus[duty.status] = (dutiesByStatus[duty.status] ?? 0) + 1;

  const mtdRevenueB2B = invoices
    .filter((i) => i.type === 'VENDOR_MONTHLY' || i.type === 'CUSTOMER_FIXED_DUTY_MONTHLY')
    .reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const mtdRevenueB2C = invoices.filter((i) => i.type === 'BOOKING').reduce((sum, i) => sum + Number(i.totalAmount), 0);

  const alertLeadDays = await getSetting(prisma, 'document.expiry.alertLeadDays', 30);
  const alertThreshold = new Date(now.getTime() + alertLeadDays * 86_400_000);

  const [expiringDocs, expiringLicenses, overdueInvoices, disputedDuties, unbilledApproved, maintenanceDue] = await Promise.all([
    prisma.vehicleDocument.count({ where: { expiryDate: { lte: alertThreshold, gte: now }, overrideAt: null, deletedAt: null } }),
    prisma.driver.count({ where: { branchId, licenseExpiry: { lte: alertThreshold, gte: now }, licenseOverrideAt: null } }),
    prisma.invoice.count({ where: { branchId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: now } } }),
    prisma.duty.count({ where: { branchId, status: 'DISPUTED' } }),
    prisma.duty.count({ where: { branchId, status: 'APPROVED' } }),
    prisma.maintenanceJob.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, OR: [{ nextDueDate: { lte: alertThreshold } }, { nextDueDate: null }] },
    }),
  ]);

  res.json({
    dutiesToday: {
      total: dutiesToday.length,
      byStatus: dutiesByStatus,
      items: dutiesToday.slice(0, 20),
    },
    deploymentBoard: deployments.map((d) => ({
      id: d.id,
      counterpartyType: d.counterpartyType,
      counterpartyName: d.vendor?.companyName ?? d.customer?.name ?? 'Unknown',
      vehicle: d.vehicleSegments[0]?.vehicle?.registrationNumber ?? null,
      startDate: d.startDate,
    })),
    alerts: {
      expiringDocuments: expiringDocs,
      expiringLicenses,
      overdueInvoices,
      disputedDuties,
      unbilledApprovedDuties: unbilledApproved,
      maintenanceDue,
    },
    mtdRevenue: { b2b: mtdRevenueB2B, b2c: mtdRevenueB2C, total: mtdRevenueB2B + mtdRevenueB2C },
  });
});
