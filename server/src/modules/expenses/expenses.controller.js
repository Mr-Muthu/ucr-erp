const { z } = require('zod');
const prisma = require('../../config/db');

const schema = z.object({
  category: z.enum(['FUEL', 'MAINTENANCE', 'SALARY', 'INSURANCE', 'MISC']),
  vehicleId: z.string().optional().nullable(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  expenseDate: z.coerce.date().optional(),
  paidBy: z.string().optional(),
});

async function list(req, res) {
  const { category, vehicleId } = req.query;
  const expenses = await prisma.expense.findMany({
    where: { ...(category ? { category } : {}), ...(vehicleId ? { vehicleId } : {}) },
    include: { vehicle: { select: { regNumber: true, make: true, model: true } } },
    orderBy: { expenseDate: 'desc' },
  });
  res.json(expenses);
}

async function create(req, res) {
  const data = schema.parse(req.body);
  const expense = await prisma.expense.create({ data });
  res.status(201).json(expense);
}

async function remove(req, res) {
  await prisma.expense.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, create, remove };
