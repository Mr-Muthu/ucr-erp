import { prisma } from '../lib/prisma.js';
import { getSetting } from '../lib/settings.js';
import { queueNotification } from '../lib/notify.js';
import { businessLog } from '../lib/logger.js';

/**
 * Runs once daily (see queue.ts's upsertJobScheduler). Mirrors the exact
 * same alert conditions as GET /dashboard/summary's alerts block — the
 * dashboard tells staff "this needs attention today"; this job is what
 * actually pushes that same fact out as a notification, using the same
 * Setting-driven lead time so the two never drift apart.
 */
export async function scanExpiries() {
  const now = new Date();
  const branches = await prisma.branch.findMany({ where: { deletedAt: null } });
  let queued = 0;

  for (const branch of branches) {
    const alertLeadDays = await getSetting(prisma, 'document.expiry.alertLeadDays', 30);
    const alertThreshold = new Date(now.getTime() + alertLeadDays * 86_400_000);

    const expiringDocs = await prisma.vehicleDocument.findMany({
      where: { vehicle: { branchId: branch.id }, expiryDate: { lte: alertThreshold, gte: now }, overrideAt: null, deletedAt: null },
      include: { vehicle: { select: { registrationNumber: true } } },
    });
    for (const doc of expiringDocs) {
      const result = await queueNotification({
        branchId: branch.id,
        type: 'VEHICLE_DOCUMENT_EXPIRY',
        entity: 'VehicleDocument',
        entityId: doc.id,
        subject: `${doc.type} expiring soon — ${doc.vehicle.registrationNumber}`,
        message: `${doc.type} for vehicle ${doc.vehicle.registrationNumber} expires on ${doc.expiryDate?.toDateString()}.`,
      });
      if (result) queued++;
    }

    const expiringLicenses = await prisma.driver.findMany({
      where: { branchId: branch.id, licenseExpiry: { lte: alertThreshold, gte: now }, licenseOverrideAt: null, deletedAt: null },
    });
    for (const driver of expiringLicenses) {
      const result = await queueNotification({
        branchId: branch.id,
        type: 'DRIVER_LICENSE_EXPIRY',
        entity: 'Driver',
        entityId: driver.id,
        subject: `Driving license expiring soon — ${driver.name}`,
        message: `${driver.name}'s driving license expires on ${driver.licenseExpiry?.toDateString()}.`,
      });
      if (result) queued++;
    }

    const overdueInvoices = await prisma.invoice.findMany({
      where: { branchId: branch.id, status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: now } },
      include: { vendor: { select: { companyName: true } }, customer: { select: { name: true } } },
    });
    for (const inv of overdueInvoices) {
      const result = await queueNotification({
        branchId: branch.id,
        type: 'INVOICE_OVERDUE',
        entity: 'Invoice',
        entityId: inv.id,
        subject: `Invoice overdue — ${inv.invoiceNumber}`,
        message: `Invoice ${inv.invoiceNumber} for ${inv.vendor?.companyName ?? inv.customer?.name ?? 'a customer'} (Rs. ${inv.totalAmount}) is past its due date.`,
      });
      if (result) queued++;
    }
  }

  businessLog.info({ queued }, 'Expiry/overdue scan complete');
  return { queued };
}
