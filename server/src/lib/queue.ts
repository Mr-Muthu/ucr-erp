import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

// Two queues, kept separate so a burst of expiry-reminder emails never
// backs up behind (or gets starved by) PDF generation, and so each can be
// scaled/monitored independently.
export const documentsQueue = new Queue('documents', { connection: redisConnection });
export const notificationsQueue = new Queue('notifications', { connection: redisConnection });

export const JOB_NAMES = {
  GENERATE_INVOICE_PDF: 'generate-invoice-pdf',
  GENERATE_CREDIT_NOTE_PDF: 'generate-credit-note-pdf',
  SCAN_EXPIRIES: 'scan-expiries',
  SEND_NOTIFICATION: 'send-notification',
} as const;

const EXPIRY_SCAN_REPEAT_JOB_ID = 'expiry-scan-daily';

/** Idempotent — safe to call on every server boot; BullMQ dedupes on jobId. */
export async function scheduleRecurringJobs() {
  await notificationsQueue.upsertJobScheduler(
    EXPIRY_SCAN_REPEAT_JOB_ID,
    { pattern: '0 3 * * *' }, // 03:00 IST daily — after the day's duties have settled, before the next day starts
    { name: JOB_NAMES.SCAN_EXPIRIES, data: {} }
  );
}
