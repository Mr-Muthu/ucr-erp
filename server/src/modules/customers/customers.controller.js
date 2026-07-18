const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(6),
  address: z.string().optional(),
  idProofType: z.string().optional(),
  idProofNumber: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.coerce.date().optional().nullable(),
});

async function list(req, res) {
  const { search } = req.query;
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};
  const customers = await prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(customers);
}

async function get(req, res) {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: { bookings: { orderBy: { createdAt: 'desc' } } },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');
  res.json(customer);
}

async function create(req, res) {
  const data = schema.parse(req.body);
  const customer = await prisma.customer.create({ data });
  res.status(201).json(customer);
}

async function update(req, res) {
  const data = schema.partial().parse(req.body);
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
  res.json(customer);
}

async function remove(req, res) {
  await prisma.customer.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, get, create, update, remove };
