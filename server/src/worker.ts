import './instrument.js';
import * as Sentry from '@sentry/node';
import { Job, Worker } from 'bullmq';
import { redisConnection } from './lib/redis.js';
import { JOB_NAMES, scheduleRecurringJobs } from './lib/queue.js';
import { logger } from './lib/logger.js';
import { generateInvoicePdf } from './jobs/generateInvoicePdf.js';
import { generateCreditNotePdf } from './jobs/generateCreditNotePdf.js';
import { scanExpiries } from './jobs/scanExpiries.js';
import { sendNotification } from './jobs/sendNotification.js';

const documentsWorker = new Worker(
  'documents',
  async (job: Job) => {
    switch (job.name) {
      case JOB_NAMES.GENERATE_INVOICE_PDF:
        return generateInvoicePdf(job.data.invoiceId);
      case JOB_NAMES.GENERATE_CREDIT_NOTE_PDF:
        return generateCreditNotePdf(job.data.creditNoteId);
      default:
        throw new Error(`Unknown documents job: ${job.name}`);
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

const notificationsWorker = new Worker(
  'notifications',
  async (job: Job) => {
    switch (job.name) {
      case JOB_NAMES.SCAN_EXPIRIES:
        return scanExpiries();
      case JOB_NAMES.SEND_NOTIFICATION:
        return sendNotification(job.data.notificationId);
      default:
        throw new Error(`Unknown notifications job: ${job.name}`);
    }
  },
  { connection: redisConnection, concurrency: 5 }
);

for (const worker of [documentsWorker, notificationsWorker]) {
  worker.on('completed', (job) => logger.info({ queue: worker.name, job: job.name, id: job.id }, 'Job completed'));
  worker.on('failed', (job, err) => {
    logger.error({ queue: worker.name, job: job?.name, id: job?.id, err: err.message }, 'Job failed');
    Sentry.captureException(err, { tags: { queue: worker.name, job: job?.name } });
  });
}

await scheduleRecurringJobs();
logger.info('Worker process started — listening on "documents" and "notifications" queues');
