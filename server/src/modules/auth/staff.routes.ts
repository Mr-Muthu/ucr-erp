import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { validateBody } from '../../middleware/validate.js';
import { authenticateStaff } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { staffLoginSchema, refreshSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const staffAuthRouter = Router();

staffAuthRouter.post('/login', authRateLimiter, validateBody(staffLoginSchema), async (req, res) => {
  const result = await authService.staffLogin(prisma, { ...req.body, ip: req.ip });
  res.json(result);
});

staffAuthRouter.post('/refresh', authRateLimiter, validateBody(refreshSchema), async (req, res) => {
  const result = await authService.staffRefresh(prisma, req.body.refreshToken, req.ip);
  res.json(result);
});

staffAuthRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
  await authService.staffLogout(prisma, req.body.refreshToken);
  res.status(204).send();
});

staffAuthRouter.get('/me', authenticateStaff, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.staffAuth?.userId } });
  if (!user) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  const { passwordHash: _passwordHash, ...safe } = user;
  res.json(safe);
});
