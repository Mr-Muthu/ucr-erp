import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires this exact option — without it, ioredis's default
// retry/backoff behavior conflicts with BullMQ's own blocking-command retry
// logic and connections silently stall.
export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
