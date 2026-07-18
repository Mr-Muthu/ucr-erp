const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const schema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'ONLINE']).optional(),
  reference: z.string().optional(),
  receivedBy: z.string().optional(),
});

async function list(req, res) {
  const { invoiceId } = req.query;
  const payments = await prisma.payment.findMany({
    where: { ...(invoiceId ? { invoiceId } : {}) },
    include: { invoice: { select: { invoiceNumber: true, totalAmount: true } } },
    orderBy: { paidAt: 'desc' },
  });
  res.json(payments);
}

async function create(req, res) {
  const data = schema.parse(req.body);

  const invoice = await prisma.invoice.findUnique({ where: { id: data.invoiceId } });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  if (invoice.status === 'CANCELLED') throw new ApiError(400, 'Cannot record a payment against a cancelled invoice');

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({ data });

    const amountPaid = Number(invoice.amountPaid) + data.amount;
    const status = amountPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, status } });

    return payment;
  });

  res.status(201).json(result);
}

module.exports = { list, create };
