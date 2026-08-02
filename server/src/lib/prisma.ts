import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var __ucrPrisma: PrismaClient | undefined;
}

// Reuse a single client across tsx watch-mode reloads in dev to avoid
// exhausting Postgres connections.
export const prisma =
  global.__ucrPrisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV === 'development') {
  global.__ucrPrisma = prisma;
}
