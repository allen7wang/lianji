import type { SQLiteDatabase } from 'expo-sqlite';
export function withWriteTransaction(db: SQLiteDatabase, task: (transaction: SQLiteDatabase) => Promise<void>) {
  return db.withExclusiveTransactionAsync(task);
}
