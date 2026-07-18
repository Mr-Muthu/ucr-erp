const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const generateNumber = require('../../utils/generateNumber');

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().min(0),
});

const generateSchema = z.object({
  bookingId: z.string().min(1),
  taxRate: z.coerce.number().min(0).max(100).optional().default(0),
  discount: z.coerce.number().min(0).optional().default(0),
  dueDate: z.coerce.date().optional(),
  extraItems: z.array(itemSchema).optional().default([]),
});

async function computeAndPersistTotals(tx, invoiceId) {
  const items = await tx.invoiceItem.findMany({ where: { invoiceId } });
  const subtotal = items.reduce((sum, i) => sum + Number(i.amount), 0);
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  const totalAmount = subtotal + Number(invoice.taxAmount) - Number(invoice.discount);
  return tx.invoice.update({
    where: { id: invoiceId },
    data: { subtotal, totalAmount: Math.max(totalAmount, 0) },
  });
}

async function list(req, res) {
  const { status, customerId } = req.query;
  const invoices = await prisma.invoice.findMany({
    where: { ...(status ? { status } : {}), ...(customerId ? { customerId } : {}) },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      booking: { select: { id: true, bookingNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invoices);
}

async function get(req, res) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      booking: { include: { vehicle: true, driver: true } },
      items: true,
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  res.json(invoice);
}

// Generate an invoice from a booking: default line item is the booking's
// rental charge, plus any extra items (e.g. late fee, fuel surcharge).
async function generate(req, res) {
  const data = generateSchema.parse(req.body);

  const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const existing = await prisma.invoice.findUnique({ where: { bookingId: booking.id } });
  if (existing) throw new ApiError(409, 'An invoice already exists for this booking');

  const lineItems = [
    {
      description: `Rental charge — ${booking.bookingNumber}`,
      quantity: 1,
      unitPrice: Number(booking.totalAmount),
      amount: Number(booking.totalAmount),
    },
    ...data.extraItems.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: Number((i.quantity * i.unitPrice).toFixed(2)),
    })),
  ];

  const subtotal = lineItems.reduce((sum, i) => sum + i.amount, 0);
  const taxAmount = Number(((subtotal * data.taxRate) / 100).toFixed(2));
  const totalAmount = Math.max(subtotal + taxAmount - data.discount, 0);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: generateNumber('INV'),
      bookingId: booking.id,
      customerId: booking.customerId,
      subtotal,
      taxAmount,
      discount: data.discount,
      totalAmount,
      dueDate: data.dueDate,
      status: 'SENT',
      items: { create: lineItems },
    },
    include: { items: true, customer: true, booking: true },
  });

  res.status(201).json(invoice);
}

async function addItem(req, res) {
  const data = itemSchema.parse(req.body);
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  if (['PAID', 'CANCELLED'].includes(invoice.status)) {
    throw new ApiError(400, `Cannot modify a ${invoice.status.toLowerCase()} invoice`);
  }

  const amount = Number((data.quantity * data.unitPrice).toFixed(2));
  const result = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.create({ data: { ...data, amount, invoiceId: invoice.id } });
    return computeAndPersistTotals(tx, invoice.id);
  });
  res.status(201).json(result);
}

async function updateStatus(req, res) {
  const { status } = z
    .object({ status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']) })
    .parse(req.body);
  const invoice = await prisma.invoice.update({ where: { id: req.params.id }, data: { status } });
  res.json(invoice);
}

module.exports = { list, get, generate, addItem, updateStatus, computeAndPersistTotals };
