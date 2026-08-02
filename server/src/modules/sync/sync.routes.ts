import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { authenticateDriver } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { ApiError } from '../../lib/apiError.js';
import { businessLog } from '../../lib/logger.js';
import * as dutyService from '../duties/driverDuty.service.js';
import { syncRequestSchema, type SyncItem } from './sync.schemas.js';

export const syncRouter = Router();
syncRouter.use(authenticateDriver);

interface SyncItemResult {
  clientMutationId: string;
  status: 'OK' | 'ERROR';
  data?: unknown;
  error?: { code: string; message: string };
}

async function executeItem(driverId: string, item: SyncItem): Promise<unknown> {
  switch (item.type) {
    case 'DUTY_ACCEPT':
      return dutyService.acceptDuty(driverId, item.dutyId);
    case 'DUTY_DECLINE':
      return dutyService.declineDuty(driverId, item.dutyId, item.reason);
    case 'DUTY_START':
      return dutyService.startDuty(driverId, item.dutyId, item);
    case 'DUTY_COMPLETE':
      return dutyService.completeDuty(driverId, item.dutyId, item);
    case 'DUTY_SUBMIT':
      return dutyService.submitDuty(driverId, item.dutyId);
    case 'DUTY_RESUBMIT':
      return dutyService.resubmitDuty(driverId, item.dutyId);
    case 'DUTY_ENTRY':
      return dutyService.addEntry(driverId, item.dutyId, {
        clientMutationId: item.clientMutationId,
        type: item.entryType,
        amount: item.amount,
        receiptPhotoKey: item.receiptPhotoKey,
        reimbursableToDriver: item.reimbursableToDriver,
      });
    case 'DUTY_NIGHT_HALT':
      return dutyService.addNightHalt(driverId, item.dutyId, {
        clientMutationId: item.clientMutationId,
        haltDate: item.haltDate,
        notes: item.notes,
      });
  }
}

/**
 * Batch sync for the offline-first driver app outbox. Every item carries
 * its own clientMutationId; a hit in SyncMutationLog means the item was
 * already processed (successfully or not) and the cached result is
 * returned WITHOUT re-executing any side effect — the same batch replayed
 * 3x over a flaky connection produces exactly the same outcome as once.
 * Items are processed strictly in array order (not parallel) since later
 * items in the same batch may depend on earlier ones (e.g. START then
 * COMPLETE for the same duty in one offline session).
 */
syncRouter.post('/', validateBody(syncRequestSchema), async (req, res) => {
  const driverId = req.driverAuth!.driverId;
  const driverAccountId = req.driverAuth!.driverAccountId;
  const results: SyncItemResult[] = [];

  for (const item of req.body.items as SyncItem[]) {
    const cached = await prisma.syncMutationLog.findUnique({ where: { clientMutationId: item.clientMutationId } });
    if (cached) {
      results.push(
        cached.resultStatus === 'OK'
          ? { clientMutationId: item.clientMutationId, status: 'OK', data: cached.resultJson }
          : { clientMutationId: item.clientMutationId, status: 'ERROR', error: cached.resultJson as { code: string; message: string } }
      );
      continue;
    }

    try {
      const data = await executeItem(driverId, item);
      await prisma.syncMutationLog.create({
        data: {
          clientMutationId: item.clientMutationId,
          driverAccountId,
          type: item.type,
          resultStatus: 'OK',
          resultJson: JSON.parse(JSON.stringify(data ?? {})),
        },
      });
      results.push({ clientMutationId: item.clientMutationId, status: 'OK', data });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_ERROR', 'Unexpected error processing this item');
      const errorPayload = { code: apiErr.code, message: apiErr.message };
      await prisma.syncMutationLog.create({
        data: {
          clientMutationId: item.clientMutationId,
          driverAccountId,
          type: item.type,
          resultStatus: 'ERROR',
          resultJson: errorPayload,
        },
      });
      businessLog.warn({ driverId, item: item.type, err: apiErr.message }, 'Sync item failed');
      results.push({ clientMutationId: item.clientMutationId, status: 'ERROR', error: errorPayload });
    }
  }

  res.json({ results });
});
