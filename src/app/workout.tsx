import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { breathingProfileFor } from '@/lib/breathing';
import { useActions, useActiveWorkout, useHistory, useLibrary } from '@/lib/data';
import { demoFor } from '@/lib/exercise-demos';
import { haptic } from '@/lib/feedback';
import { progressionLabel, suggestProgression, type ProgressionSuggestion } from '@/lib/progression';
import { findPreviousExerciseSets, matchSetsToReferences } from '@/lib/training-comparison';
import { defaultSetTarget } from '@/lib/training-target';
import { clockLabel, isWarmup, targetLabel, volumeOf, type Exercise, type TrainingUnit, type Workout, type WorkoutSet } from '@/lib/types';
import { formatVolume, formatWeight } from '@/lib/units';
import { useNow } from '@/lib/use-now';
import { useWorkoutTimer } from '@/lib/workout-timer';
import { BreathingGuideModal, type BreathGuideRequest } from '@/ui/breathing-guide';
import { Button, Card, Empty, ExercisePicker, IconButton, ListRow, Metric, Sheet, Tag, Txt } from '@/ui/components';
import { ExerciseDemoModal } from '@/ui/exercise-demo';
import { ExerciseOrderControls } from '@/ui/exercise-order-controls';
import { PreviousTraining, type PreviousTrainingEntry } from '@/ui/previous-training';
import { RestTimerCard } from '@/ui/rest-timer-card';
import { RpeOptions } from '@/ui/rpe-picker';
import { makeStyles, radius, space, useTheme } from '@/ui/theme';
import { WorkoutSetRow, type SetInputPatch } from '@/ui/workout-set-row';

const errorText = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

export default function WorkoutScreen() {
  const { ready } = useLibrary();
  const { workout } = useActiveWorkout();
  const s = useStyles();
  if (!workout) return <SafeAreaView style={s.screen} edges={['top']}>
    <View style={s.empty}>
      <Empty icon="barbell-outline" title={ready ? '当前没有进行中的训练' : '正在加载训练…'} subtitle="从首页或计划开始一次训练。" />
      <Button label="返回首页" variant="secondary" onPress={() => router.replace('/')} />
    </View>
  </SafeAreaView>;
  return <ActiveWorkout key={workout.id} workout={workout} />;
}

function KeepAwake() {
  useKeepAwake('lianji-workout');
  return null;
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return <Metric value={clockLabel((now - Date.parse(startedAt)) / 1000)} label="训练时长" />;
}

type Group = { exerciseId: string; exercise?: Exercise; sets: WorkoutSet[]; previous: PreviousTrainingEntry[] };

function ActiveWorkout({ workout }: { workout: Workout }) {
  const s = useStyles();
  const { c } = useTheme();
  const { sets, pending } = useActiveWorkout();
  const history = useHistory();
  const { exercises, planItems, preferences, deviceSettings } = useLibrary();
  const actions = useActions();
  const timer = useWorkoutTimer();
  const unit = preferences.weightUnit;
  const [picker, setPicker] = useState(false);
  const [replacementTarget, setReplacementTarget] = useState<string | null>(null);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [breathGuide, setBreathGuide] = useState<BreathGuideRequest | null>(null);
  const [menuSet, setMenuSet] = useState<WorkoutSet | null>(null);
  const [rpeSet, setRpeSet] = useState<WorkoutSet | null>(null);
  const [note, setNote] = useState(workout.note);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = !!pending;

  const setError = (key: string, message: string) => setErrors(current => ({ ...current, [key]: message }));
  const clearError = (key: string) => setErrors(current => { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next; });

  const exerciseById = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise])), [exercises]);
  // History changes rarely; the per-set matching below is cheap and follows every edit.
  const references = useMemo(() => findPreviousExerciseSets(workout, history.workouts, history.sets), [workout, history]);
  const matches = useMemo(() => matchSetsToReferences(sets, references), [sets, references]);
  const exerciseKey = useMemo(() => [...new Set(sets.map(set => set.exerciseId))].join('|'), [sets]);
  const suggestions = useMemo(() => {
    const result = new Map<string, ProgressionSuggestion>();
    for (const exerciseId of exerciseKey ? exerciseKey.split('|') : []) {
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) continue;
      const suggestion = suggestProgression({ exercise, current: workout, workouts: history.workouts, sets: history.sets, planItems, weightUnit: unit });
      if (suggestion) result.set(exerciseId, suggestion);
    }
    return result;
  }, [exerciseKey, exerciseById, workout, history, planItems, unit]);

  const groups = useMemo<Group[]>(() => {
    const grouped = new Map<string, WorkoutSet[]>();
    for (const set of sets) {
      const group = grouped.get(set.exerciseId);
      if (group) group.push(set);
      else grouped.set(set.exerciseId, [set]);
    }
    return Array.from(grouped, ([exerciseId, items]) => {
      const comparable = references.get(exerciseId);
      const units = new Set<TrainingUnit>(items.map(set => set.unit === 'seconds' ? 'seconds' : 'reps'));
      const previous = Array.from(units).flatMap(entryUnit => {
        const session = comparable?.[entryUnit];
        return session ? [{ unit: entryUnit, ...session }] : [];
      });
      return { exerciseId, exercise: exerciseById.get(exerciseId), sets: items, previous };
    });
  }, [sets, exerciseById, references]);

  const completed = sets.filter(set => set.completed).length;
  const nameOf = useCallback((exerciseId: string) => exerciseById.get(exerciseId)?.name ?? '未知动作', [exerciseById]);

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    clearError('global');
    actions.moveWorkoutExercise(workout.id, exerciseId, direction, groups.map(group => group.exerciseId))
      .catch(cause => setError('global', errorText(cause, '调整动作顺序失败，请重试。')));
  };

  const confirmReplacement = (exerciseId: string, replacement: Exercise) => {
    const sourceSets = sets.filter(set => set.exerciseId === exerciseId);
    setPicker(false);
    setReplacementTarget(null);
    if (!sourceSets.length) return setError(exerciseId, '原动作已变更，请重新选择。');
    if (sourceSets.some(set => set.completed)) return setError(exerciseId, '这个动作已有完成的组，请选择尚未完成的动作。');
    const target = defaultSetTarget(replacement);
    Alert.alert('更换动作？', `将「${nameOf(exerciseId)}」更换为「${replacement.name}」，保留 ${sourceSets.length} 组及每组休息时间。新动作每组设为 ${formatWeight(target.weight, unit)}、${targetLabel(target.reps, target.unit)}。`, [
      { text: '取消', style: 'cancel' },
      { text: '更换动作', onPress: () => {
        clearError(exerciseId);
        actions.replaceWorkoutExercise(workout.id, exerciseId, replacement.id, sourceSets.map(set => set.id))
          .then(() => { if (timer.timer?.exerciseId === exerciseId) timer.stop(); })
          .catch(cause => setError(exerciseId, errorText(cause, '更换动作失败，请重试。')));
      } },
    ]);
  };

  const onUpdate = useCallback((setId: string, patch: SetInputPatch) => actions.updateSet(setId, patch), [actions]);
  const onReuse = useCallback((setId: string, sourceSetId: string) => actions.reusePreviousSet(setId, sourceSetId), [actions]);
  const onToggle = useCallback((set: WorkoutSet, patch: SetInputPatch) => {
    const completing = !set.completed;
    if (completing && !(patch.reps ?? set.reps)) {
      if (patch.weight !== undefined || patch.reps !== undefined) {
        actions.updateSet(set.id, patch).catch(cause => setError(set.exerciseId, errorText(cause, '保存这组训练失败，请重试。')));
      }
      Alert.alert(set.unit === 'seconds' ? '先填写秒数' : '先填写次数');
      return;
    }
    actions.updateSet(set.id, { ...patch, completed: completing ? 1 : 0 }).then(() => {
      if (!completing) return;
      haptic.tap(deviceSettings.haptics);
      const rest = set.restSeconds ?? 90;
      if (rest > 0) timer.start('rest', rest, workout.id, set.exerciseId, nameOf(set.exerciseId));
    }).catch(cause => setError(set.exerciseId, errorText(cause, '保存这组训练失败，请重试。')));
  }, [actions, deviceSettings.haptics, timer, workout.id, nameOf]);
  const onDelete = useCallback((set: WorkoutSet) => {
    Alert.alert('删除这一组？', `${nameOf(set.exerciseId)} · ${isWarmup(set) ? '热身组' : `第 ${set.setNumber} 组`}`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { actions.deleteSet(set.id).catch(cause => setError(set.exerciseId, errorText(cause, '删除失败，请重试。'))); } },
    ]);
  }, [actions, nameOf]);
  const onTimer = useCallback((set: WorkoutSet) => {
    const exercise = exerciseById.get(set.exerciseId);
    const profile = breathingProfileFor(exercise);
    if (profile) { timer.stop(); setBreathGuide({ profile, seconds: set.reps }); return; }
    timer.start('exercise', set.reps, workout.id, set.exerciseId, nameOf(set.exerciseId));
  }, [exerciseById, timer, workout.id, nameOf]);
  const onMenu = useCallback((set: WorkoutSet) => setMenuSet(set), []);
  const onRpe = useCallback((set: WorkoutSet) => setRpeSet(set), []);

  const finish = () => {
    if (busy) return;
    if (!completed) return Alert.alert('还没有完成的组数', '至少完成一组训练后再结束。');
    const volume = volumeOf(sets);
    Alert.alert('结束训练', `已完成 ${completed} 组${volume ? `，训练容量 ${formatVolume(volume, unit)} ${unit}` : ''}。`, [
      { text: '继续训练', style: 'cancel' },
      { text: '完成', onPress: () => {
        actions.finishWorkout(workout.id, note)
          .then(() => router.replace({ pathname: '/history/[id]', params: { id: workout.id, saved: '1' } }))
          .catch(cause => Alert.alert('保存训练失败', errorText(cause, '请再试一次。')));
      } },
    ]);
  };
  const discard = () => {
    Alert.alert('放弃本次训练？', '本次尚未保存为历史记录，放弃后无法恢复。', [
      { text: '继续训练', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: () => { actions.discardWorkout(workout.id).then(() => router.replace('/')).catch(() => Alert.alert('放弃训练失败', '请重试。')); } },
    ]);
  };

  return <SafeAreaView style={s.screen} edges={['top']}>
    {deviceSettings.keepAwake ? <KeepAwake /> : null}
    <View style={s.header}>
      <IconButton icon="chevron-down" label="返回" onPress={() => router.back()} />
      <View style={s.headerText}>
        <Txt variant="overline" tone="accent">训练进行中</Txt>
        <Txt variant="title3" numberOfLines={1}>{workout.name}</Txt>
      </View>
      <IconButton icon="ellipsis-horizontal" label="更多操作：放弃训练" onPress={discard} />
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <View style={s.summary}>
          <Elapsed startedAt={workout.startedAt} />
          <Metric value={`${completed}/${sets.length}`} label="完成组" />
          <Metric value={formatVolume(volumeOf(sets), unit)} unit={unit} label="训练容量" />
        </View>
        <RestTimerCard />
        {errors.global ? <Txt variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">{errors.global}</Txt> : null}
        {Object.entries(errors).filter(([key]) => key !== 'global' && !groups.some(group => group.exerciseId === key)).map(([key, message]) =>
          <Txt key={key} variant="caption" tone="danger" accessibilityRole="alert">{message}</Txt>)}

        {groups.map((group, index) => {
          const name = group.exercise?.name ?? '未知动作';
          const breathing = !!breathingProfileFor(group.exercise);
          const done = group.sets.filter(set => set.completed).length;
          const untouched = group.sets.every(set => !set.completed);
          const suggestion = suggestions.get(group.exerciseId);
          const applicable = suggestion && group.sets.some(set => !set.completed && !isWarmup(set) && set.unit !== 'seconds' && Math.abs(set.weight - suggestion.weight) > 0.01);
          let working = 0;
          return <Card key={group.exerciseId} style={[s.exercise, done === group.sets.length && s.exerciseDone]}>
            <View style={s.exerciseHeader}>
              <View style={[s.index, done === group.sets.length && s.indexDone]}>
                {done === group.sets.length ? <Ionicons name="checkmark" size={18} color={c.onSuccess} /> : <Txt variant="bodyStrong">{String(index + 1).padStart(2, '0')}</Txt>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="title3" numberOfLines={2}>{name}</Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>{group.exercise?.muscle} · {group.exercise?.equipment} · {done}/{group.sets.length} 组</Txt>
              </View>
              <ExerciseOrderControls name={name} index={index} total={groups.length} disabled={busy} onMove={direction => moveExercise(group.exerciseId, direction)} />
            </View>
            <View style={s.tools}>
              {group.exercise && demoFor(group.exercise) ? <Button label="查看动图" icon="play-circle-outline" size="sm" variant="secondary" onPress={() => setDemoExercise(group.exercise!)} /> : null}
              {untouched ? <Button label={pending === '正在更换动作…' && replacementTarget === null ? '正在更换…' : '更换动作'} icon="swap-horizontal" size="sm" variant="secondary" disabled={busy}
                onPress={() => { clearError(group.exerciseId); setReplacementTarget(group.exerciseId); }} /> : null}
            </View>
            {applicable && suggestion ? <View style={s.suggestion}>
              <Ionicons name={suggestion.action === 'increase' ? 'trending-up' : suggestion.action === 'deload' ? 'trending-down' : 'remove'} size={18} color={c.data} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" tone="data">{progressionLabel[suggestion.action]} {formatWeight(suggestion.weight, unit)}</Txt>
                <Txt variant="caption" tone="muted">{suggestion.reason} · 上次最重 {formatWeight(suggestion.baseline, unit)}</Txt>
              </View>
              <Button label="应用" size="sm" variant="plain" disabled={busy} accessibilityLabel={`把${name}未完成的正式组设为 ${formatWeight(suggestion.weight, unit)}`}
                onPress={() => { actions.applyWeight(workout.id, group.exerciseId, suggestion.weight).catch(cause => setError(group.exerciseId, errorText(cause, '应用建议失败，请重试。'))); }} />
            </View> : null}
            <PreviousTraining exerciseName={name} entries={group.previous} weightUnit={unit} />
            {errors[group.exerciseId] ? <Txt variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">{errors[group.exerciseId]}</Txt> : null}
            <View style={s.tableHead}>
              <Txt variant="caption" tone="faint" style={s.headNumber}>组</Txt>
              {!breathing ? <Txt variant="caption" tone="faint" style={s.headCell}>重量 · {unit}</Txt> : null}
              <Txt variant="caption" tone="faint" style={s.headCell}>{group.sets[0]?.unit === 'seconds' ? '时长 · 秒' : '次数'}</Txt>
              <Txt variant="caption" tone="faint" style={s.headCheck}>完成</Txt>
            </View>
            {group.sets.map(item => {
              const label = isWarmup(item) ? 'W' : String(++working);
              return <WorkoutSetRow key={item.id} item={item} label={label} weightUnit={unit} breathing={breathing} previous={matches.get(item.id)} locked={busy} reuseBlocked={busy}
                onUpdate={onUpdate} onReuse={onReuse} onToggle={onToggle} onMenu={onMenu} onDelete={onDelete} onTimer={onTimer} onRpe={onRpe} />;
            })}
            <View style={s.cardFooter}>
              <Button label="添加一组" icon="add" size="sm" variant="secondary" disabled={busy} style={{ flex: 1 }}
                onPress={() => { actions.addSet(workout.id, group.exerciseId).catch(cause => setError(group.exerciseId, errorText(cause, '添加组数失败，请重试。'))); }} />
              {!breathing ? <Button label="热身组" icon="flame-outline" size="sm" variant="plain" disabled={busy}
                onPress={() => { actions.addSet(workout.id, group.exerciseId, 'warmup').catch(cause => setError(group.exerciseId, errorText(cause, '添加热身组失败，请重试。'))); }} /> : null}
            </View>
            <Txt variant="caption" tone="faint">完成一组后休息 {group.sets.find(set => !isWarmup(set))?.restSeconds ?? group.sets[0]?.restSeconds ?? 90} 秒 · 点组号设热身组或 RPE，长按删除</Txt>
          </Card>;
        })}

        <Button label="添加动作" icon="add-circle-outline" variant="secondary" disabled={busy} onPress={() => setPicker(true)} />
        <View style={{ gap: space.sm }}>
          <Txt variant="title3">训练笔记</Txt>
          <TextInput multiline placeholder="今天的状态、动作感受…" placeholderTextColor={c.textFaint} value={note} onChangeText={setNote} onBlur={() => { void actions.updateWorkoutNote(workout.id, note); }} style={s.note} accessibilityLabel="训练笔记" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <View style={s.footer}>
      <View style={{ flex: 1 }}>
        <Txt variant="caption" tone="muted">已完成</Txt>
        <Txt variant="number">{completed}<Txt variant="caption" tone="muted"> / {sets.length} 组</Txt></Txt>
      </View>
      <Button label={pending ?? '结束训练'} icon="checkmark-circle" onPress={finish} disabled={busy} style={{ flex: 1.6 }} />
    </View>

    <ExercisePicker visible={picker || replacementTarget !== null} replacing={replacementTarget !== null} busy={pending === '正在更换动作…'} autoClose={replacementTarget === null}
      onClose={() => { setPicker(false); setReplacementTarget(null); }}
      onSelect={exercise => {
        if (replacementTarget) confirmReplacement(replacementTarget, exercise);
        else actions.addWorkoutExercise(workout.id, exercise.id).catch(cause => Alert.alert('添加动作失败', errorText(cause, '请重试。')));
      }} excluded={groups.map(group => group.exerciseId)} />
    <ExerciseDemoModal exercise={demoExercise} onClose={() => setDemoExercise(null)} />
    <BreathingGuideModal request={breathGuide} onClose={() => setBreathGuide(null)} />
    <Sheet visible={!!menuSet || !!rpeSet}
      title={rpeSet ? '主观用力程度 RPE' : menuSet ? nameOf(menuSet.exerciseId) : ''}
      subtitle={rpeSet ? nameOf(rpeSet.exerciseId) : menuSet ? `${isWarmup(menuSet) ? '热身组' : '正式组'} · ${formatWeight(menuSet.weight, unit)} × ${targetLabel(menuSet.reps, menuSet.unit)}` : undefined}
      onClose={() => { setMenuSet(null); setRpeSet(null); }}>
      {rpeSet ? <RpeOptions value={sets.find(set => set.id === rpeSet.id)?.rpe} onSelect={rpe => {
        setRpeSet(null);
        actions.updateSet(rpeSet.id, { rpe }).catch(cause => setError(rpeSet.exerciseId, errorText(cause, '保存 RPE 失败。')));
      }} /> : null}
      {menuSet ? <Card style={{ paddingVertical: space.xs }}>
        <ListRow icon={isWarmup(menuSet) ? 'barbell-outline' : 'flame-outline'} title={isWarmup(menuSet) ? '设为正式组' : '设为热身组'} subtitle={isWarmup(menuSet) ? '计入容量、个人纪录与上次对照' : '热身组不计入容量、个人纪录与上次对照'}
          onPress={() => { const target = menuSet; setMenuSet(null); actions.setSetKind(target.id, isWarmup(target) ? 'working' : 'warmup').catch(cause => setError(target.exerciseId, errorText(cause, '修改失败。'))); }} />
        <ListRow icon="speedometer-outline" title="记录 RPE" subtitle={menuSet.rpe != null ? `当前 RPE ${menuSet.rpe}` : '主观用力程度 5–10'} onPress={() => { setRpeSet(menuSet); setMenuSet(null); }} />
        <ListRow icon="trash-outline" title="删除这一组" divider={false} onPress={() => { const target = menuSet; setMenuSet(null); onDelete(target); }} right={<Tag label="不可恢复" tone="danger" />} />
      </Card> : null}
    </Sheet>
  </SafeAreaView>;
}

const useStyles = makeStyles(c => ({
  screen: { flex: 1, backgroundColor: c.bg },
  empty: { flex: 1, justifyContent: 'center', padding: space.page, gap: space.lg },
  header: { paddingHorizontal: space.page, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, alignItems: 'center', gap: 2 },
  content: { paddingHorizontal: space.page, gap: space.lg, paddingBottom: space.xxxl },
  summary: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  exercise: { gap: space.md },
  exerciseDone: { borderColor: c.success },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  index: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  indexDone: { backgroundColor: c.success },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.dataSoft, borderRadius: radius.md, paddingLeft: space.md, paddingVertical: space.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 4 },
  headNumber: { width: 32, textAlign: 'center' },
  headCell: { flex: 1, textAlign: 'center' },
  headCheck: { width: 44, textAlign: 'center' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  note: { minHeight: 96, borderRadius: radius.md, padding: space.lg, backgroundColor: c.surfaceAlt, color: c.text, textAlignVertical: 'top', fontSize: 15 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.lg, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
}));
