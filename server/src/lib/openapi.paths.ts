import { z } from 'zod';
import { openApiRegistry, bearerAuth } from './openapi.js';

/**
 * Representative OpenAPI path registrations — covers the auth flows and the
 * business endpoints unique to this system (duty transitions, sync,
 * availability, reconciliation, booking settlement). The ~30 simple CRUD
 * resource routes (vehicles, drivers, customers, etc.) follow one identical
 * list/get/create/update/delete shape (see src/lib/crudRouter.ts) and are
 * intentionally not each hand-documented here — that would be repetition,
 * not information. This file is what makes `/api/docs` render something
 * real rather than an empty shell.
 */

const errorSchema = z.object({ code: z.string(), message: z.string(), field: z.string().optional() }).openapi('ApiError');

openApiRegistry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Liveness check',
  responses: { 200: { description: 'OK' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/v1/auth/login',
  summary: 'Staff login (email + password)',
  request: {
    body: { content: { 'application/json': { schema: z.object({ email: z.string().email(), password: z.string() }) } } },
  },
  responses: {
    200: { description: 'Access + refresh token pair', content: { 'application/json': { schema: z.object({ accessToken: z.string(), refreshToken: z.string() }) } } },
    401: { description: 'Invalid credentials', content: { 'application/json': { schema: errorSchema } } },
    423: { description: 'Account locked', content: { 'application/json': { schema: errorSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/driver/v1/auth/login',
  summary: 'Driver login (phone + PIN, device-bound)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            phone: z.string(),
            pin: z.string(),
            device: z.object({ clientDeviceId: z.string(), expoPushToken: z.string().optional() }),
          }),
        },
      },
    },
  },
  responses: { 200: { description: 'Access + refresh token pair' }, 401: { description: 'Invalid credentials' }, 403: { description: 'Deactivated account' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/v1/duties/{id}/transition',
  summary: 'Staff duty state-machine transition (approve, dispute, reject, resolve)',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ action: z.enum(['approve', 'dispute', 'reject', 'resolve']), reason: z.string().optional() }) } } },
  },
  responses: { 200: { description: 'Updated duty' }, 409: { description: 'Invalid transition for current status' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/driver/v1/sync',
  summary: 'Batch offline-outbox sync — idempotent per clientMutationId',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: { content: { 'application/json': { schema: z.object({ items: z.array(z.object({ clientMutationId: z.string(), type: z.string() }).passthrough()) }) } } },
  },
  responses: {
    200: {
      description: 'Per-item results — replaying the same clientMutationId returns the cached result without re-executing side effects',
      content: { 'application/json': { schema: z.object({ results: z.array(z.object({ clientMutationId: z.string(), status: z.enum(['OK', 'ERROR']) })) }) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/v1/availability',
  summary: 'Vehicle availability for a category + time window (accounts for bookings, deployments, maintenance, turnaround buffer)',
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ categoryId: z.string(), start: z.string().datetime(), end: z.string().datetime() }) },
  responses: { 200: { description: 'Per-vehicle availability list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/v1/vendors/{id}/reconciliations/{period}/finalize',
  summary: 'Idempotent invoice generation from a prepared reconciliation — locks all included duties to BILLED',
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string(), period: z.string().describe('YYYY-MM') }) },
  responses: { 200: { description: 'The generated (or, on replay, the already-existing) invoice' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/v1/bookings/{id}/settlement/confirm',
  summary: 'Generate a BOOKING invoice from a completed duty’s actual km/hours',
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: 'The generated (or, on replay, the already-existing) invoice' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/v1/invoices/{id}/void',
  summary: 'OWNER-only: void an issued invoice via a CreditNote (invoices are immutable once issued)',
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ reason: z.string() }) } } },
  },
  responses: { 200: { description: 'Voided invoice + the reversing credit note' }, 403: { description: 'Non-OWNER role' } },
});
