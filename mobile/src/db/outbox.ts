import { getDb } from './database';
import type { SyncItemType } from '../api/types';

export interface OutboxRow {
  clientMutationId: string;
  dutyId: string;
  type: SyncItemType;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SYNCED' | 'ERROR';
  errorMessage: string | null;
  createdAt: string;
}

export async function enqueue(row: { clientMutationId: string; dutyId: string; type: SyncItemType; payload: Record<string, unknown> }) {
  const db = await getDb();
  await db.runAsync('INSERT INTO outbox (clientMutationId, dutyId, type, payload, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    row.clientMutationId,
    row.dutyId,
    row.type,
    JSON.stringify(row.payload),
    'PENDING',
    new Date().toISOString(),
  ]);
}

export async function listPending(): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>("SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY createdAt ASC");
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

export async function listAll(): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM outbox ORDER BY createdAt DESC LIMIT 50');
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

export async function markSynced(clientMutationId: string) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status = 'SYNCED', errorMessage = NULL WHERE clientMutationId = ?", [clientMutationId]);
}

export async function markError(clientMutationId: string, message: string) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET status = 'ERROR', errorMessage = ? WHERE clientMutationId = ?", [message, clientMutationId]);
}

export async function countPending(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM outbox WHERE status = 'PENDING'");
  return row?.c ?? 0;
}

export async function clearOutbox() {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox');
}
