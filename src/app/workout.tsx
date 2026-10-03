import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { durationLabel, volumeOf, type Exercise, type Workout, type WorkoutSet } from '@/lib/types';
import { Button, Card, ExercisePicker, IconButton, Metric } from '@/ui/components';
import { C } from '@/ui/theme';
import { demoFor } from '@/lib/exercise-demos';
import { ExerciseDemoModal } from '@/ui/exercise-demo';

function SetRow({ item, onUpdate, onDelete, onComplete }: { item: WorkoutSet; onUpdate: (setId: string, patch: Partial<WorkoutSet>) => void; onDelete: (setId: string) => void; onComplete: (setId: string) => void }) {
  const [weight, setWeight] = useState(String(item.weight));
  const [reps, setReps] = useState(String(item.reps));
  const commitWeight = () => {
    const value = Number(weight.replace(',', '.'));
    if (Number.isFinite(value) && value >= 0 && value <= 2000) onUpdate(item.id, { weight: value });
    else setWeight(String(item.weight));
  };
  const commitReps = () => {
    const value = Number(reps);
    if (Number.isInteger(value) && value >= 0 && value <= 1000) onUpdate(item.id, { reps: value });
    else setReps(String(item.reps));
  };
  return <View style={[styles.setRow, item.completed ? styles.setDone : null]}>
    <Pressable onLongPress={() => onDelete(item.id)} style={styles.setNumber}><Text style={styles.setNumberText}>{item.setNumber}</Text></Pressable>
    <TextInput value={weight} onChangeText={setWeight} onBlur={commitWeight} keyboardType="decimal-pad" selectTextOnFocus style={styles.setInput} />
    <Text style={styles.unit}>kg</Text>
    <TextInput value={reps} onChangeText={setReps} onBlur={commitReps} keyboardType="number-pad" selectTextOnFocus style={styles.setInput} />
    <Text style={styles.unit}>次</Text>
    <Pressable onPress={() => onComplete(item.id)} style={[styles.check, item.completed ? styles.checked : null]}><Ionicons name="checkmark" size={20} color={item.completed ? C.bg : C.faint} /></Pressable>
  </View>;
}

export default function WorkoutScreen() {
  const { ready, workouts } = useData();
  const workout = workouts.find(item => !item.endedAt);
  if (!workout) return <SafeAreaView style={styles.screen} edges={['top']}><View style={styles.empty}><Text style={styles.title}>{ready ? '当前没有进行中的训练' : '正在加载训练…'}</Text><Button label="返回首页" onPress={() => router.replace('/')} /></View></SafeAreaView>;
  return <ActiveWorkout key={workout.id} workout={workout} />;
}

function ActiveWorkout({ workout }: { workout: Workout }) {
  const { workoutSets, exercises, addWorkoutExercise, addSet, updateSet, deleteSet, finishWorkout, deleteWorkout, updateWorkoutNote } = useData();
  const sets = workoutSets.filter(item => item.workoutId === workout?.id);
  const completed = sets.filter(item => item.completed).length;
  const [picker, setPicker] = useState(false);
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const [note, setNote] = useState(workout.note);
  const [seconds, setSeconds] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => { const timer = setInterval(() => { setClock(value => value + 1); setSeconds(value => Math.max(0, value - 1)); }, 1000); return () => clearInterval(timer); }, []);
  const groups = useMemo(() => {
    const keys = Array.from(new Set(sets.map(set => set.exerciseId)));
    return keys.map(exerciseId => ({ exerciseId, exercise: exercises.find(item => item.id === exerciseId), sets: sets.filter(item => item.exerciseId === exerciseId) }));
  }, [sets, exercises]);
  void clock;

  const update = (setId: string, patch: Partial<WorkoutSet>) => { updateSet(setId, patch).catch(console.error); };
  const toggle = (setId: string) => {
    const set = sets.find(item => item.id === setId);
    if (!set) return;
    if (!set.completed && !set.reps) return Alert.alert('先填写次数');
    update(setId, { completed: set.completed ? 0 : 1 });
    if (!set.completed) setSeconds(90);
  };
  const finish = () => {
    if (!workout) return;
    if (!completed) return Alert.alert('还没有完成的组数', '至少完成一组训练后再结束。');
    Alert.alert('结束训练', `已完成 ${completed} 组，训练容量 ${Math.round(volumeOf(sets))} kg。`, [
      { text: '继续训练', style: 'cancel' },
      { text: '完成', onPress: async () => { await finishWorkout(workout.id, note); router.replace('/history'); } },
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
      {seconds > 0 ? <Pressable onPress={() => setSeconds(0)} style={styles.timer}><Ionicons name="timer-outline" size={17} color={C.accent} /><Text style={styles.timerText}>组间休息 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text><Text style={styles.timerSkip}>跳过</Text></Pressable> : null}
      {groups.map((group, index) => <Card key={group.exerciseId} style={{ gap: 14 }}>
        <View style={styles.exerciseHeader}><View style={styles.exerciseIndex}><Text style={styles.exerciseIndexText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{group.exercise?.name ?? '未知动作'}</Text><Text style={styles.exerciseMeta}>{group.exercise?.muscle} · {group.exercise?.equipment}</Text></View><Text style={styles.exerciseCount}>{group.sets.filter(set => set.completed).length}/{group.sets.length}</Text></View>
        {group.exercise && demoFor(group.exercise) ? <Button label="查看动图" icon="play-circle-outline" variant="ghost" onPress={() => setDemoExercise(group.exercise!)} /> : null}
        <View style={styles.tableHead}><Text style={styles.headNumber}>组</Text><Text style={styles.headCell}>重量</Text><Text style={styles.headCell}>次数</Text><Text style={styles.headCheck}>完成</Text></View>
        {group.sets.map(item => <SetRow key={item.id} item={item} onUpdate={update} onDelete={setId => Alert.alert('删除组数', '确定删除这一组？', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleteSet(setId) }])} onComplete={toggle} />)}
        <Button label="添加一组" icon="add" variant="secondary" onPress={() => addSet(workout.id, group.exerciseId)} />
      </Card>)}
      <Button label="添加动作" icon="add-circle-outline" variant="secondary" onPress={() => setPicker(true)} />
      <View style={{ gap: 8 }}><Text style={styles.noteLabel}>训练笔记</Text><TextInput multiline placeholder="今天的状态、动作感受…" placeholderTextColor={C.faint} value={note} onChangeText={setNote} onBlur={() => updateWorkoutNote(workout.id, note)} style={styles.note} /></View>
      <Text style={styles.hint}>长按组号可删除该组。</Text>
    </ScrollView>
    <View style={styles.footer}><Button label="结束训练" icon="checkmark-circle-outline" onPress={finish} /></View>
    <ExercisePicker visible={picker} onClose={() => setPicker(false)} onSelect={exercise => addWorkoutExercise(workout.id, exercise.id)} excluded={groups.map(item => item.exerciseId)} />
    <ExerciseDemoModal exercise={demoExercise} onClose={() => setDemoExercise(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerLabel: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 }, headerName: { color: C.text, fontSize: 17, fontWeight: '700', maxWidth: 230, marginTop: 3 },
  content: { paddingHorizontal: 20, gap: 16, paddingBottom: 30 }, summary: { flexDirection: 'row', gap: 10 }, timer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 14, backgroundColor: C.accentDark }, timerText: { color: C.accent, fontWeight: '700', flex: 1 }, timerSkip: { color: C.muted, fontSize: 12 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, exerciseIndex: { width: 37, height: 37, borderRadius: 11, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, exerciseIndexText: { color: C.accent, fontWeight: '800' }, exerciseName: { color: C.text, fontSize: 17, fontWeight: '700' }, exerciseMeta: { color: C.muted, fontSize: 11, marginTop: 4 }, exerciseCount: { color: C.accent, fontWeight: '700' },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3 }, headNumber: { color: C.faint, fontSize: 11, width: 35 }, headCell: { color: C.faint, fontSize: 11, flex: 1, textAlign: 'center' }, headCheck: { color: C.faint, fontSize: 11, width: 47, textAlign: 'center' },
  setRow: { flexDirection: 'row', gap: 5, alignItems: 'center', padding: 4, borderRadius: 12 }, setDone: { backgroundColor: '#223320' }, setNumber: { width: 30, alignItems: 'center' }, setNumberText: { color: C.muted, fontWeight: '700' }, setInput: { flex: 1, minWidth: 30, height: 42, borderRadius: 10, backgroundColor: C.elevated, color: C.text, textAlign: 'center', fontSize: 15, fontWeight: '700' }, unit: { color: C.faint, fontSize: 11 }, check: { width: 37, height: 37, borderRadius: 11, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginLeft: 5 }, checked: { backgroundColor: C.accent, borderColor: C.accent },
  noteLabel: { color: C.text, fontWeight: '700', fontSize: 17 }, note: { minHeight: 95, borderRadius: 16, padding: 15, backgroundColor: C.surface, color: C.text, textAlignVertical: 'top', borderWidth: 1, borderColor: C.line }, hint: { color: C.faint, fontSize: 11 }, footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 }, title: { color: C.text, fontSize: 18 },
});
