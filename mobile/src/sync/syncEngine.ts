import * as Network from 'expo-network';
import { dutiesApi, syncApi } from '../api/endpoints';
import { cacheDuties } from '../db/dutiesCache';
import { listPending, markError, markSynced, type OutboxRow } from '../db/outbox';

function toSyncItem(row: OutboxRow) {
  return {
    clientMutationId: row.clientMutationId,
    clientTimestamp: row.createdAt,
    type: row.type,
    dutyId: row.dutyId,
    ...row.payload,
  };
}

export interface SyncSummary {
  pushed: number;
  failed: number;
  pulled: number;
}

/** Push the pending outbox (in order — later items may depend on earlier ones in the same offline session), then pull fresh duties. */
export async function runSync(): Promise<SyncSummary> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected) return { pushed: 0, failed: 0, pulled: 0 };

  const pending = await listPending();
  let pushed = 0;
  let failed = 0;

  if (pending.length > 0) {
    const results = await syncApi.push(pending.map(toSyncItem));
    for (const result of results) {
      if (result.status === 'OK') {
        await markSynced(result.clientMutationId);
        pushed++;
      } else {
        await markError(result.clientMutationId, result.error?.message ?? 'Sync failed');
        failed++;
      }
    }
  }

  let pulled = 0;
  try {
    const duties = await dutiesApi.list();
    await cacheDuties(duties);
    pulled = duties.length;
  } catch {
    // Offline or server hiccup on the pull side — the push above (if any) already
    // landed, and cached duties remain visible from the last successful pull.
  }

  return { pushed, failed, pulled };
}
