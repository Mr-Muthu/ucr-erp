import * as Crypto from 'expo-crypto';
import { enqueue } from '../db/outbox';
import { patchCachedDuty } from '../db/dutiesCache';
import type { DutyStatus } from '../api/types';

/**
 * Every action follows the same shape: patch the local cache optimistically
 * so the UI reflects the change immediately, then enqueue the matching
 * outbox item for the sync engine to push. Nothing here talks to the
 * network directly — that's the whole point of offline-first.
 */
async function queueAction(dutyId: string, type: any, payload: Record<string, unknown>, optimisticStatus?: DutyStatus, extraPatch?: Record<string, unknown>) {
  const clientMutationId = Crypto.randomUUID();
  await enqueue({ clientMutationId, dutyId, type, payload });
  if (optimisticStatus) await patchCachedDuty(dutyId, { status: optimisticStatus, ...extraPatch } as any);
  return clientMutationId;
}

export const dutyActions = {
  accept: (dutyId: string) => queueAction(dutyId, 'DUTY_ACCEPT', {}, 'ACCEPTED'),

  decline: (dutyId: string, reason: string) => queueAction(dutyId, 'DUTY_DECLINE', { reason }, 'DECLINED', { declineReason: reason }),

  start: (
    dutyId: string,
    data: { deviceStartAt: string; openingOdometer: number; openingOdometerPhotoKey?: string; startGpsLat?: number; startGpsLng?: number }
  ) => queueAction(dutyId, 'DUTY_START', data, 'STARTED', { deviceStartAt: data.deviceStartAt, openingOdometer: data.openingOdometer }),

  complete: (
    dutyId: string,
    data: {
      deviceEndAt: string;
      closingOdometer: number;
      closingOdometerPhotoKey?: string;
      endGpsLat?: number;
      endGpsLng?: number;
      passengerSignatureKey?: string;
      passengerName?: string;
      driverFeedbackNote?: string;
      driverFeedbackTags?: string[];
    }
  ) => queueAction(dutyId, 'DUTY_COMPLETE', data, 'COMPLETED', { deviceEndAt: data.deviceEndAt, closingOdometer: data.closingOdometer }),

  submit: (dutyId: string) => queueAction(dutyId, 'DUTY_SUBMIT', {}, 'SUBMITTED'),

  resubmit: (dutyId: string) => queueAction(dutyId, 'DUTY_RESUBMIT', {}, 'SUBMITTED'),

  addEntry: (dutyId: string, data: { entryType: 'TOLL' | 'PARKING' | 'OTHER'; amount: number; receiptPhotoKey?: string; reimbursableToDriver?: boolean }) =>
    queueAction(dutyId, 'DUTY_ENTRY', data),

  addNightHalt: (dutyId: string, data: { haltDate: string; notes?: string }) => queueAction(dutyId, 'DUTY_NIGHT_HALT', data),
};
