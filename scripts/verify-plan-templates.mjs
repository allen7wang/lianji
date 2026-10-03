import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loaded = new Map();

// Execute the real app import and migration modules against an isolated SQLite DB.
// Type-only Expo imports disappear on transpilation; native modules are not mocked.
function loadSource(filename) {
  if (loaded.has(filename)) return loaded.get(filename).exports;
  if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename, 'utf8'));
  const module = { exports: {} };
  loaded.set(filename, module);
  const require = specifier => {
    if (!specifier.startsWith('.')) return createRequire(filename)(specifier);
    let target = path.resolve(path.dirname(filename), specifier);
    if (!path.extname(target)) target += '.ts';
    return loadSource(target);
  };
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports);
  return module.exports;
}

function database() {
  const native = new DatabaseSync(':memory:');
  const transaction = async task => {
    native.exec('BEGIN IMMEDIATE');
    try { await task(); native.exec('COMMIT'); }
    catch (error) { native.exec('ROLLBACK'); throw error; }
  };
  const db = {
    execAsync: async sql => native.exec(sql),
    getAllAsync: async (sql, ...args) => native.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => native.prepare(sql).get(...args) ?? null,
    runAsync: async (sql, ...args) => native.prepare(sql).run(...args),
    withTransactionAsync: async task => transaction(task),
    withExclusiveTransactionAsync: async task => transaction(() => task(db)),
  };
  return { native, db };
}

const { migrate } = loadSource(path.join(root, 'src/lib/database.ts'));
const { trainingPrograms, templatePlanId } = loadSource(path.join(root, 'src/lib/plan-templates.ts'));
const { importPlanTemplate } = loadSource(path.join(root, 'src/lib/import-plan-template.ts'));
const media = loadSource(path.join(root, 'assets/exercises/exercise-demos.json'));
assert.equal(trainingPrograms.length, 12);
assert.equal(trainingPrograms.reduce((total, program) => total + program.days.length, 0), 34);
const dayIds = trainingPrograms.flatMap(program => program.days.map(day => templatePlanId(program.id, day.id)));
assert.equal(new Set(dayIds).size, 34);
for (const program of trainingPrograms) {
  for (const field of ['category', 'level', 'frequency', 'description']) assert.ok(program[field]?.trim());
  assert.ok(program.equipment.length && program.guidance.length);
  for (const day of program.days) {
    assert.ok(day.exercises.length > 0);
    for (const exercise of day.exercises) {
      assert.ok(Number.isInteger(exercise.sets) && exercise.sets > 0);
      assert.ok(Number.isInteger(exercise.reps) && exercise.reps > 0);
      assert.ok(media.some(item => item.name === exercise.name), `Missing animation: ${exercise.name}`);
    }
  }
}

const { native, db } = database();
const plans = () => native.prepare('SELECT * FROM plans ORDER BY id').all();
const items = () => native.prepare('SELECT * FROM plan_items ORDER BY id').all();
await migrate(db);
const originals = { plans: plans(), items: items() };
assert.equal(originals.plans.length, 3);
for (const program of trainingPrograms) {
  assert.equal(await importPlanTemplate(db, program.id), program.days.length);
}
assert.equal(plans().length, 37);
for (const original of originals.plans) assert.deepEqual(plans().find(plan => plan.id === original.id), original);
for (const original of originals.items) assert.deepEqual(items().find(item => item.id === original.id), original);
const totalItems = items().length;
for (const program of trainingPrograms) assert.equal(await importPlanTemplate(db, program.id), 0);
assert.equal(items().length, totalItems);

const ppl = trainingPrograms.find(program => program.id === 'ppl');
const editedId = templatePlanId(ppl.id, ppl.days[0].id);
native.prepare('UPDATE plans SET name = ? WHERE id = ?').run('我的推日', editedId);
native.prepare('UPDATE plan_items SET weight = 25 WHERE planId = ?').run(editedId);
const editedItems = items().filter(item => item.planId === editedId);
const removedId = templatePlanId(ppl.id, ppl.days[1].id);
native.prepare('DELETE FROM plans WHERE id = ?').run(removedId);
assert.equal(await importPlanTemplate(db, ppl.id), 1);
assert.equal(plans().find(plan => plan.id === editedId).name, '我的推日');
assert.deepEqual(items().filter(item => item.planId === editedId), editedItems);
assert.equal(plans().length, 37);
await assert.rejects(importPlanTemplate(db, 'unknown'), /没有找到/);
native.close();

// A failure after the first day was inserted must roll back the complete program.
const failure = database();
await migrate(failure.db);
const before = failure.native.prepare('SELECT COUNT(*) AS count FROM plan_items').get().count;
failure.native.exec(`CREATE TRIGGER fail_second_day BEFORE INSERT ON plans
  WHEN NEW.id = 'template:three-way:back' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
await assert.rejects(importPlanTemplate(failure.db, 'three-way'), /forced failure/);
assert.equal(failure.native.prepare('SELECT COUNT(*) AS count FROM plans').get().count, 3);
assert.equal(failure.native.prepare('SELECT COUNT(*) AS count FROM plan_items').get().count, before);
failure.native.exec('DROP TRIGGER fail_second_day');
const missing = failure.native.prepare("SELECT id FROM exercises WHERE name = '卷腹'").get();
failure.native.prepare('DELETE FROM exercises WHERE id = ?').run(missing.id);
await assert.rejects(importPlanTemplate(failure.db, 'full-body'), /动作库缺少/);
assert.equal(failure.native.prepare('SELECT COUNT(*) AS count FROM plans').get().count, 3);
assert.equal(failure.native.prepare('SELECT COUNT(*) AS count FROM plan_items').get().count, before);
failure.native.close();
// Upgrade a legacy database without touching plans, workouts or same-name custom exercises.
const legacy = database();
await migrate(legacy.db);
legacy.native.exec("DELETE FROM exercises WHERE id LIKE 'builtin:%'");
legacy.native.prepare('INSERT INTO exercises VALUES (?, ?, ?, ?, 1)').run('custom-squat', '自重深蹲', '腿', '自定义');
legacy.native.prepare('UPDATE plans SET name = ? WHERE rowid = (SELECT MIN(rowid) FROM plans)').run('已编辑计划');
legacy.native.prepare('INSERT INTO workouts VALUES (?, NULL, ?, ?, ?, ?)').run('saved-workout', '保留训练', '2026-10-01', '2026-10-01', '我的笔记');
const savedPlans = legacy.native.prepare('SELECT * FROM plans ORDER BY id').all();
const savedItems = legacy.native.prepare('SELECT * FROM plan_items ORDER BY id').all();
const savedWorkouts = legacy.native.prepare('SELECT * FROM workouts ORDER BY id').all();
await migrate(legacy.db);
await migrate(legacy.db);
assert.equal(legacy.native.prepare('SELECT COUNT(*) AS count FROM exercises WHERE isCustom = 0').get().count, 36);
assert.equal(legacy.native.prepare('SELECT COUNT(*) AS count FROM exercises WHERE isCustom = 1').get().count, 1);
assert.deepEqual(legacy.native.prepare('SELECT * FROM plans ORDER BY id').all(), savedPlans);
assert.deepEqual(legacy.native.prepare('SELECT * FROM plan_items ORDER BY id').all(), savedItems);
assert.deepEqual(legacy.native.prepare('SELECT * FROM workouts ORDER BY id').all(), savedWorkouts);
for (const id of ['home-dumbbell', 'home-bodyweight']) {
  const program = trainingPrograms.find(p => p.id === id);
  for (const day of program.days) for (const item of day.exercises) {
    const exercise = legacy.native.prepare('SELECT * FROM exercises WHERE name = ? AND isCustom = 0').get(item.name);
    assert.ok(id === 'home-bodyweight' ? exercise.equipment === '自重' : ['自重', '哑铃'].includes(exercise.equipment));
  }
  assert.equal(await importPlanTemplate(legacy.db, id), 2);
}
assert.ok(legacy.native.prepare("SELECT e.isCustom FROM plan_items i JOIN exercises e ON e.id = i.exerciseId WHERE i.planId = 'template:home-bodyweight:a' AND e.name = '自重深蹲'").get().isCustom === 0);
legacy.native.close();
console.log('Passed: 12 programs / 34 days; animations mapped; original plans preserved; repeat import, edited plans, refill and atomic rollback.');
