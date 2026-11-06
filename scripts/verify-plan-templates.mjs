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
  // Native asset modules resolve to a bundler handle; use the existing path in this harness.
  if (filename.endsWith('.gif')) { fs.accessSync(filename); return filename; }
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

const { migrate, readWeeklyGoal, writeWeeklyGoal, readTrainingSchedule, insertScheduledTraining, removeScheduledTraining, readFavoritePlanIds, writePlanFavorite } = loadSource(path.join(root, 'src/lib/database.ts'));
const { trainingPrograms, templatePlanId } = loadSource(path.join(root, 'src/lib/plan-templates.ts'));
const { importPlanTemplate } = loadSource(path.join(root, 'src/lib/import-plan-template.ts'));
const { startWorkoutFromPlan, repeatWorkoutFromHistory, appendWorkoutSet, editFinishedWorkout, reusePreviousWorkoutSet } = loadSource(path.join(root, 'src/lib/workout-storage.ts'));
const { volumeOf } = loadSource(path.join(root, 'src/lib/types.ts'));
const media = loadSource(path.join(root, 'assets/exercises/exercise-demos.json'));
const { breathingProfiles, breathingProfileFor, breathingPhases, breathingPhaseAt, newBreathingSession, breathingElapsedMs, pauseBreathingSession, resumeBreathingSession } = loadSource(path.join(root, 'src/lib/breathing.ts'));
assert.equal(breathingProfiles.length, 4);
for (const profile of breathingProfiles) {
  assert.ok(profile.inhaleSeconds > 0 && profile.exhaleSeconds > 0);
  assert.ok([profile.inhaleSeconds, profile.holdInSeconds, profile.exhaleSeconds, profile.holdOutSeconds].every(value => Number.isInteger(value) && value >= 0 && value <= 10));
  const cycle = breathingPhases(profile).reduce((sum, phase) => sum + phase.seconds, 0);
  assert.equal(breathingPhaseAt(profile, cycle).label, '吸气');
  assert.equal(breathingPhaseAt(profile, cycle).completedCycles, 1);
  assert.equal(breathingProfileFor({ name: profile.name, isCustom: 1 }), undefined);
  assert.equal(breathingProfileFor({ name: profile.name, isCustom: 0 }).id, profile.id);
}
const box = breathingProfiles.find(profile => profile.id === 'box_breathing');
assert.deepEqual([0, 4, 8, 12, 16].map(second => breathingPhaseAt(box, second).label), ['吸气', '吸后停留', '呼气', '呼后停留', '吸气']);
assert.equal(breathingPhaseAt(box, 64).completedCycles, 4);
const gentle = breathingProfiles.find(profile => profile.id === 'diaphragmatic_breathing');
assert.equal(breathingPhases(gentle).length, 2);
assert.equal(breathingPhaseAt(gentle, 4).label, '呼气');
assert.equal(breathingPhaseAt(gentle, 8).scale, 0.6);
assert.equal(breathingPhaseAt(gentle, -1).label, '吸气');
let session = resumeBreathingSession(newBreathingSession(), 1000);
session = pauseBreathingSession(session, 4000);
assert.equal(breathingElapsedMs(session, 100000), 3000, 'Background and pause time must not count');
session = resumeBreathingSession(session, 110000);
assert.equal(breathingElapsedMs(session, 112000), 5000, 'Resume preserves prior active progress');
assert.equal(breathingElapsedMs(newBreathingSession(), 112000), 0, 'Restart resets progress');
const breathPrograms = trainingPrograms.filter(program => program.category === '呼吸训练');
assert.equal(breathPrograms.length, 6);
assert.ok(breathPrograms.flatMap(program => program.days.flatMap(day => day.exercises)).every(item => breathingProfileFor({ name: item.name, isCustom: 0 }) && item.unit === 'seconds' && item.restSeconds === 0));
assert.equal(trainingPrograms.length, 34);
assert.equal(trainingPrograms.reduce((total, program) => total + program.days.length, 0), 69);
const dayIds = trainingPrograms.flatMap(program => program.days.map(day => templatePlanId(program.id, day.id)));
assert.equal(new Set(dayIds).size, 69);
for (const program of trainingPrograms) {
  for (const field of ['category', 'level', 'frequency', 'description']) assert.ok(program[field]?.trim());
  assert.ok(program.equipment.length && program.guidance.length);
  for (const day of program.days) {
    assert.ok(day.exercises.length > 0);
    for (const exercise of day.exercises) {
      assert.ok(Number.isInteger(exercise.sets) && exercise.sets > 0);
      assert.ok(Number.isInteger(exercise.reps) && exercise.reps > 0);
      assert.ok(media.some(item => item.name === exercise.name), `Missing animation: ${exercise.name}`);
      assert.ok(exercise.unit === undefined || ['reps', 'seconds'].includes(exercise.unit));
      assert.ok(exercise.restSeconds === undefined || (Number.isInteger(exercise.restSeconds) && exercise.restSeconds >= 0 && exercise.restSeconds <= 600));
    }
  }
}

assert.equal(new Set(trainingPrograms.map(program => program.id)).size, 34);
for (const sport of ['短跑', '半马', '全马', '游泳', '铁三', '自行车', '登山', '篮球', '羽毛球']) {
  const program = trainingPrograms.find(program => program.sport === sport);
  assert.ok(program && program.category === '专项力量' && program.days.length === 2, sport);
}
assert.ok(trainingPrograms.find(program => program.id === 'hiit-full-body').days.every(day => day.exercises.every(item => item.unit === 'seconds' && item.restSeconds === 40)));
assert.ok(trainingPrograms.find(program => program.id === 'interval-20-10').days.every(day => day.exercises.every(item => item.sets === 8 && item.reps === 20 && item.restSeconds === 10)));
assert.equal(media.length, 55);
assert.equal(new Set(media.map(demo => demo.id)).size, media.length, 'Duplicate demo IDs');
assert.equal(new Set(media.map(demo => demo.name)).size, media.length, 'Duplicate demo names');
const { demoFor, demoSource, demoMediaLabel } = loadSource(path.join(root, 'src/lib/exercise-demos.ts'));
for (const demo of media) {
  for (const field of ['id', 'name', 'caption', 'source']) assert.ok(typeof demo[field] === 'string' && demo[field].trim(), `${demo.id}: invalid ${field}`);
  for (const field of ['asset', 'gifUrl', 'mediaId', 'sourceUrl', 'license', 'licenseUrl', 'mediaKind', 'referenceUrl']) {
    assert.ok(demo[field] === undefined || typeof demo[field] === 'string', `${demo.id}: ${field} must decode as an optional Swift string`);
  }
  for (const field of ['gifUrl', 'sourceUrl', 'licenseUrl', 'referenceUrl']) if (demo[field]) assert.match(demo[field], /^https:\/\//, `${demo.id}: invalid ${field}`);
  const breathing = breathingProfiles.some(profile => profile.id === demo.id && profile.name === demo.name);
  assert.equal(Number(!!demo.asset) + Number(!!demo.gifUrl), breathing ? 0 : 1, `${demo.id}: ambiguous or missing media source`);
  assert.equal(demoFor({ name: demo.name, isCustom: 0 })?.id, demo.id);
  assert.equal(demoFor({ name: demo.name, isCustom: 1 }), undefined, 'Same-name custom exercises must stay independent');
  if (demo.asset) assert.equal(demoSource(demo), path.join(root, 'assets/exercises', demo.asset), `${demo.id}: RN asset registry mismatch`);
  if (demo.gifUrl) {
    assert.match(demo.gifUrl, /^https:\/\//);
    assert.deepEqual(demoSource(demo), { uri: demo.gifUrl });
  }
}
assert.equal(typeof demoMediaLabel, 'function', 'Demos must disclose whether they are offline or need a network');
assert.equal(demoMediaLabel(media.find(demo => demo.id === 'barbell_bench')), '离线真人');
assert.equal(demoMediaLabel({ ...media.find(demo => demo.id === 'barbell_bench'), source: 'FitnessScape / Wikimedia Commons', mediaKind: 'real' }), '离线真人', 'Real footage must not be mislabeled merely because it is not from wger');
assert.equal(demoMediaLabel(media.find(demo => demo.id === 'bird_dog')), '离线示意');
assert.equal(demoMediaLabel(media.find(demo => demo.id === 'barbell_squat')), '离线真人');
assert.equal(demoMediaLabel(media.find(demo => demo.id === 'deadlift')), '离线示意');
assert.equal(media.filter(demo => demo.asset).length, 51);
assert.equal(media.filter(demo => demo.gifUrl).length, 0);
for (const demo of media) {
  assert.ok(['real', 'illustration', 'breathing'].includes(demo.mediaKind), `${demo.id}: unknown media style`);
  assert.ok(Number.isFinite(demo.aspectRatio) && demo.aspectRatio >= 0.5 && demo.aspectRatio <= 3, `${demo.id}: invalid display aspect ratio`);
  if (demo.referenceUrl) assert.equal(demo.mediaKind, 'illustration', 'Optional online references must not replace the offline primary animation');
}
assert.equal(demoMediaLabel(media.find(demo => demo.id === 'box_breathing')), '离线呼吸');
const guides = loadSource(path.join(root, 'assets/exercises/exercise-guides.json'));
const { guideFor } = loadSource(path.join(root, 'src/lib/exercise-demos.ts'));
assert.equal(typeof guideFor, 'function', 'Every built-in demonstration needs offline instruction lookup');
assert.equal(guides.length, media.length, 'Teaching coverage must match the demo catalog');
assert.deepEqual(new Set(guides.map(guide => guide.id)), new Set(media.map(demo => demo.id)));
for (const demo of media) {
  const guide = guideFor({ name: demo.name, isCustom: 0 });
  assert.equal(guide?.id, demo.id);
  for (const [field, count] of [['steps', 3], ['cues', 2], ['mistakes', 2]]) {
    assert.equal(guide[field]?.length, count, `${demo.id}: incomplete ${field}`);
    assert.ok(guide[field].every(line => typeof line === 'string' && line.trim().length > 0));
  }
  assert.equal(guideFor({ name: demo.name, isCustom: 1 }), undefined);
}
assert.equal(guideFor({ name: '不存在的动作', isCustom: 0 }), undefined);
// Frequently used lifts must play on a fresh install without network access.
const offlineLifts = ['barbell_bench', 'incline_dumbbell_press', 'dips', 'seated_row', 'dumbbell_rdl', 'leg_press', 'leg_curl', 'calf_raise', 'lateral_raise', 'reverse_fly', 'barbell_curl', 'hammer_curl', 'skull_crusher', 'pull_up', 'dumbbell_shoulder_press'];
for (const demoId of offlineLifts) {
  const demo = media.find(item => item.id === demoId);
  assert.ok(demo?.asset, `Missing offline demonstration: ${demoId}`);
  assert.equal(demo.license, 'CC BY-SA 4.0', `Missing media credit: ${demoId}`);
  assert.match(demo.source, /Goulart/);
}
const sourceRecords = loadSource(path.join(root, 'assets/exercises/media-sources.json'));
const additionalFootage = ['barbell_row', 'overhead_press', 'barbell_squat', 'leg_extension', 'bodyweight_squat', 'push_up', 'hanging_leg_raise', 'kettlebell_swing', 'romanian_deadlift'];
assert.equal(new Set(sourceRecords.map(record => record.id)).size, sourceRecords.length, 'Duplicate imported media records');
assert.deepEqual(new Set(sourceRecords.map(record => record.id)), new Set([...offlineLifts, ...additionalFootage]), 'Reviewed source records must cover both imported media batches');
for (const record of sourceRecords) {
  const demo = media.find(item => item.id === record.id);
  assert.equal(demo.asset, record.asset);
  assert.equal(demo.sourceUrl, record.sourceUrl);
  assert.equal(demo.licenseUrl, record.licenseUrl);
  assert.match(record.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(record.downloadUrl ?? record.videoUrl, /^https:\/\//);
  assert.match(record.metadataUrl, /^https:\/\//);
  assert.equal(demo.mediaKind, 'real');
  assert.ok(record.author?.trim());
  assert.ok(record.durationSeconds > 0 && record.fps > 0 && record.width >= 180);
}
for (const demo of media) if (demo.asset) {
  const bytes = fs.readFileSync(path.join(root, 'assets/exercises', demo.asset));
  assert.ok(['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString()), demo.asset);
}
assert.equal(volumeOf([{ completed: 1, weight: 20, reps: 30, unit: 'seconds' }, { completed: 1, weight: 10, reps: 8, unit: 'reps' }]), 80);
const { native, db } = database();
const plans = () => native.prepare('SELECT * FROM plans ORDER BY id').all();
const items = () => native.prepare('SELECT * FROM plan_items ORDER BY id').all();
await migrate(db);
const seededExercises = native.prepare('SELECT * FROM exercises ORDER BY id').all();
const { filterExercises, bestWeightsByExercise } = loadSource(path.join(root, 'src/lib/exercise-library.ts'));
const allFilters = { query: '', muscle: '全部' };
assert.equal(filterExercises(seededExercises, allFilters).length, seededExercises.length);
const offlineExercises = filterExercises(seededExercises, { ...allFilters, offlineOnly: true });
assert.deepEqual(new Set(offlineExercises.map(exercise => exercise.name)), new Set(media.filter(demo => !demo.gifUrl).map(demo => demo.name)), 'Offline filtering includes bundled GIFs and breathing, not remote sources');
const customBench = { id: 'custom-bench', name: 'Bench Press', muscle: '胸', equipment: 'Dumbbell', isCustom: 1 };
assert.deepEqual(filterExercises([customBench], { query: '  bench   DUMBBELL 胸  ', muscle: '全部' }), [customBench], 'Search is case-insensitive and combines spaced name/equipment/muscle terms');
assert.equal(filterExercises([customBench], { ...allFilters, muscle: '腿' }).length, 0);
const renamedCustom = { ...seededExercises[0], id: 'custom-same-name', isCustom: 1 };
assert.equal(filterExercises([renamedCustom], { ...allFilters, offlineOnly: true }).length, 0, 'Custom exercises cannot inherit offline status from a built-in name');
const sampleSet = { id: 'sample', workoutId: 'sample-workout', exerciseId: 'bench', sortOrder: 0, setNumber: 1, weight: 0, reps: 10, completed: 1 };
assert.deepEqual(bestWeightsByExercise([
  sampleSet,
  { ...sampleSet, weight: 30 },
  { ...sampleSet, weight: 25 },
  { ...sampleSet, weight: 100, completed: 0 },
  { ...sampleSet, weight: Number.NaN },
  { ...sampleSet, weight: Number.POSITIVE_INFINITY },
  { ...sampleSet, exerciseId: 'row', weight: 20 },
]), new Map([['bench', 30], ['row', 20]]), 'Best-weight lookup uses only completed positive finite weights, without displaying a zero-weight record');
const originals = { plans: plans(), items: items() };
assert.equal(originals.plans.length, 3);
for (const program of trainingPrograms) {
  assert.equal(await importPlanTemplate(db, program.id), program.days.length);
}
assert.equal(plans().length, 72);
for (const original of originals.plans) assert.deepEqual(plans().find(plan => plan.id === original.id), original);
for (const original of originals.items) assert.deepEqual(items().find(item => item.id === original.id), original);
const hiitId = 'template:hiit-full-body:a';
const hiitItems = items().filter(item => item.planId === hiitId);
assert.ok(hiitItems.length === 3 && hiitItems.every(item => item.unit === 'seconds' && item.reps === 20 && item.restSeconds === 40));
const workoutId = await startWorkoutFromPlan(db, hiitId);
assert.equal(await startWorkoutFromPlan(db, hiitId), workoutId);
const started = native.prepare('SELECT * FROM workout_sets WHERE workoutId = ?').all(workoutId);
assert.equal(started.length, 12);
assert.ok(started.every(set => set.unit === 'seconds' && set.reps === 20 && set.restSeconds === 40));
assert.match(native.prepare('SELECT note FROM workouts WHERE id = ?').get(workoutId).note, /计时/);
await appendWorkoutSet(db, workoutId, started[0].exerciseId);
const appended = native.prepare('SELECT * FROM workout_sets WHERE workoutId = ? AND exerciseId = ? ORDER BY setNumber DESC LIMIT 1').get(workoutId, started[0].exerciseId);
assert.equal(appended.setNumber, 5);
assert.equal(appended.unit, 'seconds');
assert.equal(appended.restSeconds, 40);
native.prepare('UPDATE workouts SET endedAt = ? WHERE id = ?').run('2026-10-03', workoutId);
await assert.rejects(repeatWorkoutFromHistory(db, 'missing-workout'), /没有找到/);
await assert.rejects(repeatWorkoutFromHistory(db, workoutId), /没有完成的组/);
const repetitions = started.filter(set => set.sortOrder === 0);
native.prepare('UPDATE workout_sets SET completed = 1, reps = 25, weight = 12.5 WHERE id IN (?, ?)').run(repetitions[0].id, repetitions[2].id);
native.prepare('UPDATE workout_sets SET completed = 1, reps = 8, weight = 20, unit = ?, restSeconds = 0 WHERE id = ?').run('reps', started.find(set => set.sortOrder === 1).id);
const findWorkout = native.prepare('SELECT * FROM workouts WHERE id = ?');
const workoutSets = native.prepare('SELECT * FROM workout_sets WHERE workoutId = ? ORDER BY sortOrder, setNumber');
const originalWorkout = findWorkout.get(workoutId);
const originalSets = workoutSets.all(workoutId);
native.exec(`CREATE TRIGGER fail_repeat BEFORE INSERT ON workout_sets WHEN NEW.sortOrder = 1 BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
await assert.rejects(repeatWorkoutFromHistory(db, workoutId), /forced failure/);
assert.equal(native.prepare('SELECT COUNT(*) AS count FROM workouts WHERE endedAt IS NULL').get().count, 0, 'Failed repeat must roll back its draft');
assert.equal(native.prepare('SELECT COUNT(*) AS count FROM workout_sets').get().count, originalSets.length, 'Failed repeat must roll back copied sets');
native.exec('DROP TRIGGER fail_repeat');
const repeatedId = await repeatWorkoutFromHistory(db, workoutId);
assert.ok(repeatedId && repeatedId !== workoutId);
const repeatedWorkout = findWorkout.get(repeatedId);
assert.equal(repeatedWorkout.planId, hiitId);
assert.equal(repeatedWorkout.name, originalWorkout.name);
assert.equal(repeatedWorkout.note, '');
assert.equal(repeatedWorkout.endedAt, null);
const repeatedSets = workoutSets.all(repeatedId);
assert.deepEqual(repeatedSets.map(({ sortOrder, setNumber, weight, reps, completed, unit, restSeconds }) => [sortOrder, setNumber, weight, reps, completed, unit, restSeconds]), [
  [0, 1, 12.5, 25, 0, 'seconds', 40], [0, 2, 12.5, 25, 0, 'seconds', 40], [1, 1, 20, 8, 0, 'reps', 0],
]);
assert.deepEqual(repeatedSets.map(set => set.exerciseId), originalSets.filter(set => set.completed).map(set => set.exerciseId));
assert.ok(repeatedSets.every(set => !originalSets.some(original => original.id === set.id)));
assert.equal(await repeatWorkoutFromHistory(db, workoutId), null, 'Repeat must preserve the existing draft');
assert.deepEqual(findWorkout.get(workoutId), originalWorkout);
assert.deepEqual(workoutSets.all(workoutId), originalSets);
assert.deepEqual(workoutSets.all(repeatedId), repeatedSets);

const editableSet = ({ id, weight, reps, completed }) => ({ id, weight, reps, completed });
const draftEdit = { name: '编辑草稿', note: '', sets: repeatedSets.map(set => ({ ...editableSet(set), completed: 1 })) };
await assert.rejects(editFinishedWorkout(db, repeatedId, draftEdit), /已结束/);
assert.deepEqual(findWorkout.get(repeatedId), repeatedWorkout);
assert.deepEqual(workoutSets.all(repeatedId), repeatedSets);

const legacySetId = originalSets.find(set => set.sortOrder === 0 && set.setNumber === 3).id;
native.prepare('UPDATE workout_sets SET weight = 2100, reps = 1200 WHERE id = ?').run(legacySetId);
const storedSets = workoutSets.all(workoutId);
const edit = {
  name: '  修正的训练  ', note: '  修正后的笔记  ',
  sets: storedSets.map(set => {
    const editable = editableSet(set);
    if (set.sortOrder === 0 && set.setNumber === 1) return { ...editable, completed: 0 };
    if (set.sortOrder === 0 && set.setNumber === 2) return { ...editable, completed: 1, reps: 42 };
    if (set.sortOrder === 1 && set.completed) return { ...editable, weight: 23.5, reps: 9 };
    return editable;
  }),
};
await assert.rejects(editFinishedWorkout(db, 'missing-workout', edit), /已结束/);
await assert.rejects(editFinishedWorkout(db, workoutId, { ...edit, name: ' ' }), /训练名称/);
await assert.rejects(editFinishedWorkout(db, workoutId, { ...edit, sets: edit.sets.slice(1) }), /已变更/);
for (const [invalidSet, error] of [
  [{ id: edit.sets[1].id }, /已变更/],
  [{ id: repeatedSets[0].id }, /已变更/],
  [{ weight: Number.NaN }, /重量/],
  [{ weight: 2001 }, /重量/],
  [{ reps: 0.5 }, /整数/],
  [{ reps: 1001 }, /整数/],
  [{ completed: 2 }, /完成状态/],
  [{ completed: 1, reps: 0 }, /大于 0/],
]) {
  await assert.rejects(editFinishedWorkout(db, workoutId, { ...edit, sets: [{ ...edit.sets[0], ...invalidSet }, ...edit.sets.slice(1)] }), error);
}
await assert.rejects(editFinishedWorkout(db, workoutId, { ...edit, sets: edit.sets.map(set => ({ ...set, completed: 0 })) }), /至少保留/);
native.exec(`CREATE TRIGGER fail_edit BEFORE UPDATE ON workout_sets WHEN NEW.sortOrder = 1 BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
await assert.rejects(editFinishedWorkout(db, workoutId, edit), /forced failure/);
assert.deepEqual(findWorkout.get(workoutId), originalWorkout, 'Failed edit must roll back metadata');
assert.deepEqual(workoutSets.all(workoutId), storedSets, 'Failed edit must roll back earlier sets');
native.exec('DROP TRIGGER fail_edit');
await editFinishedWorkout(db, workoutId, edit);
assert.deepEqual({ ...findWorkout.get(workoutId) }, { ...originalWorkout, name: '修正的训练', note: '修正后的笔记' });
assert.deepEqual(workoutSets.all(workoutId).map(set => ({ ...set })), storedSets.map((set, index) => ({ ...set, ...edit.sets[index] })));

native.prepare('DELETE FROM workouts WHERE id = ?').run(repeatedId);
await assert.rejects(startWorkoutFromPlan(db, 'missing-plan'), /没有找到/);
const sprintWorkout = await startWorkoutFromPlan(db, 'template:sprint-strength:a');
assert.ok(native.prepare('SELECT * FROM workout_sets WHERE workoutId = ?').all(sprintWorkout).some(set => set.unit === 'reps' && set.restSeconds === 180));
native.prepare('UPDATE workouts SET endedAt = ? WHERE id = ?').run('2026-10-04', sprintWorkout);
const breathWorkout = await startWorkoutFromPlan(db, 'template:breathing-beginner:practice');
const breathSet = native.prepare('SELECT * FROM workout_sets WHERE workoutId = ?').get(breathWorkout);
assert.equal(breathSet.reps, 120);
assert.equal(breathSet.unit, 'seconds');
assert.equal(breathSet.restSeconds, 0);
assert.doesNotMatch(native.prepare('SELECT note FROM workouts WHERE id = ?').get(breathWorkout).note, /单侧|重量请/);
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
assert.equal(plans().length, 72);
await assert.rejects(importPlanTemplate(db, 'unknown'), /没有找到/);

// The calendar accepts several plans per day, and retrying one pair is safe.
const scheduledDay = '2026-11-09';
const nextScheduledDay = '2026-11-10';
assert.deepEqual(await readTrainingSchedule(db), []);
await insertScheduledTraining(db, nextScheduledDay, hiitId);
await insertScheduledTraining(db, scheduledDay, hiitId);
await insertScheduledTraining(db, scheduledDay, editedId);
await insertScheduledTraining(db, scheduledDay, hiitId);
const scheduleEntries = [editedId, hiitId].sort().map(planId => ({ day: scheduledDay, planId }));
scheduleEntries.push({ day: nextScheduledDay, planId: hiitId });
const scheduleRows = async sourceDb => (await readTrainingSchedule(sourceDb)).map(entry => ({ ...entry }));
assert.deepEqual(await scheduleRows(db), scheduleEntries);
await assert.rejects(insertScheduledTraining(db, '2026-02-29', hiitId), /有效的训练日期/);
await assert.rejects(removeScheduledTraining(db, '2026-11-9', hiitId), /有效的训练日期/);
native.exec('PRAGMA foreign_keys = OFF');
await assert.rejects(insertScheduledTraining(db, scheduledDay, 'missing-plan'), /没有找到/);
native.exec('PRAGMA foreign_keys = ON');
await removeScheduledTraining(db, scheduledDay, editedId);
await removeScheduledTraining(db, scheduledDay, editedId);
assert.deepEqual(await scheduleRows(db), scheduleEntries.filter(entry => entry.planId !== editedId));
await insertScheduledTraining(db, scheduledDay, editedId);
native.prepare('INSERT INTO plans VALUES (?, ?, ?, ?)').run('schedule-delete', '临时计划', '', '2026-11-04');
await insertScheduledTraining(db, scheduledDay, 'schedule-delete');
await insertScheduledTraining(db, nextScheduledDay, 'schedule-delete');
await writePlanFavorite(db, 'schedule-delete', true);
native.prepare('DELETE FROM plans WHERE id = ?').run('schedule-delete');
assert.deepEqual(await scheduleRows(db), scheduleEntries, 'Deleting a plan only clears its scheduled days');
assert.deepEqual(await readFavoritePlanIds(db), [], 'Deleting a plan clears its favorite status');

// Favorites use plan IDs and keep repeated explicit add/remove operations idempotent.
await writePlanFavorite(db, hiitId, true);
await writePlanFavorite(db, hiitId, true);
await writePlanFavorite(db, editedId, true);
const favoritePlanIds = [editedId, hiitId].sort();
assert.deepEqual(await readFavoritePlanIds(db), favoritePlanIds);
await writePlanFavorite(db, editedId, false);
await writePlanFavorite(db, editedId, false);
assert.deepEqual(await readFavoritePlanIds(db), [hiitId]);
await writePlanFavorite(db, editedId, true);
native.exec('PRAGMA foreign_keys = OFF');
await assert.rejects(writePlanFavorite(db, 'missing-plan', true), /没有找到/);
await assert.rejects(writePlanFavorite(db, 'missing-plan', false), /没有找到/);
native.exec('PRAGMA foreign_keys = ON');
await assert.rejects(writePlanFavorite(db, hiitId, 'true'), /收藏状态/);
assert.deepEqual(await readFavoritePlanIds(db), favoritePlanIds);

// Backup export/import: full round-trip fidelity, validation errors and atomic rollback.
const { exportBackup, parseBackup, importBackup, BACKUP_VERSION } = loadSource(path.join(root, 'src/lib/backup.ts'));
native.prepare('INSERT INTO body_entries VALUES (?, ?, ?, ?)').run('body-1', '2026-10-20', 72.5, 18);
native.prepare('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('food-1', '2026-10-20', '午餐', '鸡胸肉', '150g', 248, 46, 0, 5);
assert.equal(await readWeeklyGoal(db), 0);
await writeWeeklyGoal(db, 4);
for (const invalid of [-1, 8, 2.5, '4', Infinity, NaN]) {
  await assert.rejects(writeWeeklyGoal(db, invalid), /每周训练目标/);
}
const backup = await exportBackup(db);
assert.equal(backup.app, 'lianji');
assert.equal(backup.version, BACKUP_VERSION);
assert.equal(backup.weeklyGoal, 4);
assert.deepEqual(backup.schedule.map(entry => ({ ...entry })), scheduleEntries);
assert.deepEqual(backup.favoritePlanIds, favoritePlanIds);
assert.equal(backup.tables.plans.length, 72);
assert.equal(backup.tables.body_entries.length, 1);
assert.equal(backup.tables.food_entries.length, 1);
const backupText = JSON.stringify(backup);
const restored = database();
await migrate(restored.db);
// The Expo restore transaction uses a connection without the migration's FK setting.
restored.native.exec('PRAGMA foreign_keys = OFF');
await importBackup(restored.db, parseBackup(backupText));
assert.equal(await readWeeklyGoal(restored.db), 4);
assert.deepEqual(await scheduleRows(restored.db), scheduleEntries);
assert.deepEqual(await readFavoritePlanIds(restored.db), favoritePlanIds);
for (const table of ['exercises', 'plans', 'plan_items', 'workouts', 'workout_sets', 'body_entries', 'food_entries']) {
  assert.deepEqual(restored.native.prepare(`SELECT * FROM ${table} ORDER BY id`).all(), native.prepare(`SELECT * FROM ${table} ORDER BY id`).all(), `round-trip mismatch in ${table}`);
}
assert.throws(() => parseBackup('not json'), /JSON/);
assert.throws(() => parseBackup(JSON.stringify({ app: 'other', version: 1, tables: {} })), /练迹/);
assert.throws(() => parseBackup(JSON.stringify({ ...backup, version: BACKUP_VERSION + 1 })), /不兼容/);
assert.throws(() => parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, plans: null } })), /缺少/);
assert.throws(() => parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, plans: [{ name: '无 id' }] } })), /损坏/);
for (const weeklyGoal of [-1, 8, 2.5, '4', null, false]) {
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, weeklyGoal })), /每周训练目标/);
}
for (const invalidSchedule of [null, {}, [null], [{ day: '2026-02-29', planId: hiitId }], [{ day: scheduledDay, planId: 'missing-plan' }]]) {
  const invalid = { ...backup, schedule: invalidSchedule };
  assert.throws(() => parseBackup(JSON.stringify(invalid)), /训练日程/);
  await assert.rejects(importBackup(restored.db, invalid), /训练日程/);
}
const duplicateSchedule = { ...backup, schedule: [scheduleEntries[0], scheduleEntries[0]] };
assert.throws(() => parseBackup(JSON.stringify(duplicateSchedule)), /重复/);
await assert.rejects(importBackup(restored.db, duplicateSchedule), /重复/);
assert.deepEqual(await scheduleRows(restored.db), scheduleEntries);
for (const invalidFavoriteIds of [null, {}, [null], [''], [23], ['missing-plan'], [hiitId, hiitId]]) {
  const invalid = { ...backup, favoritePlanIds: invalidFavoriteIds };
  assert.throws(() => parseBackup(JSON.stringify(invalid)), /收藏计划/);
  await assert.rejects(importBackup(restored.db, invalid), /收藏计划/);
}
assert.deepEqual(await readFavoritePlanIds(restored.db), favoritePlanIds);
const oldBackup = { ...backup };
delete oldBackup.weeklyGoal;
delete oldBackup.schedule;
delete oldBackup.favoritePlanIds;
await writeWeeklyGoal(restored.db, 7);
restored.native.prepare('DELETE FROM food_entries').run();
await importBackup(restored.db, parseBackup(JSON.stringify(oldBackup)));
assert.equal(await readWeeklyGoal(restored.db), 7, 'Old backups preserve the current goal');
assert.deepEqual(await scheduleRows(restored.db), [], 'Old backups clear schedules tied to the replaced plans');
assert.deepEqual(await readFavoritePlanIds(restored.db), [], 'Old backups clear favorites tied to the replaced plans');
assert.equal(restored.native.prepare('SELECT COUNT(*) AS count FROM food_entries').get().count, 1);
await importBackup(restored.db, parseBackup(JSON.stringify({ ...backup, weeklyGoal: 0 })));
assert.equal(await readWeeklyGoal(restored.db), 0, 'An explicit zero disables the goal');
assert.deepEqual(await readFavoritePlanIds(restored.db), favoritePlanIds);
await importBackup(restored.db, parseBackup(JSON.stringify({ ...backup, favoritePlanIds: [] })));
assert.deepEqual(await readFavoritePlanIds(restored.db), [], 'An explicit empty array clears favorites');
const appleBackup = {
  app: 'lianji', version: 1, exportedAt: '2026-11-06T02:13:00.000Z', weeklyGoal: 0,
  schedule: [{ day: '2026-11-06', planId: 'plan-a' }],
  favoritePlanIds: ['plan-a'],
  tables: {
    exercises: [
      { id: 'ex-a', name: '杠铃卧推', muscle: '胸', equipment: '杠铃', isCustom: 0 },
      { id: 'ex-b', name: '自定义', muscle: '胸', equipment: '哑铃', isCustom: 1 },
    ],
    plans: [{ id: 'plan-a', name: '推日', note: '', createdAt: '2026-11-01T00:00:00.000Z' }],
    plan_items: [{ id: 'item-a', planId: 'plan-a', exerciseId: 'ex-a', sortOrder: 0, sets: 3, reps: 8, weight: 40, unit: 'reps', restSeconds: 90 }],
    workouts: [{ id: 'wo-a', planId: null, name: '自由训练', startedAt: '2026-11-06T01:00:00.000Z', endedAt: '2026-11-06T02:00:00.000Z', note: '' }],
    workout_sets: [{ id: 'set-a', workoutId: 'wo-a', exerciseId: 'ex-a', sortOrder: 0, setNumber: 1, weight: 40, reps: 8, completed: 1, unit: 'reps', restSeconds: 90 }],
    body_entries: [{ id: 'body-a', recordedAt: '2026-11-06T00:00:00.000Z', weight: 70, bodyFat: null }],
    food_entries: [{ id: 'food-a', loggedAt: '2026-11-06T00:30:00.000Z', meal: '早餐', name: '鸡蛋', portion: '2个', calories: 140, protein: 12, carbs: 1, fat: 10 }],
  },
};
await importBackup(restored.db, parseBackup(JSON.stringify(appleBackup)));
assert.equal(await readWeeklyGoal(restored.db), 0);
assert.deepEqual(await scheduleRows(restored.db), [{ day: '2026-11-06', planId: 'plan-a' }]);
assert.deepEqual(await readFavoritePlanIds(restored.db), ['plan-a']);
assert.deepEqual((await exportBackup(restored.db)).favoritePlanIds, ['plan-a'], 'native favorites survive mobile restore and re-export');
assert.equal(restored.native.prepare('SELECT planId FROM workouts WHERE id = ?').get('wo-a').planId, null);
assert.equal(restored.native.prepare('SELECT bodyFat FROM body_entries WHERE id = ?').get('body-a').bodyFat, null);
assert.equal(restored.native.prepare('SELECT isCustom FROM exercises WHERE id = ?').get('ex-b').isCustom, 1);
restored.native.close();
const rollback = database();
await migrate(rollback.db);
await writeWeeklyGoal(rollback.db, 2);
const originalSchedule = { day: scheduledDay, planId: rollback.native.prepare('SELECT id FROM plans LIMIT 1').get().id };
await insertScheduledTraining(rollback.db, originalSchedule.day, originalSchedule.planId);
await writePlanFavorite(rollback.db, originalSchedule.planId, true);
rollback.native.exec('PRAGMA foreign_keys = OFF');
rollback.native.exec(`CREATE TRIGGER fail_backup_body BEFORE INSERT ON body_entries BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
await assert.rejects(importBackup(rollback.db, parseBackup(backupText)), /forced failure/);
assert.equal(await readWeeklyGoal(rollback.db), 2, 'Failed import must roll back the goal');
assert.deepEqual(await scheduleRows(rollback.db), [originalSchedule], 'Failed import must roll back schedule replacement');
assert.deepEqual(await readFavoritePlanIds(rollback.db), [originalSchedule.planId], 'Failed import must roll back favorites');
assert.equal(rollback.native.prepare('SELECT COUNT(*) AS count FROM plans').get().count, 3, 'failed import must roll back to the original data');
assert.equal(rollback.native.prepare('SELECT COUNT(*) AS count FROM exercises').get().count, 55);
assert.equal(rollback.native.prepare('SELECT COUNT(*) AS count FROM body_entries').get().count, 0);
rollback.native.close();
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
legacy.native.exec('DROP TABLE training_preferences; DROP TABLE training_schedule; DROP TABLE plan_favorites');
legacy.native.exec("DELETE FROM exercises WHERE id LIKE 'builtin:%'");
// Remove the new columns to reproduce an actual v1.0.2 schema.
for (const table of ['plan_items', 'workout_sets']) {
  legacy.native.exec(`ALTER TABLE ${table} DROP COLUMN unit; ALTER TABLE ${table} DROP COLUMN restSeconds;`);
}
legacy.native.prepare('INSERT INTO exercises VALUES (?, ?, ?, ?, 1)').run('custom-squat', '自重深蹲', '腿', '自定义');
legacy.native.prepare('UPDATE plans SET name = ? WHERE rowid = (SELECT MIN(rowid) FROM plans)').run('已编辑计划');
legacy.native.prepare('INSERT INTO workouts VALUES (?, NULL, ?, ?, ?, ?)').run('saved-workout', '保留训练', '2026-10-01', '2026-10-01', '我的笔记');
const keptExercise = legacy.native.prepare('SELECT id FROM exercises LIMIT 1').get().id;
legacy.native.prepare('INSERT INTO workout_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('saved-set', 'saved-workout', keptExercise, 0, 1, 20, 7, 1);
const savedSet = legacy.native.prepare('SELECT * FROM workout_sets WHERE id = ?').get('saved-set');
const savedPlans = legacy.native.prepare('SELECT * FROM plans ORDER BY id').all();
const savedItems = legacy.native.prepare('SELECT * FROM plan_items ORDER BY id').all();
const savedWorkouts = legacy.native.prepare('SELECT * FROM workouts ORDER BY id').all();
await migrate(legacy.db);
assert.equal(await readWeeklyGoal(legacy.db), 0);
assert.deepEqual(await scheduleRows(legacy.db), []);
assert.deepEqual(await readFavoritePlanIds(legacy.db), []);
await insertScheduledTraining(legacy.db, scheduledDay, savedPlans[0].id);
await writePlanFavorite(legacy.db, savedPlans[0].id, true);
await writeWeeklyGoal(legacy.db, 5);
await migrate(legacy.db);
assert.equal(await readWeeklyGoal(legacy.db), 5);
assert.deepEqual(await scheduleRows(legacy.db), [{ day: scheduledDay, planId: savedPlans[0].id }]);
assert.deepEqual(await readFavoritePlanIds(legacy.db), [savedPlans[0].id]);
assert.equal(legacy.native.prepare('SELECT COUNT(*) AS count FROM exercises WHERE isCustom = 0').get().count, 55);
assert.equal(legacy.native.prepare('SELECT COUNT(*) AS count FROM exercises WHERE isCustom = 1').get().count, 1);
assert.deepEqual(legacy.native.prepare('SELECT * FROM plans ORDER BY id').all(), savedPlans);
const legacyItems = legacy.native.prepare('SELECT * FROM plan_items ORDER BY id').all();
assert.deepEqual(legacyItems.map(({unit, restSeconds, ...original}) => original), savedItems.map(item => ({...item})));
assert.ok(legacyItems.every(item => item.unit === 'reps' && item.restSeconds === 90));
const { unit, restSeconds, ...preservedSet } = legacy.native.prepare('SELECT * FROM workout_sets WHERE id = ?').get('saved-set');
assert.deepEqual(preservedSet, {...savedSet});
assert.equal(unit, 'reps'); assert.equal(restSeconds, 90);
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

// Progress uses saved sessions, completed sets, stable exercise IDs and the original unit.
const { buildTrainingProgress, buildWeeklyTrainingActivity, localDayKey, workoutMilestones } = loadSource(path.join(root, 'src/lib/training-progress.ts'));
const loggedWorkout = (id, day, finished = true) => ({
  id, startedAt: new Date(2026, 10, day, 23, 45).toISOString(),
  endedAt: finished ? new Date(2026, 10, day + 1, 0, 15).toISOString() : null,
});
const earlier = loggedWorkout('earlier', 1);
const current = loggedWorkout('current', 2);
const draft = loggedWorkout('draft', 3, false);
const empty = loggedWorkout('empty', 4);
const loggedSet = (workout, exerciseId, weight, reps, unit, completed = 1) => ({
  workoutId: workout.id, exerciseId, weight, reps, unit, completed,
});
const loggedSets = [
  loggedSet(earlier, 'press', 40, 8),
  loggedSet(earlier, 'timed', 15, 30, 'seconds'),
  loggedSet(current, 'press', 45, 7, 'reps'),
  loggedSet(current, 'press', 45, 8, 'reps'),
  loggedSet(current, 'press', 30, 12, 'reps'),
  loggedSet(current, 'press', 100, 100, 'reps', 0),
  loggedSet(current, 'timed', 25, 50, 'seconds'),
  loggedSet(current, 'custom-press', 0, 16, 'reps'),
  loggedSet(draft, 'press', 200, 30, 'reps'),
];
const { sessions, byExercise } = buildTrainingProgress([current, draft, empty, earlier], loggedSets);
assert.deepEqual(sessions.map(session => session.workout.id), ['empty', 'current', 'earlier']);
assert.equal(sessions[1].day, '2026-11-02', 'a session belongs to its local start date');
assert.equal(sessions[0].completedSets, 0);
assert.equal(sessions[1].completedSets, 5);
assert.equal(sessions[1].exerciseCount, 3);
assert.equal(sessions[1].volume, 1035);
assert.equal(sessions[1].timedSeconds, 50);
assert.equal(byExercise.get('press').best.weight.weight, 45);
assert.equal(byExercise.get('press').best.weight.weightReps, 8);
assert.equal(byExercise.get('press').best.reps.reps, 12);
assert.equal(byExercise.get('timed').best.seconds.seconds, 50);
assert.equal(byExercise.get('timed').best.reps, undefined);
assert.equal(byExercise.get('custom-press').best.weight, undefined);
assert.equal(byExercise.get('custom-press').best.reps.reps, 16);
assert.deepEqual(workoutMilestones(current, byExercise).map(({ metric, value, previous }) => [metric, value, previous]), [
  ['weight', 45, 40], ['reps', 12, 8], ['seconds', 50, 30], ['reps', 16, 0],
]);
assert.deepEqual(workoutMilestones(draft, byExercise), []);
const tied = loggedWorkout('tied', 5);
const tiedProgress = buildTrainingProgress([earlier, tied], [...loggedSets, loggedSet(tied, 'press', 40, 8)]);
assert.deepEqual(workoutMilestones(tied, tiedProgress.byExercise), [], 'equal scores do not create new records');

// The goal counts distinct local training days across Sunday/Monday and month boundaries.
const secondMonday = loggedWorkout('second-monday', 2);
const weeklySessions = buildTrainingProgress(
  [earlier, current, draft, empty, tied, secondMonday],
  [...loggedSets, loggedSet(tied, 'press', 40, 8), loggedSet(secondMonday, 'press', 25, 7)],
).sessions;
const mondayActivity = buildWeeklyTrainingActivity(weeklySessions, new Date(2026, 10, 2, 20));
assert.deepEqual(mondayActivity.map(week => localDayKey(week.start)), ['2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12']);
assert.deepEqual(mondayActivity.map(week => week.count), [1, 1, 0, 0], 'same-day sessions count once and future dates are excluded');
assert.equal(mondayActivity[0].days[0].today, true);
assert.equal(mondayActivity[1].days[6].trained, true);
assert.deepEqual(buildWeeklyTrainingActivity(weeklySessions, new Date(2026, 10, 8, 20)).map(week => week.count), [2, 1, 0, 0], 'unfinished and empty workouts do not count');
const newYear = buildWeeklyTrainingActivity([], new Date(2027, 0, 1, 12));
assert.equal(localDayKey(newYear[0].start), '2026-12-28');
assert.equal(newYear[0].days.find(day => day.today)?.key, '2027-01-01');

// Arrangements use the local start date and stable plan ID of a saved workout with a completed group.
const { completedScheduleKeys, isScheduleDay, parseScheduleDay, scheduleStatus } = loadSource(path.join(root, 'src/lib/training-schedule.ts'));
assert.equal(isScheduleDay('2028-02-29'), true);
assert.equal(isScheduleDay('2026-02-29'), false);
assert.equal(isScheduleDay('2026-11-31'), false);
assert.equal(isScheduleDay('2026-11-2'), false);
assert.equal(isScheduleDay('0000-01-01'), false);
assert.equal(parseScheduleDay('2026-13-01'), null);
assert.equal(localDayKey(parseScheduleDay('0999-12-31')), '0999-12-31');
assert.equal(localDayKey(parseScheduleDay('2026-11-01')), '2026-11-01');

const scheduledWorkouts = [
  { ...loggedWorkout('planned', 2), planId: 'plan-a' },
  { ...loggedWorkout('pending', 2, false), planId: 'plan-b' },
  { ...loggedWorkout('unchecked', 2), planId: 'plan-c' },
  { ...loggedWorkout('free', 2), planId: null },
  { ...loggedWorkout('future', 4), planId: 'plan-a' },
];
const scheduleKeys = completedScheduleKeys(scheduledWorkouts, scheduledWorkouts.map(workout =>
  loggedSet(workout, 'press', 0, 10, 'reps', workout.id === 'unchecked' ? 0 : 1)));
const dateStatus = (day, planId) => scheduleStatus({ day, planId }, '2026-11-02', scheduleKeys);
assert.equal(dateStatus('2026-11-02', 'plan-a'), '已完成');
assert.equal(dateStatus('2026-11-02', 'plan-b'), '待训练');
assert.equal(dateStatus('2026-11-02', 'plan-c'), '待训练');
assert.equal(dateStatus('2026-11-01', 'plan-a'), '已错过');
assert.equal(dateStatus('2026-11-03', 'plan-a'), '已安排');
assert.equal(dateStatus('2026-11-04', 'plan-a'), '已安排', 'future local dates never show as done');

// A plan takes each exercise's latest completed target and counts groups with that unit.
const { draftPlanFromWorkout } = loadSource(path.join(root, 'src/lib/workout-plan.ts'));
const draftSet = (exerciseId, sortOrder, setNumber, weight, reps, unit, restSeconds, completed = 1) =>
  ({ exerciseId, sortOrder, setNumber, weight, reps, unit, restSeconds, completed });
const capped = Array.from({ length: 21 }, (_, index) =>
  draftSet('custom-press', 2, index + 1, 2100, 1200, undefined, 750));
assert.deepEqual(draftPlanFromWorkout([
  ...capped,
  draftSet('press', 0, 4, 200, 12, 'reps', 60, 0),
  draftSet('timed', 1, 3, 0, 75, 'seconds', 0),
  draftSet('press', 0, 2, 65.5, 6, 'reps', 120),
  draftSet('timed', 1, 1, 0, 40, 'seconds'),
  draftSet('timed', 1, 2, 0, 10, 'reps', 90),
  draftSet('press', 0, 1, 50, 8),
  draftSet('press', 0, 3, 90, 0, 'reps'),
  draftSet('unused', 3, 1, 0, 10, 'reps', 90, 0),
]), [
  { exerciseId: 'press', unit: 'reps', sets: 2, reps: 6, weight: 65.5, restSeconds: 120 },
  { exerciseId: 'timed', unit: 'seconds', sets: 2, reps: 75, weight: 0, restSeconds: 0 },
  { exerciseId: 'custom-press', unit: 'reps', sets: 20, reps: 1000, weight: 2000, restSeconds: 600 },
]);
assert.deepEqual(draftPlanFromWorkout([draftSet('press', 0, 1, 40, 8)]), [
  { exerciseId: 'press', unit: 'reps', sets: 1, reps: 8, weight: 40, restSeconds: 90 },
]);

// Comparison looks back from the source start, matching exercise/unit or stable plan ID.
const { findPreviousExerciseSets, findWorkoutComparison } = loadSource(path.join(root, 'src/lib/training-comparison.ts'));
const comparisonWorkout = (id, start, end, planId = 'plan-a', name = '训练') => ({
  id, name, planId, note: '', startedAt: `2026-11-15T${start}:00Z`, endedAt: end ? `2026-11-15T${end}:00Z` : null,
});
const sourceWorkout = comparisonWorkout('source', '10:00', '10:00');
const sourceDraft = { ...sourceWorkout, endedAt: null };
const previousPlanWorkout = comparisonWorkout('previous-plan', '08:00', '09:00', 'plan-a', '旧训练名称');
const equalBoundaryWorkout = comparisonWorkout('equal-boundary', '09:10', '10:00', 'plan-b');
const earlierFinishWorkout = comparisonWorkout('earlier-finish', '09:10', '09:55', 'plan-b');
const earlierStartWorkout = comparisonWorkout('earlier-start', '09:05', '09:59', 'plan-b');
const emptyPreviousWorkout = comparisonWorkout('empty-previous', '09:15', '09:45');
const overlapWorkout = comparisonWorkout('overlap', '09:45', '10:01');
const unfinishedWorkout = comparisonWorkout('unfinished', '09:50', null);
const invalidDateWorkout = { ...comparisonWorkout('invalid-date', '09:55', '09:59'), endedAt: 'invalid' };
const reversedDatesWorkout = comparisonWorkout('reversed-dates', '09:58', '09:56');
const comparisonWorkouts = [
  overlapWorkout, earlierStartWorkout, sourceWorkout, emptyPreviousWorkout, unfinishedWorkout,
  previousPlanWorkout, invalidDateWorkout, reversedDatesWorkout, earlierFinishWorkout, equalBoundaryWorkout,
];
const comparisonSet = (workout, exerciseId, setNumber, weight, reps, unit, completed = 1) => ({
  ...loggedSet(workout, exerciseId, weight, reps, unit, completed), id: `${workout.id}/${exerciseId}/${setNumber}`, sortOrder: 0, setNumber,
});
const eligibleReps = [
  comparisonSet(equalBoundaryWorkout, 'press', 3, 50, 7, 'reps'),
  comparisonSet(equalBoundaryWorkout, 'press', 1, 45, 9),
];
const eligibleTimed = comparisonSet(previousPlanWorkout, 'press', 2, 99, 45, 'seconds');
const comparisonSets = [
  comparisonSet(overlapWorkout, 'press', 1, 99, 99),
  comparisonSet(unfinishedWorkout, 'press', 1, 99, 99),
  comparisonSet(invalidDateWorkout, 'press', 1, 99, 99),
  comparisonSet(reversedDatesWorkout, 'press', 1, 99, 99),
  comparisonSet(earlierFinishWorkout, 'press', 1, 99, 99),
  comparisonSet(earlierFinishWorkout, 'row', 1, 30, 8),
  comparisonSet(earlierStartWorkout, 'row', 1, 40, 8),
  comparisonSet(emptyPreviousWorkout, 'press', 1, 99, 99, 'reps', 0),
  comparisonSet(emptyPreviousWorkout, 'press', 2, 99, 0, 'seconds'),
  comparisonSet(emptyPreviousWorkout, 'press', 3, 99, -4),
  comparisonSet(equalBoundaryWorkout, 'press', 2, 99, 99, 'reps', 0),
  comparisonSet(equalBoundaryWorkout, 'press', 4, 99, NaN, 'reps'),
  ...eligibleReps,
  comparisonSet(previousPlanWorkout, 'press', 1, 40, 8),
  eligibleTimed,
  comparisonSet(previousPlanWorkout, 'row', 1, 45.5, 6, 'reps'),
  comparisonSet(previousPlanWorkout, 'hold', 1, 150, 30, 'seconds'),
  comparisonSet(sourceWorkout, 'press', 1, 55, 7, 'reps'),
  comparisonSet(sourceWorkout, 'press', 2, 200, 65, 'seconds'),
  comparisonSet(sourceWorkout, 'row', 1, 30.5, 12),
  comparisonSet(sourceWorkout, 'fresh-custom-press', 1, 150, 20, 'reps', 0),
];
const previousExerciseSets = findPreviousExerciseSets(sourceDraft, comparisonWorkouts, comparisonSets);
const previousPress = previousExerciseSets.get('press');
assert.equal(previousPress.reps.workout.id, equalBoundaryWorkout.id, 'a saved workout ending at the exact start is eligible');
assert.deepEqual(previousPress.reps.sets.map(set => set.id).sort(), eligibleReps.map(set => set.id).sort(), 'legacy reps and explicit reps share a unit, but invalid or unchecked groups are omitted');
assert.equal(previousPress.seconds.workout.id, previousPlanWorkout.id, 'units can reference separate workouts');
assert.deepEqual(previousPress.seconds.sets, [eligibleTimed]);
assert.equal(previousExerciseSets.get('row').reps.workout.id, earlierFinishWorkout.id, 'choose latest start among workouts that finished before the cutoff');
assert.equal(previousExerciseSets.get('fresh-custom-press'), undefined);
assert.equal(previousExerciseSets.get('hold').reps, undefined);
assert.deepEqual(findPreviousExerciseSets(sourceWorkout, comparisonWorkouts, comparisonSets), previousExerciseSets, 'the source cannot become its own reference');
assert.deepEqual(findWorkoutComparison(sourceWorkout, comparisonWorkouts, comparisonSets), {
  previousWorkout: previousPlanWorkout,
  current: { completedSets: 3, volume: 751, timedSeconds: 65 },
  previous: { completedSets: 4, volume: 593, timedSeconds: 75 },
});
const samePlanBoundary = comparisonWorkouts.map(workout => workout.id === equalBoundaryWorkout.id
  ? { ...workout, planId: sourceWorkout.planId } : workout);
assert.equal(findWorkoutComparison(sourceWorkout, samePlanBoundary, comparisonSets)?.previousWorkout.id, equalBoundaryWorkout.id);
assert.equal(findWorkoutComparison(sourceDraft, comparisonWorkouts, comparisonSets), null);
assert.equal(findWorkoutComparison({ ...sourceWorkout, planId: null }, comparisonWorkouts, comparisonSets), null);
assert.equal(findWorkoutComparison({ ...sourceWorkout, planId: 'missing' }, comparisonWorkouts, comparisonSets), null);

// Body and nutrition trends: id tie-break, full-list delta, 8-entry window, finite body fat, local-noon sums.
const { buildBodyTrend, buildNutritionTrend } = loadSource(path.join(root, 'src/lib/wellness-trend.ts'));
const atNoon = day => new Date(2026, 10, day, 12).toISOString();
const bodyEntry = (id, day, weight, bodyFat) => ({ id, recordedAt: atNoon(day), weight, bodyFat });
const bodyEntries = [
  bodyEntry('b', 12, 81.5, null),
  bodyEntry('11', 11, 81, 15),
  bodyEntry('10', 10, 80.5, 15.5),
  bodyEntry('09', 9, 80, 16),
  bodyEntry('08', 8, 79.5, null),
  bodyEntry('07', 7, 79, 16.5),
  bodyEntry('06', 6, 78.5, 17),
  bodyEntry('05', 5, 78, Number.POSITIVE_INFINITY),
  bodyEntry('04', 4, 77.5, 17.5),
  bodyEntry('03', 3, 77, 18),
  bodyEntry('02', 2, 76.5, 18.5),
  bodyEntry('01', 1, 70, 22),
  bodyEntry('a', 12, 81, Number.NaN),
];
const bodyTrend = buildBodyTrend(bodyEntries);
assert.equal(bodyTrend.latest.id, 'b', 'equal recordedAt breaks ties by id ascending');
assert.equal(bodyTrend.previous.id, 'a');
assert.equal(bodyTrend.weightDelta, 0.5);
assert.deepEqual(bodyTrend.points.map(point => point.id), ['06', '07', '08', '09', '10', '11', 'a', 'b']);
assert.equal(bodyTrend.points.length, 8);
assert.ok(!bodyTrend.points.some(point => point.id === '01'));
assert.deepEqual(bodyTrend.fatPoints, [
  { id: '02', recordedAt: atNoon(2), bodyFat: 18.5 },
  { id: '03', recordedAt: atNoon(3), bodyFat: 18 },
  { id: '04', recordedAt: atNoon(4), bodyFat: 17.5 },
  { id: '06', recordedAt: atNoon(6), bodyFat: 17 },
  { id: '07', recordedAt: atNoon(7), bodyFat: 16.5 },
  { id: '09', recordedAt: atNoon(9), bodyFat: 16 },
  { id: '10', recordedAt: atNoon(10), bodyFat: 15.5 },
  { id: '11', recordedAt: atNoon(11), bodyFat: 15 },
], 'null, NaN and infinite bodyFat are excluded from fat points');
assert.equal(buildBodyTrend([bodyEntry('only', 1, 70, null)]).weightDelta, null);
assert.equal(buildBodyTrend([bodyEntry('earlier', 1, 70, 18), bodyEntry('later', 2, 69.75, null)]).weightDelta, -0.25);

const foodEntry = (id, day, calories, protein, carbs, fat) => ({
  id,
  loggedAt: new Date(2026, 10, day, 12).toISOString(),
  meal: '午餐',
  name: id,
  portion: '1 份',
  calories,
  protein,
  carbs,
  fat,
});
const nutritionDays = buildNutritionTrend([
  foodEntry('d1', 1, 500, 20, 40, 10),
  foodEntry('d2', 2, 1, 1, 1, 1),
  foodEntry('d3', 3, 1, 1, 1, 1),
  foodEntry('d4', 4, 1, 1, 1, 1),
  foodEntry('d5', 5, 1, 1, 1, 1),
  foodEntry('noon-a', 6, 1.04, 1.06, 2.24, 0.14),
  foodEntry('noon-b', 6, 1.04, 1.06, 2.24, 0.14),
  foodEntry('d8', 8, 2, 2, 2, 2),
  foodEntry('d9', 9, 3, 3, 3, 3),
]);
assert.deepEqual(nutritionDays.map(day => day.day), [
  '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-08', '2026-11-09',
], 'only the last 7 recorded local days are returned, with no empty day inserted');
assert.equal(nutritionDays.find(day => day.day === '2026-11-06').day, localDayKey(new Date(2026, 10, 6, 12)));
assert.deepEqual(nutritionDays.find(day => day.day === '2026-11-06'), {
  day: '2026-11-06',
  calories: 2.1,
  protein: 2.1,
  carbs: 4.5,
  fat: 0.3,
}, 'two meals on one local noon day are summed, then rounded to one decimal');

// Copying keeps independent targets, including repeated exercises and zero-rest timed work.
const { draftPlanCopy, prioritizePlans } = loadSource(path.join(root, 'src/lib/plan-library.ts'));
const sourcePlan = { id: 'copy-source', name: '我的计划', note: '说明', createdAt: '2026-11-07' };
const libraryPlans = [
  { ...sourcePlan, id: 'newer', name: '较新计划' },
  sourcePlan,
  { ...sourcePlan, id: 'existing-copy', name: '我的计划 · 副本' },
];
assert.deepEqual(prioritizePlans(libraryPlans, ['copy-source', 'newer', 'missing']).map(plan => plan.id), ['newer', 'copy-source', 'existing-copy']);
const sourceTargets = [
  { id: 'timed', planId: sourcePlan.id, exerciseId: 'repeat-exercise', sortOrder: 1, sets: 2, reps: 45, weight: 0, unit: 'seconds', restSeconds: 0 },
  { id: 'legacy', planId: sourcePlan.id, exerciseId: 'repeat-exercise', sortOrder: 0, sets: 3, reps: 8, weight: 42.5 },
  { id: 'other-plan', planId: 'newer', exerciseId: 'ignored', sortOrder: 0, sets: 1, reps: 10, weight: 10 },
];
const copiedDraft = draftPlanCopy(sourcePlan, sourceTargets, libraryPlans);
assert.equal(copiedDraft.name, '我的计划 · 副本（2）');
assert.equal(copiedDraft.note, sourcePlan.note);
assert.deepEqual(copiedDraft.items, [
  { exerciseId: 'repeat-exercise', sets: 3, reps: 8, weight: 42.5, unit: 'reps', restSeconds: 90 },
  { exerciseId: 'repeat-exercise', sets: 2, reps: 45, weight: 0, unit: 'seconds', restSeconds: 0 },
]);
copiedDraft.items[0].weight = 50;
assert.equal(sourceTargets[1].weight, 42.5, 'editing the draft must not mutate its source');
assert.equal(sourceTargets[0].id, 'timed', 'copy preparation must not reorder source items');

// Reusing a row rechecks its saved reference inside the write transaction.
const reuse = database();
await migrate(reuse.db);
const reuseExercises = reuse.native.prepare('SELECT id FROM exercises ORDER BY id LIMIT 2').all();
const reuseExercise = reuseExercises[0].id;
const reuseOtherExercise = reuseExercises[1].id;
const insertReuseWorkout = reuse.native.prepare('INSERT INTO workouts VALUES (?, NULL, ?, ?, ?, ?)');
insertReuseWorkout.run('reuse-old', '旧训练', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', '保留');
insertReuseWorkout.run('reuse-last', '上次训练', '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', '保留');
insertReuseWorkout.run('reuse-active', '当前训练', '2026-11-03T10:00:00Z', null, '当前笔记');
insertReuseWorkout.run('reuse-overlap', '重叠训练', '2026-11-03T09:00:00Z', '2026-11-03T10:01:00Z', '保留');
const insertReuseSet = (id, workoutId, setNumber, weight, reps, completed, unit = 'reps', exerciseId = reuseExercise) => {
  reuse.native.prepare('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit, restSeconds) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)')
    .run(id, workoutId, exerciseId, setNumber, weight, reps, completed, unit, workoutId === 'reuse-active' ? 120 : 30);
};
insertReuseSet('reuse-old-1', 'reuse-old', 1, 20, 12, 1);
insertReuseSet('reuse-old-2', 'reuse-old', 2, 25, 10, 1);
insertReuseSet('reuse-last-1', 'reuse-last', 1, 30, 8, 1);
insertReuseSet('reuse-unchecked', 'reuse-last', 2, 99, 99, 0);
insertReuseSet('reuse-last-2', 'reuse-last', 3, 40, 6, 1);
insertReuseSet('reuse-last-time', 'reuse-last', 4, 0, 60, 1, 'seconds');
insertReuseSet('reuse-last-other', 'reuse-last', 1, 10, 15, 1, 'reps', reuseOtherExercise);
insertReuseSet('reuse-overlap-1', 'reuse-overlap', 1, 99, 99, 1);
insertReuseSet('reuse-target-1', 'reuse-active', 1, 12, 12, 1);
insertReuseSet('reuse-target-2', 'reuse-active', 2, 11, 11, 0);
insertReuseSet('reuse-target-3', 'reuse-active', 3, 11, 11, 0);
insertReuseSet('reuse-target-time', 'reuse-active', 4, 0, 30, 0, 'seconds');
const reuseGetSet = reuse.native.prepare('SELECT * FROM workout_sets WHERE id = ?');
const reuseSourceBefore = reuseGetSet.get('reuse-last-2');
const reuseTargetBefore = reuseGetSet.get('reuse-target-2');
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'missing', 'reuse-last-1'), /找不到/);
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-last-2', 'reuse-old-2'), /进行中的训练/);
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-1', 'reuse-last-1'), /已完成/);
for (const wrongSource of ['reuse-last-1', 'reuse-last-time', 'reuse-last-other', 'reuse-old-2', 'reuse-overlap-1']) {
  await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', wrongSource), /已变更/);
}
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-3', 'reuse-last-2'), /已变更/);
assert.deepEqual(reuseGetSet.get('reuse-target-2'), reuseTargetBefore);
assert.deepEqual(await reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), { weight: 40, reps: 6 }, 'completed current positions still reserve their prior ordinal');
assert.deepEqual({ ...reuseGetSet.get('reuse-target-2') }, { ...reuseTargetBefore, weight: 40, reps: 6 }, 'reuse writes weight and target only');
assert.deepEqual(await reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), { weight: 40, reps: 6 }, 'retrying an unchanged row is safe');
assert.deepEqual(await reusePreviousWorkoutSet(reuse.db, 'reuse-target-time', 'reuse-last-time'), { weight: 0, reps: 60 });
assert.equal(reuseGetSet.get('reuse-target-time').unit, 'seconds');
assert.equal(reuseGetSet.get('reuse-target-time').restSeconds, 120);
for (const [weight, reps] of [[2001, 6], [-1, 6], [Infinity, 6], [40, 1001], [40, 1.5], [40, 0]]) {
  reuse.native.prepare('UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?').run(weight, reps, 'reuse-last-2');
  await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), /已变更|范围/);
}
reuse.native.prepare('UPDATE workout_sets SET weight = 40, reps = 6 WHERE id = ?').run('reuse-last-2');
reuse.native.prepare('UPDATE workout_sets SET completed = 0 WHERE id = ?').run('reuse-last-2');
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), /已变更/);
reuse.native.prepare('UPDATE workout_sets SET completed = 1 WHERE id = ?').run('reuse-last-2');
reuse.native.prepare('UPDATE workout_sets SET weight = 11, reps = 11 WHERE id = ?').run('reuse-target-2');
reuse.native.exec(`CREATE TRIGGER fail_reuse AFTER UPDATE ON workout_sets WHEN NEW.id = 'reuse-target-2'
  BEGIN UPDATE workouts SET note = '意外变更' WHERE id = 'reuse-active'; SELECT RAISE(ABORT, 'forced failure'); END;`);
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), /forced failure/);
assert.deepEqual(reuseGetSet.get('reuse-target-2'), reuseTargetBefore, 'a failed reuse rolls back its target');
assert.equal(reuse.native.prepare('SELECT note FROM workouts WHERE id = ?').get('reuse-active').note, '当前笔记');
assert.deepEqual(reuseGetSet.get('reuse-last-2'), reuseSourceBefore, 'reusing never edits the source history');
reuse.native.exec('DROP TRIGGER fail_reuse');
reuse.native.prepare('UPDATE workout_sets SET completed = 1 WHERE id = ?').run('reuse-target-2');
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), /已完成/);
reuse.native.prepare('UPDATE workout_sets SET completed = 0 WHERE id = ?').run('reuse-target-2');
reuse.native.prepare('UPDATE workouts SET endedAt = ? WHERE id = ?').run('2026-11-03T11:00:00Z', 'reuse-active');
await assert.rejects(reusePreviousWorkoutSet(reuse.db, 'reuse-target-2', 'reuse-last-2'), /进行中的训练/);
reuse.native.close();

console.log(`Passed: 34 programs / 69 days / ${media.length} demos with offline teaching / ${media.filter(demo => demo.asset).length} bundled GIF mappings; nine sports; timed intervals and rest retained; legacy schema and data preserved; atomic import, workout repeat and history edits; independent plan copies and favorite ordering; backup, training schedule, favorites and weekly goal round-trip, validation and rollback; calendar, weekly activity, personal-record and training comparison metrics; body and nutrition trends.`);
