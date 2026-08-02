import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { validateBody } from '../../middleware/validate.js';
import { authenticateDriver } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { driverLoginSchema, refreshSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const driverAuthRouter = Router();

driverAuthRouter.post('/login', authRateLimiter, validateBody(driverLoginSchema), async (req, res) => {
  const result = await authService.driverLogin(prisma, { ...req.body, ip: req.ip });
  res.json(result);
});

driverAuthRouter.post('/refresh', authRateLimiter, validateBody(refreshSchema), async (req, res) => {
  const result = await authService.driverRefresh(prisma, req.body.refreshToken, req.ip);
  res.json(result);
});

driverAuthRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
  await authService.driverLogout(prisma, req.body.refreshToken);
  res.status(204).send();
});

driverAuthRouter.get('/me', authenticateDriver, async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { id: req.driverAuth?.driverId } });
  if (!driver) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Driver not found' });
    return;
  }
  res.json({ id: driver.id, name: driver.name, phone: driver.phone, status: driver.status, branchId: driver.branchId });
});
