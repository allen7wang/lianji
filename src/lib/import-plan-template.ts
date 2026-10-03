import type { SQLiteDatabase } from 'expo-sqlite';
import { id, type Exercise } from './types';
import { templateDrafts, trainingPrograms } from './plan-templates';

export async function importPlanTemplate(db: SQLiteDatabase, programId: string) {
  const program = trainingPrograms.find(item => item.id === programId);
  if (!program) throw new Error('没有找到这个计划模板。');
  let added = 0;
  await db.withExclusiveTransactionAsync(async transaction => {
    const exercises = await transaction.getAllAsync<Exercise>('SELECT * FROM exercises');
    const drafts = templateDrafts(program, exercises);
    const created = Date.now();
    for (const [index, draft] of drafts.entries()) {
      const existing = await transaction.getFirstAsync('SELECT id FROM plans WHERE id = ?', draft.id);
      // Preserve edited plans and refill only training days the user removed.
      if (existing) continue;
      await transaction.runAsync('INSERT INTO plans (id, name, note, createdAt) VALUES (?, ?, ?, ?)',
        draft.id, draft.name, draft.note, new Date(created - index).toISOString());
      for (const [sortOrder, item] of draft.items.entries()) {
        await transaction.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id(), draft.id, item.exerciseId, sortOrder, item.sets, item.reps, item.weight, item.unit ?? 'reps', item.restSeconds ?? 90);
      }
      added++;
    }
  });
  return added;
}
