const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const schema = z.object({
  userId: z.string().optional().nullable(),
  name: z.string().min(2),
  phone: z.string().min(6),
  licenseNumber: z.string().min(2),
  licenseExpiry: z.coerce.date().optional().nullable(),
  address: z.string().optional(),
  joiningDate: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'ON_TRIP', 'ON_LEAVE', 'INACTIVE']).optional(),
  salary: z.coerce.number().min(0).optional().nullable(),
});

async function list(req, res) {
  const { status, search } = req.query;
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { licenseNumber: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const drivers = await prisma.driver.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(drivers);
}

async function get(req, res) {
  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    include: { bookings: { orderBy: { createdAt: 'desc' }, take: 20 }, tripAssignments: true },
  });
  if (!driver) throw new ApiError(404, 'Driver not found');
  res.json(driver);
}

async function create(req, res) {
  const data = schema.parse(req.body);
  const driver = await prisma.driver.create({ data });
  res.status(201).json(driver);
}

async function update(req, res) {
  const data = schema.partial().parse(req.body);
  const driver = await prisma.driver.update({ where: { id: req.params.id }, data });
  res.json(driver);
}

async function remove(req, res) {
  await prisma.driver.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, get, create, update, remove };
