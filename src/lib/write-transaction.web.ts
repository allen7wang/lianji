import type { SQLiteDatabase } from 'expo-sqlite';
// SQLite on web has no exclusive-connection API. Serialize writes on this connection.
const queues = new WeakMap<SQLiteDatabase, Promise<void>>();
export function withWriteTransaction(db: SQLiteDatabase, task: (transaction: SQLiteDatabase) => Promise<void>) {
  const result = (queues.get(db) || Promise.resolve()).catch(() => {}).then(() => db.withTransactionAsync(() => task(db)));
  queues.set(db, result.catch(() => {}));
  return result;
}
