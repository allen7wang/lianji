import type { SQLiteDatabase } from 'expo-sqlite';
import extraExercises from '../../assets/exercises/extra-exercises.json';
import { id } from './types';

const defaultExercises: [string, string, string][] = [
  ['杠铃卧推', '胸', '杠铃'], ['上斜哑铃卧推', '胸', '哑铃'], ['双杠臂屈伸', '胸', '自重'],
  ['绳索夹胸', '胸', '绳索'], ['俯卧撑', '胸', '自重'], ['引体向上', '背', '自重'],
  ['杠铃划船', '背', '杠铃'], ['高位下拉', '背', '器械'], ['坐姿划船', '背', '器械'],
  ['单臂哑铃划船', '背', '哑铃'], ['杠铃深蹲', '腿', '杠铃'], ['腿举', '腿', '器械'],
  ['罗马尼亚硬拉', '腿', '杠铃'], ['保加利亚分腿蹲', '腿', '哑铃'], ['腿屈伸', '腿', '器械'],
  ['腿弯举', '腿', '器械'], ['站姿提踵', '腿', '器械'], ['杠铃肩推', '肩', '杠铃'],
  ['哑铃侧平举', '肩', '哑铃'], ['反向飞鸟', '肩', '哑铃'], ['面拉', '肩', '绳索'],
  ['杠铃弯举', '手臂', '杠铃'], ['锤式弯举', '手臂', '哑铃'], ['绳索下压', '手臂', '绳索'],
  ['仰卧臂屈伸', '手臂', '杠铃'], ['平板支撑', '核心', '自重'], ['卷腹', '核心', '自重'],
  ['悬垂举腿', '核心', '自重'], ['硬拉', '全身', '杠铃'], ['壶铃摆动', '全身', '壶铃'],
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, muscle TEXT NOT NULL,
      equipment TEXT NOT NULL, isCustom INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL,
      createdAt TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workoutId);
    CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(startedAt);
    CREATE INDEX IF NOT EXISTS idx_food_logged ON food_entries(loggedAt);
  `);

  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM exercises');
  await db.withTransactionAsync(async () => {
    for (const exercise of extraExercises) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ? AND isCustom = 0', exercise.name);
      if (!existing) await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 0)', `builtin:${exercise.id}`, exercise.name, exercise.muscle, exercise.equipment);
    }
    if (count?.count) return;
    for (const [name, muscle, equipment] of defaultExercises) {
      await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 0)', id(), name, muscle, equipment);
    }
    const templates: [string, string, string[]][] = [
      ['推日 · 胸肩三头', '适合上肢推力训练', ['杠铃卧推', '上斜哑铃卧推', '杠铃肩推', '哑铃侧平举', '绳索下压']],
      ['拉日 · 背部二头', '适合上肢拉力训练', ['引体向上', '杠铃划船', '高位下拉', '面拉', '杠铃弯举']],
      ['腿日 · 下肢核心', '适合下肢力量训练', ['杠铃深蹲', '罗马尼亚硬拉', '腿举', '腿弯举', '平板支撑']],
    ];
    for (const [name, note, names] of templates) {
      const planId = id();
      await db.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', planId, name, note, new Date().toISOString());
      for (let i = 0; i < names.length; i++) {
        const exercise = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ?', names[i]);
        if (exercise) await db.runAsync('INSERT INTO plan_items VALUES (?, ?, ?, ?, ?, ?, ?)', id(), planId, exercise.id, i, 3, 10, 0);
      }
    }
  });
}
