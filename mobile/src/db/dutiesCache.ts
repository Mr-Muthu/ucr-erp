import { getDb } from './database';
import type { Duty } from '../api/types';

export async function cacheDuty(duty: Duty) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO duties_cache (id, json, updatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt',
    [duty.id, JSON.stringify(duty), new Date().toISOString()]
  );
}

export async function cacheDuties(duties: Duty[]) {
  for (const duty of duties) await cacheDuty(duty);
}

export async function getCachedDuties(): Promise<Duty[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM duties_cache ORDER BY updatedAt DESC');
  return rows.map((r) => JSON.parse(r.json) as Duty);
}

export async function getCachedDuty(id: string): Promise<Duty | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM duties_cache WHERE id = ?', [id]);
  return row ? (JSON.parse(row.json) as Duty) : null;
}

/** Optimistic local patch, applied immediately so the UI reflects the action before sync confirms it. */
export async function patchCachedDuty(id: string, patch: Partial<Duty>) {
  const existing = await getCachedDuty(id);
  if (!existing) return;
  await cacheDuty({ ...existing, ...patch });
}

export async function clearDutiesCache() {
  const db = await getDb();
  await db.runAsync('DELETE FROM duties_cache');
}
