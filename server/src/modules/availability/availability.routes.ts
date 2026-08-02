import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticateStaff, requireStaffRole } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';
import { getSetting } from '../../lib/settings.js';
import { ALL_STAFF } from '../../lib/roleGroups.js';
import { checkVehicleOverlap, checkVehicleUnderMaintenance } from '../../lib/vehicleAvailability.js';

const availabilityQuerySchema = z.object({
  categoryId: z.string().min(1),
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export const availabilityRouter = Router();

// GET /availability?categoryId&start&end — accounts for bookings,
// deployments, maintenance, AND the configurable turnaround buffer (spec:
// "accounts for bookings, deployments, maintenance, turnaround buffer").
availabilityRouter.get('/', authenticateStaff, requireStaffRole(...ALL_STAFF), validateQuery(availabilityQuerySchema), async (req, res) => {
  const { categoryId, start, end } = req.query as unknown as { categoryId: string; start: Date; end: Date };

  const bufferMinutes = await getSetting(prisma, 'vehicle.turnaroundBuffer.minutes', 60);
  const bufferedStart = new Date(start.getTime() - bufferMinutes * 60_000);
  const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60_000);

  const vehicles = await prisma.vehicle.findMany({
    where: { categoryId, status: { notIn: ['RETIRED', 'BLOCKED'] }, deletedAt: null },
  });

  const results = await Promise.all(
    vehicles.map(async (vehicle) => {
      const overlap = await checkVehicleOverlap({ vehicleId: vehicle.id, start: bufferedStart, end: bufferedEnd });
      const underMaintenance = await checkVehicleUnderMaintenance(vehicle.id, bufferedStart, bufferedEnd);
      const available = overlap.available && !underMaintenance;
      return {
        vehicleId: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        make: vehicle.make,
        model: vehicle.model,
        available,
        reason: available ? undefined : (underMaintenance ? 'Under maintenance' : overlap.reason),
      };
    })
  );

  res.json({ data: results, meta: { bufferMinutes } });
});
