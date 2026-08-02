import { prisma } from '../lib/prisma.js';
import { uploadBuffer } from '../lib/r2.js';
import { renderCreditNotePdf } from '../lib/pdf/creditNotePdf.js';
import { env } from '../config/env.js';

export async function generateCreditNotePdf(creditNoteId: string) {
  const creditNote = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
    include: { lineItems: true, invoice: { include: { vendor: true, customer: true } } },
  });
  if (!creditNote) return;

  const buffer = await renderCreditNotePdf({
    creditNoteNumber: creditNote.creditNoteNumber,
    againstInvoiceNumber: creditNote.invoice.invoiceNumber,
    reason: creditNote.reason,
    issueDate: creditNote.issueDate,
    supplierName: env.COMPANY_LEGAL_NAME,
    supplierGstin: creditNote.invoice.supplierGstin,
    recipientName: creditNote.invoice.vendor?.companyName ?? creditNote.invoice.customer?.name ?? 'Customer',
    recipientGstin: creditNote.invoice.recipientGstin,
    lineItems: creditNote.lineItems.map((li) => ({ description: li.description, amount: li.amount.toString() })),
    taxableValue: creditNote.taxableValue.toString(),
    cgstAmount: creditNote.cgstAmount.toString(),
    sgstAmount: creditNote.sgstAmount.toString(),
    igstAmount: creditNote.igstAmount.toString(),
    totalAmount: creditNote.totalAmount.toString(),
    taxType: creditNote.invoice.taxType,
  });

  const fileKey = await uploadBuffer({ buffer, purpose: 'credit-notes', contentType: 'application/pdf', extension: 'pdf' });
  await prisma.creditNote.update({ where: { id: creditNoteId }, data: { pdfFileKey: fileKey } });
  return fileKey;
}
