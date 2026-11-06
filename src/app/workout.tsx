import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { findPreviousExerciseSets, findPreviousSetMatches } from '@/lib/training-comparison';
import { durationLabel, targetLabel, volumeOf, type Exercise, type TrainingUnit, type Workout, type WorkoutSet } from '@/lib/types';
import { Button, Card, ExercisePicker, IconButton, Metric } from '@/ui/components';
import { PreviousTraining } from '@/ui/previous-training';
import { C } from '@/ui/theme';
import { demoFor } from '@/lib/exercise-demos';
import { ExerciseDemoModal } from '@/ui/exercise-demo';
import { breathingProfileFor } from '@/lib/breathing';
import { BreathingGuideModal, type BreathGuideRequest } from '@/ui/breathing-guide';

function SetRow({ item, breathing, previous, onUpdate, onReuse, onDelete, onComplete, onTimer }: {
  item: WorkoutSet;
  breathing: boolean;
  previous?: WorkoutSet;
  onUpdate: (setId: string, patch: Partial<WorkoutSet>) => Promise<void>;
  onReuse: (setId: string, sourceSetId: string, pendingWrites: Promise<void>) => Promise<{ weight: number; reps: number }>;
  onDelete: (setId: string) => void;
  onComplete: (setId: string, now: number) => void;
  onTimer: (seconds: number, now: number) => void;
}) {
  const [weight, setWeight] = useState(String(item.weight));
  const [reps, setReps] = useState(String(item.reps));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const weightInput = useRef<TextInput>(null);
  const repsInput = useRef<TextInput>(null);
  const applyInFlight = useRef(false);
  const pendingWrites = useRef(Promise.resolve());
  const draftGeneration = useRef(0);
  const focusGeneration = useRef({ weight: 0, reps: 0 });

  function queueUpdate(patch: Partial<WorkoutSet>) {
    const request = pendingWrites.current.catch(() => {}).then(() => onUpdate(item.id, patch));
    pendingWrites.current = request;
    void request.catch(() => setError('保存这组训练失败，请重试。'));
  }

  function commitWeight() {
    if (applyInFlight.current || focusGeneration.current.weight !== draftGeneration.current) return;
    const value = Number(weight.replace(',', '.'));
    if (Number.isFinite(value) && value >= 0 && value <= 2000) queueUpdate({ weight: value });
    else setWeight(String(item.weight));
  }

  function commitReps() {
    if (applyInFlight.current || focusGeneration.current.reps !== draftGeneration.current) return;
    const value = Number(reps);
    if (Number.isInteger(value) && value >= 0 && value <= 1000) queueUpdate({ reps: value });
    else setReps(String(item.reps));
  }

  async function reuse() {
    if (!previous || item.completed || applyInFlight.current) return;
    applyInFlight.current = true;
    // A late blur from the old focus must stay invalid after the copy completes.
    draftGeneration.current += 1;
    setApplying(true);
    setError('');
    weightInput.current?.blur();
    repsInput.current?.blur();
    try {
      const values = await onReuse(item.id, previous.id, pendingWrites.current);
      setWeight(String(values.weight));
      setReps(String(values.reps));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '沿用上次失败，请重试。');
    } finally {
      applyInFlight.current = false;
      setApplying(false);
    }
  }

  const previousTarget = previous ? targetLabel(previous.reps, previous.unit) : '';
  const previousValue = previous && previous.weight > 0
    ? `${previous.weight} kg ${previous.unit === 'seconds' ? '·' : '×'} ${previousTarget}`
    : previousTarget;

  return <View style={{ gap: 5 }}>
    <View style={[styles.setRow, item.completed ? styles.setDone : null]}>
      <Pressable disabled={applying} onLongPress={() => { if (!applyInFlight.current) onDelete(item.id); }} style={styles.setNumber}><Text style={styles.setNumberText}>{item.setNumber}</Text></Pressable>
      {!breathing ? <>
        <TextInput ref={weightInput} accessibilityLabel={`第 ${item.setNumber} 组重量，千克`} editable={!applying} value={weight} onFocus={() => { if (!applyInFlight.current) focusGeneration.current.weight = draftGeneration.current; }} onChangeText={value => { if (!applyInFlight.current) { setWeight(value); setError(''); } }} onBlur={commitWeight} keyboardType="decimal-pad" selectTextOnFocus style={styles.setInput} />
        <Text style={styles.unit}>kg</Text>
      </> : null}
      <TextInput ref={repsInput} accessibilityLabel={`第 ${item.setNumber} 组${item.unit === 'seconds' ? '秒数' : '次数'}`} editable={!applying} value={reps} onFocus={() => { if (!applyInFlight.current) focusGeneration.current.reps = draftGeneration.current; }} onChangeText={value => { if (!applyInFlight.current) { setReps(value); setError(''); } }} onBlur={commitReps} keyboardType="number-pad" selectTextOnFocus style={styles.setInput} />
      <Text style={styles.unit}>{item.unit === 'seconds' ? '秒' : '次'}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`完成第 ${item.setNumber} 组`} accessibilityState={{ checked: !!item.completed, disabled: applying }} disabled={applying} onPress={() => { if (!applyInFlight.current) onComplete(item.id, Date.now()); }} style={[styles.check, item.completed ? styles.checked : null]}><Ionicons name="checkmark" size={20} color={item.completed ? C.bg : C.faint} /></Pressable>
    </View>
    {!item.completed && previous ? <Pressable accessibilityRole="button" accessibilityLabel={`第 ${item.setNumber} 组沿用上次第 ${previous.setNumber} 组，${previousValue}`} accessibilityState={{ disabled: applying, busy: applying }} disabled={applying} onPress={() => { void reuse(); }} style={({ pressed }) => [styles.reuse, pressed && styles.reusePressed]}>
      <Ionicons name="arrow-down-circle-outline" color={C.accent} size={17} />
      <Text style={styles.reuseLabel}>{applying ? '正在沿用…' : `沿用上次第 ${previous.setNumber} 组`}<Text style={styles.reuseValue}>{applying ? '' : ` · ${previousValue}`}</Text></Text>
    </Pressable> : null}
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.setError}>{error}</Text> : null}
    {item.unit === 'seconds' && !item.completed ? <Button label={`${breathing ? '呼吸引导' : '计时'} ${item.reps} 秒`} icon="timer-outline" variant="ghost" disabled={applying} onPress={() => { if (!applyInFlight.current) onTimer(item.reps, Date.now()); }} /> : null}
  </View>;
}

export default function WorkoutScreen() {
  const { ready, workouts } = useData();
  const workout = workouts.find(item => !item.endedAt);
  if (!workout) return <SafeAreaView style={styles.screen} edges={['top']}><View style={styles.empty}><Text style={styles.title}>{ready ? '当前没有进行中的训练' : '正在加载训练…'}</Text><Button label="返回首页" onPress={() => router.replace('/')} /></View></SafeAreaView>;
  return <ActiveWorkout key={workout.id} workout={workout} />;
}

function ActiveWorkout({ workout }: { workout: Workout }) {
  const { workoutSets, exercises, workouts, addWorkoutExercise, addSet, updateSet, reusePreviousSet, deleteSet, finishWorkout, deleteWorkout, updateWorkoutNote } = useData();
  const sets = useMemo(() => workoutSets.filter(item => item.workoutId === workout.id), [workout.id, workoutSets]);
  const completed = sets.filter(item => item.completed).length;
  const [picker, setPicker] = useState(false);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [breathGuide, setBreathGuide] = useState<BreathGuideRequest | null>(null);
  const [note, setNote] = useState(workout.note);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [reusing, setReusing] = useState(false);
  const reuseInFlight = useRef(0);
  const [timer, setTimer] = useState<{ label: string; deadline: number } | null>(null);
  const [clock, setClock] = useState(0);
  useEffect(() => { const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const previousByExercise = useMemo(() => findPreviousExerciseSets(workout, workouts, workoutSets), [workout, workouts, workoutSets]);
  const previousSetMatches = useMemo(() => findPreviousSetMatches(workout, workouts, workoutSets), [workout, workouts, workoutSets]);
  const seconds = timer ? Math.max(0, Math.ceil((timer.deadline - clock) / 1000)) : 0;
  const startTimer = (duration: number, label: string, now: number) => {
    setClock(now);
    setTimer(duration > 0 ? { label, deadline: now + duration * 1000 } : null);
  };
  const groups = useMemo(() => {
    const grouped = new Map<string, WorkoutSet[]>();
    for (const set of sets) {
      const group = grouped.get(set.exerciseId);
      if (group) group.push(set);
      else grouped.set(set.exerciseId, [set]);
    }
    return Array.from(grouped, ([exerciseId, items]) => {
      const comparable = previousByExercise.get(exerciseId);
      const units = new Set<TrainingUnit>(items.map(set => set.unit === 'seconds' ? 'seconds' : 'reps'));
      const previous = Array.from(units).flatMap(unit => {
        const session = comparable?.[unit];
        return session ? [{ unit, ...session }] : [];
      });
      return { exerciseId, exercise: exercises.find(item => item.id === exerciseId), sets: items, previous };
    });
  }, [sets, exercises, previousByExercise]);

  const update = (setId: string, patch: Partial<WorkoutSet>) => updateSet(setId, patch);
  const reuse = async (setId: string, sourceSetId: string, pendingWrites: Promise<void>) => {
    if (saveInFlight.current) throw new Error('训练正在保存，请稍后重试。');
    reuseInFlight.current += 1;
    setReusing(true);
    try {
      await pendingWrites.catch(() => {});
      return await reusePreviousSet(setId, sourceSetId);
    } finally {
      reuseInFlight.current -= 1;
      setReusing(reuseInFlight.current > 0);
    }
  };
  const toggle = (setId: string, now: number) => {
    const set = sets.find(item => item.id === setId);
    if (!set) return;
    if (!set.completed && !set.reps) return Alert.alert(set.unit === 'seconds' ? '先填写秒数' : '先填写次数');
    update(setId, { completed: set.completed ? 0 : 1 }).catch(console.error);
    if (!set.completed) startTimer(set.restSeconds ?? 90, '组间休息', now);
  };
  const finish = () => {
    if (saveInFlight.current || reuseInFlight.current > 0) return;
    if (!completed) return Alert.alert('还没有完成的组数', '至少完成一组训练后再结束。');
    Alert.alert('结束训练', `已完成 ${completed} 组，训练容量 ${Math.round(volumeOf(sets))} kg。`, [
      { text: '继续训练', style: 'cancel' },
      { text: '完成', onPress: async () => {
        if (saveInFlight.current || reuseInFlight.current > 0) return;
        saveInFlight.current = true;
        setSaving(true);
        try {
          await finishWorkout(workout.id, note);
          router.replace({ pathname: '/history/[id]', params: { id: workout.id, saved: '1' } });
        } catch {
          saveInFlight.current = false;
          setSaving(false);
          Alert.alert('保存训练失败', '请再试一次。');
        }
      } },
    ]);
  };
  const discard = () => {
    if (!workout) return;
    Alert.alert('放弃本次训练？', '本次尚未保存为历史记录，放弃后无法恢复。', [
      { text: '继续训练', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: async () => { await deleteWorkout(workout.id); router.replace('/'); } },
    ]);
  };

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}><IconButton icon="chevron-back" onPress={() => router.back()} /><View style={{ alignItems: 'center' }}><Text style={styles.headerLabel}>正在训练</Text><Text style={styles.headerName} numberOfLines={1}>{workout.name}</Text></View><IconButton icon="ellipsis-horizontal" onPress={discard} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Card style={styles.summary}><Metric value={durationLabel(workout.startedAt, null)} label="训练时长" accent /><Metric value={`${completed}/${sets.length}`} label="已完成组" /><Metric value={`${Math.round(volumeOf(sets))}`} label="容量 · kg" /></Card>
      {timer ? <Pressable onPress={() => setTimer(null)} style={styles.timer}><Ionicons name="timer-outline" size={17} color={C.accent} /><Text style={styles.timerText}>{seconds > 0 ? `${timer.label} ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : timer.label === '动作计时' ? '动作计时结束，请按实际完成情况勾选' : '休息结束，可以开始下一组'}</Text><Text style={styles.timerSkip}>{seconds > 0 ? '停止' : '关闭'}</Text></Pressable> : null}
      {groups.map((group, index) => <Card key={group.exerciseId} style={{ gap: 14 }}>
        <View style={styles.exerciseHeader}><View style={styles.exerciseIndex}><Text style={styles.exerciseIndexText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{group.exercise?.name ?? '未知动作'}</Text><Text style={styles.exerciseMeta} numberOfLines={1}>{group.exercise?.muscle} · {group.exercise?.equipment}</Text></View><Text style={styles.exerciseCount}>{group.sets.filter(set => set.completed).length}/{group.sets.length}</Text></View>
        <PreviousTraining exerciseName={group.exercise?.name ?? '未知动作'} entries={group.previous} />
        {group.exercise && demoFor(group.exercise) ? <Button label="查看动图" icon="play-circle-outline" variant="ghost" onPress={() => setDemoExercise(group.exercise!)} /> : null}
        <View style={styles.tableHead}><Text style={styles.headNumber}>组</Text>{!breathingProfileFor(group.exercise) ? <Text style={styles.headCell}>重量</Text> : null}<Text style={styles.headCell}>{group.sets[0]?.unit === 'seconds' ? '时长 · 秒' : '次数'}</Text><Text style={styles.headCheck}>完成</Text></View>
        {group.sets.map(item => <SetRow key={item.id} item={item} breathing={!!breathingProfileFor(group.exercise)} previous={previousSetMatches.get(item.id)} onUpdate={update} onReuse={reuse} onDelete={setId => Alert.alert('删除组数', '确定删除这一组？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteSet(setId) }])} onComplete={toggle} onTimer={(duration, now) => {
          const profile = breathingProfileFor(group.exercise);
          if (profile) { setTimer(null); setBreathGuide({ profile, seconds: duration }); }
          else startTimer(duration, '动作计时', now);
        }} />)}
        <Text style={styles.hint}>完成一组后休息 {group.sets[0]?.restSeconds ?? 90} 秒。按秒记录的组不计入重量 × 次数的容量。</Text>
        <Button label="添加一组" icon="add" variant="secondary" onPress={() => addSet(workout.id, group.exerciseId)} />
      </Card>)}
      <Button label="添加动作" icon="add-circle-outline" variant="secondary" onPress={() => setPicker(true)} />
      <View style={{ gap: 8 }}><Text style={styles.noteLabel}>训练笔记</Text><TextInput multiline placeholder="今天的状态、动作感受…" placeholderTextColor={C.faint} value={note} onChangeText={setNote} onBlur={() => updateWorkoutNote(workout.id, note)} style={styles.note} /></View>
      <Text style={styles.hint}>长按组号可删除该组。</Text>
    </ScrollView>
    <View style={styles.footer}><Button label={saving ? '正在保存…' : reusing ? '正在沿用上次…' : '结束训练'} icon="checkmark-circle-outline" onPress={finish} disabled={saving || reusing} /></View>
    <ExercisePicker visible={picker} onClose={() => setPicker(false)} onSelect={exercise => addWorkoutExercise(workout.id, exercise.id)} excluded={groups.map(item => item.exerciseId)} />
    <ExerciseDemoModal exercise={demoExercise} onClose={() => setDemoExercise(null)} />
    <BreathingGuideModal request={breathGuide} onClose={() => setBreathGuide(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerLabel: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 }, headerName: { color: C.text, fontSize: 17, fontWeight: '700', maxWidth: 230, marginTop: 3 },
  content: { paddingHorizontal: 20, gap: 16, paddingBottom: 30 }, summary: { flexDirection: 'row', gap: 10 }, timer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 14, backgroundColor: C.accentDark }, timerText: { color: C.accent, fontWeight: '700', flex: 1 }, timerSkip: { color: C.muted, fontSize: 12 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, exerciseIndex: { width: 37, height: 37, borderRadius: 11, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, exerciseIndexText: { color: C.accent, fontWeight: '800' }, exerciseName: { color: C.text, fontSize: 17, fontWeight: '700' }, exerciseMeta: { color: C.muted, fontSize: 11, marginTop: 4 }, exerciseCount: { color: C.accent, fontWeight: '700' },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3 }, headNumber: { color: C.faint, fontSize: 11, width: 35 }, headCell: { color: C.faint, fontSize: 11, flex: 1, textAlign: 'center' }, headCheck: { color: C.faint, fontSize: 11, width: 47, textAlign: 'center' },
  setRow: { flexDirection: 'row', gap: 5, alignItems: 'center', padding: 4, borderRadius: 12 }, setDone: { backgroundColor: '#223320' }, setNumber: { width: 30, alignItems: 'center' }, setNumberText: { color: C.muted, fontWeight: '700' }, setInput: { flex: 1, minWidth: 30, height: 42, borderRadius: 10, backgroundColor: C.elevated, color: C.text, textAlign: 'center', fontSize: 15, fontWeight: '700' }, unit: { color: C.faint, fontSize: 11 }, check: { width: 37, height: 37, borderRadius: 11, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginLeft: 5 }, checked: { backgroundColor: C.accent, borderColor: C.accent },
  reuse: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: C.accentDark },
  reusePressed: { opacity: 0.7 },
  reuseLabel: { color: C.accent, fontSize: 12, lineHeight: 17, fontWeight: '700', flex: 1 },
  reuseValue: { color: C.muted, fontWeight: '500' },
  setError: { color: C.danger, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  noteLabel: { color: C.text, fontWeight: '700', fontSize: 17 }, note: { minHeight: 95, borderRadius: 16, padding: 15, backgroundColor: C.surface, color: C.text, textAlignVertical: 'top', borderWidth: 1, borderColor: C.line }, hint: { color: C.faint, fontSize: 11 }, footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }, title: { color: C.text, fontSize: 18 },
});
