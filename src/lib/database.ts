import { withWriteTransaction } from './write-transaction';
import type { SQLiteDatabase } from 'expo-sqlite';
import { canonicalExerciseId, catalogExercises, starterExercises, starterPlans } from './builtin-exercises';
import { isScheduleDay, type ScheduledTraining } from './training-schedule';
import { defaultDeviceSettings, defaultPreferences, type DeviceSettings, type Preferences } from './types';

export function isWeeklyGoal(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;
}

export async function readWeeklyGoal(db: SQLiteDatabase) {
  const preferences = await db.getFirstAsync<{ weeklyGoal: number }>('SELECT weeklyGoal FROM training_preferences WHERE id = 1');
  return preferences?.weeklyGoal ?? 0;
}

export async function writeWeeklyGoal(db: SQLiteDatabase, days: number) {
  if (!isWeeklyGoal(days)) throw new Error('每周训练目标需为 0–7 天的整数。');
  await db.runAsync(`
    INSERT INTO training_preferences (id, weeklyGoal) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET weeklyGoal = excluded.weeklyGoal
  `, days);
}

export const isWeightUnit = (value: unknown): value is Preferences['weightUnit'] => value === 'kg' || value === 'lb';
export const isCalorieGoal = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10000;
export const isProteinGoal = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000;

async function readSettings(db: SQLiteDatabase, prefix: string) {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key LIKE ?', `${prefix}%`);
  const values = new Map<string, unknown>();
  for (const row of rows) {
    try { values.set(row.key.slice(prefix.length), JSON.parse(row.value)); } catch { /* ignore a damaged value and use the default */ }
  }
  return values;
}

async function writeSettings(db: SQLiteDatabase, prefix: string, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', `${prefix}${key}`, JSON.stringify(value));
  }
}

export async function readPreferences(db: SQLiteDatabase): Promise<Preferences> {
  const values = await readSettings(db, 'pref.');
  const weightUnit = values.get('weightUnit');
  const calorieGoal = values.get('calorieGoal');
  const proteinGoal = values.get('proteinGoal');
  return {
    weightUnit: isWeightUnit(weightUnit) ? weightUnit : defaultPreferences.weightUnit,
    calorieGoal: isCalorieGoal(calorieGoal) ? calorieGoal : defaultPreferences.calorieGoal,
    proteinGoal: isProteinGoal(proteinGoal) ? proteinGoal : defaultPreferences.proteinGoal,
  };
}

export function validatePreferences(patch: Partial<Preferences>) {
  if (patch.weightUnit !== undefined && !isWeightUnit(patch.weightUnit)) throw new Error('重量单位只能是 kg 或 lb。');
  if (patch.calorieGoal !== undefined && !isCalorieGoal(patch.calorieGoal)) throw new Error('每日热量目标需为 0–10000 的整数。');
  if (patch.proteinGoal !== undefined && !isProteinGoal(patch.proteinGoal)) throw new Error('每日蛋白质目标需为 0–1000 的整数。');
}

export async function writePreferences(db: SQLiteDatabase, patch: Partial<Preferences>) {
  validatePreferences(patch);
  await writeSettings(db, 'pref.', { weightUnit: patch.weightUnit, calorieGoal: patch.calorieGoal, proteinGoal: patch.proteinGoal });
}

export async function readDeviceSettings(db: SQLiteDatabase): Promise<DeviceSettings> {
  const values = await readSettings(db, 'device.');
  const flag = (key: keyof DeviceSettings) => {
    const value = values.get(key);
    return typeof value === 'boolean' ? value : defaultDeviceSettings[key];
  };
  return { restNotifications: flag('restNotifications'), keepAwake: flag('keepAwake'), haptics: flag('haptics'), healthSync: flag('healthSync') };
}

export async function writeDeviceSettings(db: SQLiteDatabase, patch: Partial<DeviceSettings>) {
  for (const value of Object.values(patch)) if (typeof value !== 'boolean') throw new Error('设置值无效。');
  await writeSettings(db, 'device.', patch);
}

export async function readDeviceValue<T>(db: SQLiteDatabase, key: string): Promise<T | null> {
  return ((await readSettings(db, 'device.')).get(key) as T | undefined) ?? null;
}

export async function writeDeviceValue(db: SQLiteDatabase, key: string, value: unknown) {
  if (value === null) await db.runAsync('DELETE FROM app_settings WHERE key = ?', `device.${key}`);
  else await writeSettings(db, 'device.', { [key]: value });
}

export async function readTrainingSchedule(db: SQLiteDatabase) {
  return db.getAllAsync<ScheduledTraining>('SELECT day, planId FROM training_schedule ORDER BY day, planId');
}

export async function insertScheduledTraining(db: SQLiteDatabase, day: string, planId: string) {
  if (!isScheduleDay(day)) throw new Error('请选择有效的训练日期。');
  // An existing pair still reports a change, so zero changes means the plan is missing.
  const result = await db.runAsync(`
    INSERT INTO training_schedule (day, planId)
    SELECT ?, id FROM plans WHERE id = ?
    ON CONFLICT(day, planId) DO UPDATE SET planId = excluded.planId
  `, day, planId);
  if (!result.changes) throw new Error('没有找到这个训练计划。');
}

export async function removeScheduledTraining(db: SQLiteDatabase, day: string, planId: string) {
  if (!isScheduleDay(day)) throw new Error('请选择有效的训练日期。');
  await db.runAsync('DELETE FROM training_schedule WHERE day = ? AND planId = ?', day, planId);
}

export async function readFavoritePlanIds(db: SQLiteDatabase) {
  const favorites = await db.getAllAsync<{ planId: string }>('SELECT planId FROM plan_favorites ORDER BY planId');
  return favorites.map(item => item.planId);
}

export async function writePlanFavorite(db: SQLiteDatabase, planId: string, favorite: boolean) {
  if (typeof favorite !== 'boolean') throw new Error('收藏状态无效。');
  await withWriteTransaction(db, async transaction => {
    const plan = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM plans WHERE id = ?', planId);
    if (!plan) throw new Error('没有找到这个训练计划。');
    if (favorite) {
      await transaction.runAsync('INSERT INTO plan_favorites (planId) VALUES (?) ON CONFLICT(planId) DO NOTHING', planId);
    } else {
      await transaction.runAsync('DELETE FROM plan_favorites WHERE planId = ?', planId);
    }
  });
}

async function columnNames(db: SQLiteDatabase, table: string) {
  return new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map(column => column.name));
}

/** Points every stored built-in exercise at its shared ID and merges same-name duplicates. */
export async function normalizeStoredExercises(db: SQLiteDatabase) {
  const stored = await db.getAllAsync<{ id: string; name: string; isCustom: number }>('SELECT id, name, isCustom FROM exercises WHERE isCustom = 0');
  for (const exercise of stored) {
    const canonical = canonicalExerciseId(exercise);
    if (!canonical || canonical === exercise.id) continue;
    await db.runAsync('INSERT INTO exercises (id, name, muscle, equipment, isCustom) SELECT ?, name, muscle, equipment, 0 FROM exercises WHERE id = ? ON CONFLICT(id) DO NOTHING', canonical, exercise.id);
    await db.runAsync('UPDATE plan_items SET exerciseId = ? WHERE exerciseId = ?', canonical, exercise.id);
    await db.runAsync('UPDATE workout_sets SET exerciseId = ? WHERE exerciseId = ?', canonical, exercise.id);
    await db.runAsync('DELETE FROM exercises WHERE id = ?', exercise.id);
  }
}

type Migration = (db: SQLiteDatabase) => Promise<void>;

// Append only. Each step runs once, in order, inside its own transaction; PRAGMA user_version records progress.
const migrations: Migration[] = [
  // 1 · Baseline schema up to v2.10, including databases created before user_version existed.
  async db => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, muscle TEXT NOT NULL,
        equipment TEXT NOT NULL, isCustom INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS training_schedule (
        day TEXT NOT NULL, planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        PRIMARY KEY (day, planId)
      );
      CREATE TABLE IF NOT EXISTS plan_favorites (
        planId TEXT PRIMARY KEY NOT NULL REFERENCES plans(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS plan_items (
        id TEXT PRIMARY KEY NOT NULL, planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        exerciseId TEXT NOT NULL REFERENCES exercises(id), sortOrder INTEGER NOT NULL,
        sets INTEGER NOT NULL, reps INTEGER NOT NULL, weight REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY NOT NULL, planId TEXT REFERENCES plans(id) ON DELETE SET NULL,
        name TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT, note TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workout_sets (
        id TEXT PRIMARY KEY NOT NULL, workoutId TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        exerciseId TEXT NOT NULL REFERENCES exercises(id), sortOrder INTEGER NOT NULL,
        setNumber INTEGER NOT NULL, weight REAL NOT NULL, reps INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS body_entries (
        id TEXT PRIMARY KEY NOT NULL, recordedAt TEXT NOT NULL,
        weight REAL NOT NULL, bodyFat REAL
      );
      CREATE TABLE IF NOT EXISTS food_entries (
        id TEXT PRIMARY KEY NOT NULL, loggedAt TEXT NOT NULL, meal TEXT NOT NULL,
        name TEXT NOT NULL, portion TEXT NOT NULL, calories REAL NOT NULL,
        protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS training_preferences (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        weeklyGoal INTEGER NOT NULL CHECK (typeof(weeklyGoal) = 'integer' AND weeklyGoal BETWEEN 0 AND 7)
      );
      CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workoutId);
      CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(startedAt);
      CREATE INDEX IF NOT EXISTS idx_food_logged ON food_entries(loggedAt);
      CREATE INDEX IF NOT EXISTS idx_training_schedule_plan ON training_schedule(planId);
    `);
    for (const table of ['plan_items', 'workout_sets']) {
      const columns = await columnNames(db, table);
      if (!columns.has('unit')) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN unit TEXT NOT NULL DEFAULT 'reps'`);
      if (!columns.has('restSeconds')) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN restSeconds INTEGER NOT NULL DEFAULT 90`);
    }
    const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM exercises');
    if (count?.count) return;
    for (const exercise of starterExercises) {
      await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 0)', exercise.id, exercise.name, exercise.muscle, exercise.equipment);
    }
    const created = Date.now();
    for (const [index, plan] of starterPlans.entries()) {
      await db.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', plan.id, plan.name, plan.note, new Date(created - index).toISOString());
      for (const [sortOrder, exerciseId] of plan.exercises.entries()) {
        await db.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          `${plan.id}:${exerciseId}`, plan.id, exerciseId, sortOrder, 3, 10, 0, exerciseId === 'plank' ? 'seconds' : 'reps');
      }
    }
  },
  // 2 · Shared built-in exercise IDs (older installs generated random ones).
  normalizeStoredExercises,
  // 3 · Warm-up sets, RPE, settings and import snapshots.
  async db => {
    const columns = await columnNames(db, 'workout_sets');
    if (!columns.has('kind')) await db.execAsync(`ALTER TABLE workout_sets ADD COLUMN kind TEXT NOT NULL DEFAULT 'working'`);
    if (!columns.has('rpe')) await db.execAsync('ALTER TABLE workout_sets ADD COLUMN rpe REAL');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS backup_snapshots (
        id TEXT PRIMARY KEY NOT NULL, createdAt TEXT NOT NULL, reason TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exerciseId);
    `);
  },
];

export const SCHEMA_VERSION = migrations.length;

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const current = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  for (let version = current; version < migrations.length; version++) {
    await db.withTransactionAsync(async () => {
      await migrations[version](db);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
  // The catalog can grow between releases; add any missing built-ins on every launch.
  await db.withTransactionAsync(async () => {
    for (const exercise of catalogExercises) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE id = ? OR (name = ? AND isCustom = 0)', exercise.id, exercise.name);
      if (!existing) await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 0)', exercise.id, exercise.name, exercise.muscle, exercise.equipment);
    }
  });
}
