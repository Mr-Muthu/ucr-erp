import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ApiError } from './lib/apiError.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticateStaff, authenticateDriver } from './middleware/auth.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { generateOpenApiDocument } from './lib/openapi.js';
import './lib/openapi.paths.js'; // registers the representative OpenAPI paths as a side effect

import { staffAuthRouter } from './modules/auth/staff.routes.js';
import { driverAuthRouter } from './modules/auth/driver.routes.js';
import { branchesRouter } from './modules/branches/branches.routes.js';
import { categoriesRouter } from './modules/categories/categories.routes.js';
import { vehiclesRouter } from './modules/vehicles/vehicles.routes.js';
import { driversRouter } from './modules/drivers/drivers.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { vendorsRouter } from './modules/vendors/vendors.routes.js';
import { rateCardsRouter } from './modules/rateCards/rateCards.routes.js';
import { deploymentsRouter } from './modules/deployments/deployments.routes.js';
import { bookingsRouter } from './modules/bookings/bookings.routes.js';
import { dutiesRouter } from './modules/duties/duties.routes.js';
import { driverDutiesRouter } from './modules/duties/driverDuties.routes.js';
import { syncRouter } from './modules/sync/sync.routes.js';
import { expensesRouter } from './modules/expenses/expenses.routes.js';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes.js';
import { challansRouter } from './modules/challans/challans.routes.js';
import { invoicesRouter } from './modules/invoices/invoices.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { availabilityRouter } from './modules/availability/availability.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { createUploadsRouter } from './modules/uploads/uploads.routes.js';
import { createReconciliationsRouter } from './modules/reconciliations/reconciliations.routes.js';

export const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy — without this,
// express-rate-limit and req.ip both see the proxy's IP for every request
// instead of the real client's, making IP-based rate limiting useless.
app.set('trust proxy', 1);

// CSP disabled: this is a JSON API plus one swagger-ui docs page, and
// helmet's default CSP blocks swagger-ui's inline scripts/styles. The other
// headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.) still apply.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id = typeof existing === 'string' ? existing : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/openapi.json', (_req, res) => {
  res.json(generateOpenApiDocument());
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerUrl: '/api/openapi.json' }));

// Coarse ceiling on the actual API surface — registered after /api/health
// and /api/docs so platform health-check polling and doc browsing are never
// throttled, only real API traffic.
app.use('/api/v1', apiRateLimiter);
app.use('/api/driver/v1', apiRateLimiter);

// ── Staff API (/api/v1) ──
const v1 = express.Router();
v1.use('/auth', staffAuthRouter);
v1.use('/branches', branchesRouter);
v1.use('/categories', categoriesRouter);
v1.use('/vehicles', vehiclesRouter);
v1.use('/drivers', driversRouter);
v1.use('/customers', customersRouter);
v1.use('/vendors', vendorsRouter);
v1.use('/vendors/:id/reconciliations', createReconciliationsRouter('VENDOR'));
v1.use('/customers/:id/reconciliations', createReconciliationsRouter('CUSTOMER'));
v1.use('/rate-cards', rateCardsRouter);
v1.use('/deployments', deploymentsRouter);
v1.use('/bookings', bookingsRouter);
v1.use('/duties', dutiesRouter);
v1.use('/expenses', expensesRouter);
v1.use('/maintenance', maintenanceRouter);
v1.use('/challans', challansRouter);
v1.use('/invoices', invoicesRouter);
v1.use('/availability', availabilityRouter);
v1.use('/dashboard', dashboardRouter);
v1.use('/settings', settingsRouter);
v1.use('/notifications', notificationsRouter);
v1.use('/reports', reportsRouter);
v1.use('/uploads', createUploadsRouter(authenticateStaff));
app.use('/api/v1', v1);

// ── Driver API (/api/driver/v1) — narrower surface, driver-scoped by token ──
const driverV1 = express.Router();
driverV1.use('/auth', driverAuthRouter);
driverV1.use('/duties', driverDutiesRouter);
driverV1.use('/sync', syncRouter);
driverV1.use('/uploads', createUploadsRouter(authenticateDriver));
app.use('/api/driver/v1', driverV1);

app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' }));

if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app, {
    // ApiError/ZodError/known Prisma errors are already handled cleanly as
    // 4xx responses by errorHandler below — reporting them to Sentry would
    // just be noise. Only genuinely unexpected errors are worth alerting on.
    shouldHandleError: (error) =>
      !(error instanceof ApiError) && !(error instanceof ZodError) && !(error instanceof Prisma.PrismaClientKnownRequestError),
  });
}
app.use(errorHandler);
