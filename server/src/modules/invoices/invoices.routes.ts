import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAudit, auditActorFromRequest } from '../../lib/auditLog.js';
import { ApiError } from '../../lib/apiError.js';
import { ALL_STAFF, MONEY_MANAGERS, OWNER_ONLY } from '../../lib/roleGroups.js';
import { parsePageParams, buildPageResult } from '../../lib/pagination.js';
import { nextSequenceNumber, formatCreditNoteNumber } from '../../lib/invoiceNumbering.js';
import { documentsQueue, JOB_NAMES } from '../../lib/queue.js';
import { resolveDownload } from '../../lib/r2.js';
import { invoiceVoidSchema, paymentCreateSchema } from './invoices.schemas.js';

export const invoicesRouter = Router();
invoicesRouter.use(authenticateStaff);

invoicesRouter.get('/', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const { limit, page } = parsePageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.type) where.type = req.query.type;
  if (req.query.vendorId) where.vendorId = req.query.vendorId;
  if (req.query.customerId) where.customerId = req.query.customerId;
  const rows = await prisma.invoice.findMany({
    where,
    include: { vendor: { select: { companyName: true } }, customer: { select: { name: true } } },
    orderBy: { id: 'desc' },
    ...page,
  });
  res.json(buildPageResult(rows, limit));
});

invoicesRouter.get('/:id', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { lineItems: true, vendor: true, customer: true, booking: true, paymentAllocations: { include: { payment: true } }, creditNotes: true },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  res.json(invoice);
});

// OWNER-only per the spec's permission map: "OWNER can void invoices".
// Immutable-once-issued: corrections only via CreditNote, never edited in place.
invoicesRouter.post('/:id/void', requireStaffRole(...OWNER_ONLY), validateBody(invoiceVoidSchema), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { lineItems: true } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === 'VOID') throw ApiError.conflict('Invoice is already void');

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const { financialYear, sequenceNumber } = await nextSequenceNumber(tx, 'CREDIT_NOTE', now);
    const creditNote = await tx.creditNote.create({
      data: {
        creditNoteNumber: formatCreditNoteNumber(financialYear, sequenceNumber),
        financialYear,
        sequenceNumber,
        invoiceId: invoice.id,
        reason: req.body.reason,
        taxableValue: invoice.taxableValue,
        cgstAmount: invoice.cgstAmount,
        sgstAmount: invoice.sgstAmount,
        igstAmount: invoice.igstAmount,
        totalAmount: invoice.totalAmount,
        issuedById: req.staffAuth!.userId,
        lineItems: { create: invoice.lineItems.map((li) => ({ description: `Reversal: ${li.description}`, amount: li.lineTotal })) },
      },
    });
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VOID', voidedAt: now, voidedById: req.staffAuth!.userId, voidReason: req.body.reason },
    });
    return { invoice: updatedInvoice, creditNote };
  });

  await recordAudit(prisma, auditActorFromRequest(req), {
    entity: 'Invoice',
    entityId: invoice.id,
    action: 'VOID',
    before: invoice,
    after: result,
  });
  await documentsQueue.add(JOB_NAMES.GENERATE_CREDIT_NOTE_PDF, { creditNoteId: result.creditNote.id });
  res.json(result);
});

// Download (or, for OWNER/MONEY_MANAGERS, force-regenerate) the invoice PDF.
// Generation is async — a freshly finalized invoice may not have its
// pdfFileKey set yet, hence 202 rather than 404 in that case.
invoicesRouter.get('/:id/pdf', requireStaffRole(...ALL_STAFF), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, select: { pdfFileKey: true } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (!invoice.pdfFileKey) {
    res.status(202).json({ code: 'PDF_PENDING', message: 'PDF is still being generated — try again shortly' });
    return;
  }
  const download = await resolveDownload(invoice.pdfFileKey);
  if (download.kind === 'redirect') {
    res.redirect(download.url);
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.send(download.buffer);
  }
});

invoicesRouter.post('/:id/pdf', requireStaffRole(...MONEY_MANAGERS), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  await documentsQueue.add(JOB_NAMES.GENERATE_INVOICE_PDF, { invoiceId: invoice.id });
  res.status(202).json({ code: 'PDF_QUEUED', message: 'Regeneration queued' });
});

invoicesRouter.post('/:id/payments', requireStaffRole(...MONEY_MANAGERS), validateBody(paymentCreateSchema), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === 'VOID') throw ApiError.conflict('Cannot record a payment against a void invoice');

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        branchId: invoice.branchId,
        mode: req.body.mode,
        amount: req.body.amount,
        reference: req.body.reference,
        receivedById: req.staffAuth!.userId,
        vendorId: invoice.vendorId,
        customerId: invoice.customerId,
      },
    });
    await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: invoice.id, amount: req.body.amount } });
    const amountPaid = Number(invoice.amountPaid) + req.body.amount;
    const status = amountPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';
    const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });
    return { payment, invoice: updatedInvoice };
  });

  await recordAudit(prisma, auditActorFromRequest(req), { entity: 'Payment', entityId: result.payment.id, action: 'CREATE', after: result });
  res.status(201).json(result);
});
