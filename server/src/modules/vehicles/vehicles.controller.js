const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const vehicleSchema = z.object({
  regNumber: z.string().min(2),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1980),
  category: z.string().min(1),
  seatingCapacity: z.coerce.number().int().min(1),
  fuelType: z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'CNG']).optional(),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']).optional(),
  color: z.string().optional(),
  odometer: z.coerce.number().int().min(0).optional(),
  status: z.enum(['AVAILABLE', 'BOOKED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE']).optional(),
  dailyRate: z.coerce.number().min(0),
  hourlyRate: z.coerce.number().min(0).optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  insuranceExpiry: z.coerce.date().optional().nullable(),
  permitExpiry: z.coerce.date().optional().nullable(),
  pucExpiry: z.coerce.date().optional().nullable(),
  notes: z.string().optional(),
});

async function list(req, res) {
  const { status, search } = req.query;
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { regNumber: { contains: search, mode: 'insensitive' } },
            { make: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const vehicles = await prisma.vehicle.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(vehicles);
}

async function get(req, res) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: req.params.id },
    include: { documents: true, maintenance: { orderBy: { serviceDate: 'desc' } } },
  });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  res.json(vehicle);
}

async function create(req, res) {
  const data = vehicleSchema.parse(req.body);
  const vehicle = await prisma.vehicle.create({ data });
  res.status(201).json(vehicle);
}

async function update(req, res) {
  const data = vehicleSchema.partial().parse(req.body);
  const vehicle = await prisma.vehicle.update({ where: { id: req.params.id }, data });
  res.json(vehicle);
}

async function remove(req, res) {
  await prisma.vehicle.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

// ── Vehicle documents ──

const documentSchema = z.object({
  type: z.enum(['RC', 'INSURANCE', 'PERMIT', 'PUC', 'FITNESS', 'OTHER']),
  documentNumber: z.string().optional(),
  issueDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  fileUrl: z.string().optional(),
});

async function addDocument(req, res) {
  const data = documentSchema.parse(req.body);
  const doc = await prisma.vehicleDocument.create({
    data: { ...data, vehicleId: req.params.id },
  });
  res.status(201).json(doc);
}

async function removeDocument(req, res) {
  await prisma.vehicleDocument.delete({ where: { id: req.params.docId } });
  res.status(204).send();
}

async function expiringDocuments(req, res) {
  const days = Number(req.query.days || 30);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  const docs = await prisma.vehicleDocument.findMany({
    where: { expiryDate: { lte: threshold, gte: new Date() } },
    include: { vehicle: { select: { regNumber: true, make: true, model: true } } },
    orderBy: { expiryDate: 'asc' },
  });
  res.json(docs);
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  addDocument,
  removeDocument,
  expiringDocuments,
};
