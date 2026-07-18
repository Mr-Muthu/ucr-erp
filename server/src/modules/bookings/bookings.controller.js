const { z } = require('zod');
const prisma = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const generateNumber = require('../../utils/generateNumber');

const ACTIVE_STATUSES = ['CONFIRMED', 'ONGOING'];

const createSchema = z.object({
  customerId: z.string().min(1),
  vehicleId: z.string().min(1),
  driverId: z.string().optional().nullable(),
  pickupLocation: z.string().min(1),
  dropLocation: z.string().optional(),
  pickupDateTime: z.coerce.date(),
  dropDateTime: z.coerce.date(),
  rateType: z.enum(['DAILY', 'HOURLY', 'TRIP']).optional(),
  rateAmount: z.coerce.number().min(0),
  totalAmount: z.coerce.number().min(0).optional(),
  advanceAmount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

const updateSchema = createSchema.partial();

const statusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED']),
  odometer: z.coerce.number().int().min(0).optional(),
});

function computeTotal({ rateType, rateAmount, pickupDateTime, dropDateTime }) {
  const ms = new Date(dropDateTime) - new Date(pickupDateTime);
  const hours = Math.max(ms / (1000 * 60 * 60), 1);
  if (rateType === 'HOURLY') return Number((rateAmount * hours).toFixed(2));
  if (rateType === 'DAILY') return Number((rateAmount * Math.max(Math.ceil(hours / 24), 1)).toFixed(2));
  return Number(rateAmount); // TRIP = flat rate
}

async function checkVehicleAvailability({ vehicleId, pickupDateTime, dropDateTime, excludeBookingId }) {
  const overlapping = await prisma.booking.findFirst({
    where: {
      vehicleId,
      status: { in: ACTIVE_STATUSES },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      pickupDateTime: { lt: new Date(dropDateTime) },
      dropDateTime: { gt: new Date(pickupDateTime) },
    },
  });
  return !overlapping;
}

async function availability(req, res) {
  const { vehicleId, pickupDateTime, dropDateTime, excludeBookingId } = req.query;
  if (!vehicleId || !pickupDateTime || !dropDateTime) {
    throw new ApiError(400, 'vehicleId, pickupDateTime and dropDateTime are required');
  }
  const available = await checkVehicleAvailability({ vehicleId, pickupDateTime, dropDateTime, excludeBookingId });
  res.json({ available });
}

async function list(req, res) {
  const { status, vehicleId, customerId } = req.query;
  const bookings = await prisma.booking.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(customerId ? { customerId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      vehicle: { select: { id: true, regNumber: true, make: true, model: true } },
      driver: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(bookings);
}

async function get(req, res) {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      vehicle: true,
      driver: true,
      tripAssignment: true,
      invoice: true,
    },
  });
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.json(booking);
}

async function create(req, res) {
  const data = createSchema.parse(req.body);

  const available = await checkVehicleAvailability(data);
  if (!available) throw new ApiError(409, 'This vehicle is already booked for the selected time range');

  const totalAmount = data.totalAmount ?? computeTotal(data);

  const booking = await prisma.booking.create({
    data: {
      ...data,
      bookingNumber: generateNumber('BK'),
      rateType: data.rateType || 'DAILY',
      totalAmount,
      advanceAmount: data.advanceAmount || 0,
    },
    include: { customer: true, vehicle: true, driver: true },
  });

  res.status(201).json(booking);
}

async function update(req, res) {
  const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError(404, 'Booking not found');
  if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
    throw new ApiError(400, `Cannot edit a booking that is already ${existing.status.toLowerCase()}`);
  }

  const data = updateSchema.parse(req.body);

  if (data.vehicleId || data.pickupDateTime || data.dropDateTime) {
    const available = await checkVehicleAvailability({
      vehicleId: data.vehicleId || existing.vehicleId,
      pickupDateTime: data.pickupDateTime || existing.pickupDateTime,
      dropDateTime: data.dropDateTime || existing.dropDateTime,
      excludeBookingId: existing.id,
    });
    if (!available) throw new ApiError(409, 'This vehicle is already booked for the selected time range');
  }

  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data,
    include: { customer: true, vehicle: true, driver: true },
  });
  res.json(booking);
}

async function updateStatus(req, res) {
  const { status, odometer } = statusSchema.parse(req.body);
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updateData = { status };

    if (status === 'CONFIRMED') {
      await tx.vehicle.update({ where: { id: booking.vehicleId }, data: { status: 'BOOKED' } });
    }

    if (status === 'ONGOING') {
      updateData.actualPickupDateTime = now;
      if (booking.driverId) {
        await tx.tripAssignment.upsert({
          where: { bookingId: booking.id },
          create: {
            bookingId: booking.id,
            driverId: booking.driverId,
            vehicleId: booking.vehicleId,
            startOdometer: odometer,
            startTime: now,
          },
          update: { startOdometer: odometer, startTime: now },
        });
        await tx.driver.update({ where: { id: booking.driverId }, data: { status: 'ON_TRIP' } });
      }
      await tx.vehicle.update({ where: { id: booking.vehicleId }, data: { status: 'BOOKED' } });
    }

    if (status === 'COMPLETED') {
      updateData.actualDropDateTime = now;
      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'AVAILABLE', ...(odometer ? { odometer } : {}) },
      });
      if (booking.driverId) {
        await tx.tripAssignment.updateMany({
          where: { bookingId: booking.id },
          data: { endOdometer: odometer, endTime: now },
        });
        await tx.driver.update({ where: { id: booking.driverId }, data: { status: 'ACTIVE' } });
      }
    }

    if (status === 'CANCELLED') {
      await tx.vehicle.update({ where: { id: booking.vehicleId }, data: { status: 'AVAILABLE' } });
      if (booking.driverId) {
        await tx.driver.update({ where: { id: booking.driverId }, data: { status: 'ACTIVE' } });
      }
    }

    return tx.booking.update({
      where: { id: booking.id },
      data: updateData,
      include: { customer: true, vehicle: true, driver: true },
    });
  });

  res.json(result);
}

async function remove(req, res) {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (ACTIVE_STATUSES.includes(booking.status)) {
    throw new ApiError(400, 'Cancel the booking before deleting it');
  }
  await prisma.booking.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, get, create, update, updateStatus, remove, availability };
