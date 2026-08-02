import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.pin',
      'req.body.newPin',
      '*.password',
      '*.pin',
      '*.passwordHash',
      '*.pinHash',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});

// Business events get their own logger namespace so they're easy to grep/alert on
// separately from request-level noise (duty submitted, invoice issued, etc.).
export const businessLog = logger.child({ scope: 'business-event' });
