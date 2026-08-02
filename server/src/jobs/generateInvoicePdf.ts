import { prisma } from '../lib/prisma.js';
import { uploadBuffer } from '../lib/r2.js';
import { renderInvoicePdf } from '../lib/pdf/invoicePdf.js';
import { env } from '../config/env.js';

export async function generateInvoicePdf(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } }, vendor: true, customer: true, branch: true },
  });
  if (!invoice) return;

  const buffer = await renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    supplierName: env.COMPANY_LEGAL_NAME,
    supplierGstin: invoice.supplierGstin,
    supplierAddress: invoice.branch.address ?? '',
    recipientName: invoice.vendor?.companyName ?? invoice.customer?.name ?? 'Customer',
    recipientGstin: invoice.recipientGstin,
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    taxType: invoice.taxType,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      hsnSac: li.hsnSac,
      quantity: li.quantity.toString(),
      unitRate: li.unitRate.toString(),
      taxableValue: li.taxableValue.toString(),
      gstRatePct: li.gstRatePct.toString(),
      lineTotal: li.lineTotal.toString(),
    })),
    taxableValue: invoice.taxableValue.toString(),
    cgstAmount: invoice.cgstAmount.toString(),
    sgstAmount: invoice.sgstAmount.toString(),
    igstAmount: invoice.igstAmount.toString(),
    roundingAdjustment: invoice.roundingAdjustment.toString(),
    totalAmount: invoice.totalAmount.toString(),
    amountPaid: invoice.amountPaid.toString(),
  });

  const fileKey = await uploadBuffer({ buffer, purpose: 'invoices', contentType: 'application/pdf', extension: 'pdf' });
  await prisma.invoice.update({ where: { id: invoiceId }, data: { pdfFileKey: fileKey } });
  return fileKey;
}
