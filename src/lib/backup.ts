import type { SQLiteDatabase } from 'expo-sqlite';
import type { BodyEntry, Exercise, FoodEntry, Plan, PlanItem, Workout, WorkoutSet } from './types';

export const BACKUP_VERSION = 1;

export type BackupTables = {
  exercises: Exercise[];
  plans: Plan[];
  plan_items: PlanItem[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  body_entries: BodyEntry[];
  food_entries: FoodEntry[];
};

export type BackupFile = {
  app: 'lianji';
  version: number;
  exportedAt: string;
  tables: BackupTables;
};

const TABLES = ['exercises', 'plans', 'plan_items', 'workouts', 'workout_sets', 'body_entries', 'food_entries'] as const;
// Children first so foreign keys hold during the replace.
const DELETE_ORDER = ['workout_sets', 'plan_items', 'food_entries', 'body_entries', 'workouts', 'plans', 'exercises'] as const;

export async function exportBackup(db: SQLiteDatabase): Promise<BackupFile> {
  const [exercises, plans, plan_items, workouts, workout_sets, body_entries, food_entries] = await Promise.all([
    db.getAllAsync<Exercise>('SELECT * FROM exercises'),
    db.getAllAsync<Plan>('SELECT * FROM plans'),
    db.getAllAsync<PlanItem>('SELECT * FROM plan_items'),
    db.getAllAsync<Workout>('SELECT * FROM workouts'),
    db.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets'),
    db.getAllAsync<BodyEntry>('SELECT * FROM body_entries'),
    db.getAllAsync<FoodEntry>('SELECT * FROM food_entries'),
  ]);
  return { app: 'lianji', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: { exercises, plans, plan_items, workouts, workout_sets, body_entries, food_entries } };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  const backup = data as Partial<BackupFile> | null;
  if (backup?.app !== 'lianji' || !backup.tables) throw new Error('这不是练迹的备份文件。');
  if (backup.version !== BACKUP_VERSION) throw new Error(`备份版本（${backup.version}）与当前应用（${BACKUP_VERSION}）不兼容。`);
  for (const table of TABLES) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) throw new Error(`备份缺少 ${table} 数据。`);
    for (const row of rows as { id?: unknown }[]) {
      if (typeof row?.id !== 'string' || !row.id) throw new Error('备份内容已损坏：存在缺少 id 的记录。');
    }
  }
  return backup as BackupFile;
}

export async function importBackup(db: SQLiteDatabase, backup: BackupFile): Promise<void> {
  await db.withExclusiveTransactionAsync(async transaction => {
    for (const table of DELETE_ORDER) await transaction.runAsync(`DELETE FROM ${table}`);
    for (const exercise of backup.tables.exercises) {
      await transaction.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, ?)', exercise.id, exercise.name, exercise.muscle, exercise.equipment, exercise.isCustom);
    }
    for (const plan of backup.tables.plans) {
      await transaction.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', plan.id, plan.name, plan.note, plan.createdAt);
    }
    for (const item of backup.tables.plan_items) {
      await transaction.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.planId, item.exerciseId, item.sortOrder, item.sets, item.reps, item.weight, item.unit ?? 'reps', item.restSeconds ?? 90);
    }
    for (const workout of backup.tables.workouts) {
      await transaction.runAsync('INSERT INTO workouts VALUES (?, ?, ?, ?, ?, ?)', workout.id, workout.planId, workout.name, workout.startedAt, workout.endedAt, workout.note);
    }
    for (const set of backup.tables.workout_sets) {
      await transaction.runAsync('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', set.id, set.workoutId, set.exerciseId, set.sortOrder, set.setNumber, set.weight, set.reps, set.completed, set.unit ?? 'reps', set.restSeconds ?? 90);
    }
    for (const entry of backup.tables.body_entries) {
      await transaction.runAsync('INSERT INTO body_entries VALUES (?, ?, ?, ?)', entry.id, entry.recordedAt, entry.weight, entry.bodyFat);
    }
    for (const entry of backup.tables.food_entries) {
      await transaction.runAsync('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', entry.id, entry.loggedAt, entry.meal, entry.name, entry.portion, entry.calories, entry.protein, entry.carbs, entry.fat);
    }
  });
}
