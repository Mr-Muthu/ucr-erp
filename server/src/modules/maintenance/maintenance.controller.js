const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const schema = z.object({
  vehicleId: z.string().min(1),
  type: z.enum(['SERVICE', 'REPAIR', 'INSPECTION']).optional(),
  description: z.string().min(1),
  cost: z.coerce.number().min(0).optional(),
  odometerAtService: z.coerce.number().int().min(0).optional(),
  serviceDate: z.coerce.date().optional(),
  nextServiceDue: z.coerce.date().optional().nullable(),
  vendor: z.string().optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']).optional(),
});

async function list(req, res) {
  const { vehicleId, status } = req.query;
  const records = await prisma.maintenanceRecord.findMany({
    where: { ...(vehicleId ? { vehicleId } : {}), ...(status ? { status } : {}) },
    include: { vehicle: { select: { regNumber: true, make: true, model: true } } },
    orderBy: { serviceDate: 'desc' },
  });
  res.json(records);
}

async function create(req, res) {
  const data = schema.parse(req.body);
  const record = await prisma.maintenanceRecord.create({ data });

  if (data.status === 'IN_PROGRESS') {
    await prisma.vehicle.update({
      where: { id: data.vehicleId },
      data: { status: 'IN_MAINTENANCE' },
    });
  }

  res.status(201).json(record);
}

async function update(req, res) {
  const data = schema.partial().parse(req.body);
  const record = await prisma.maintenanceRecord.update({ where: { id: req.params.id }, data });

  if (data.status === 'COMPLETED') {
    await prisma.vehicle.update({
      where: { id: record.vehicleId },
      data: { status: 'AVAILABLE', odometer: record.odometerAtService ?? undefined },
    });
  } else if (data.status === 'IN_PROGRESS') {
    await prisma.vehicle.update({ where: { id: record.vehicleId }, data: { status: 'IN_MAINTENANCE' } });
  }

  res.json(record);
}

async function remove(req, res) {
  await prisma.maintenanceRecord.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, create, update, remove };
