const router = require('express').Router();
const prisma = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

router.get('/summary', authenticate, async (req, res) => {
  const [
    totalVehicles,
    availableVehicles,
    bookedVehicles,
    inMaintenanceVehicles,
    activeBookings,
    pendingBookings,
    totalDrivers,
    totalCustomers,
    unpaidInvoices,
    revenueAgg,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: 'AVAILABLE' } }),
    prisma.vehicle.count({ where: { status: 'BOOKED' } }),
    prisma.vehicle.count({ where: { status: 'IN_MAINTENANCE' } }),
    prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'ONGOING'] } } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.driver.count({ where: { status: { not: 'INACTIVE' } } }),
    prisma.customer.count(),
    prisma.invoice.count({ where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } } }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
  ]);

  const recentBookings = await prisma.booking.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      vehicle: { select: { regNumber: true, make: true, model: true } },
    },
  });

  const expiringDocs = await prisma.vehicleDocument.count({
    where: {
      expiryDate: {
        gte: new Date(),
        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    },
  });

  res.json({
    fleet: {
      total: totalVehicles,
      available: availableVehicles,
      booked: bookedVehicles,
      inMaintenance: inMaintenanceVehicles,
    },
    bookings: { active: activeBookings, pending: pendingBookings },
    drivers: totalDrivers,
    customers: totalCustomers,
    billing: {
      unpaidInvoices,
      totalRevenue: revenueAgg._sum.amount || 0,
    },
    expiringDocuments: expiringDocs,
    recentBookings,
  });
});

module.exports = router;
