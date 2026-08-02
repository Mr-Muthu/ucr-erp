import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  dbPromise ??= SQLite.openDatabaseAsync('ucr_driver.db').then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS duties_cache (
        id TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        clientMutationId TEXT PRIMARY KEY NOT NULL,
        dutyId TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        errorMessage TEXT,
        createdAt TEXT NOT NULL
      );
    `);
    return db;
  });
  return dbPromise;
}
