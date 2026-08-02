import * as Sentry from '@sentry/node';
import { env } from './config/env.js';

// Imported as the very first thing in each process entrypoint (server.ts,
// worker.ts) — Sentry's Node SDK needs to init before the modules it
// instruments are required. No-op when SENTRY_DSN isn't configured, same
// "works with or without real credentials" pattern as R2 and email.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
