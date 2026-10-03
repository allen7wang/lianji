import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { dateLabel, durationLabel, volumeOf } from '@/lib/types';
import { Button, Card, Header, IconButton, Metric, Page, SectionTitle } from '@/ui/components';
import { C } from '@/ui/theme';

export default function HistoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workouts, workoutSets, exercises, deleteWorkout } = useData();
  const workout = workouts.find(item => item.id === id);
  const sets = workoutSets.filter(item => item.workoutId === id && item.completed);
  const exerciseIds = Array.from(new Set(sets.map(item => item.exerciseId)));
  if (!workout) return <Page><Button label="返回" onPress={() => router.back()} /></Page>;
  const confirmDelete = () => Alert.alert('删除训练记录', '删除后无法恢复，确定继续？', [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: async () => { await deleteWorkout(workout.id); router.replace('/history'); } },
  ]);
  return <Page>
    <View style={styles.back}><IconButton icon="chevron-back" onPress={() => router.back()} /><IconButton icon="trash-outline" color={C.danger} onPress={confirmDelete} /></View>
    <Header eyebrow={dateLabel(workout.startedAt)} title={workout.name} />
    <Card style={styles.metrics}><Metric value={durationLabel(workout.startedAt, workout.endedAt)} label="训练时长" accent /><Metric value={`${sets.length}`} label="完成组数" /><Metric value={`${Math.round(volumeOf(sets))}`} label="容量 · kg" /></Card>
    <SectionTitle title="动作明细" />
    {exerciseIds.map((exerciseId, index) => {
      const exercise = exercises.find(item => item.id === exerciseId);
      const exerciseSets = sets.filter(item => item.exerciseId === exerciseId);
      return <Card key={exerciseId}><View style={styles.exerciseHeader}><View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View><View><Text style={styles.exerciseName}>{exercise?.name ?? '未知动作'}</Text><Text style={styles.exerciseMeta}>{exerciseSets.length} 组 · {Math.round(volumeOf(exerciseSets))} kg 容量</Text></View></View><View style={styles.divider} />{exerciseSets.map(set => <View key={set.id} style={styles.setRow}><Text style={styles.setNumber}>第 {set.setNumber} 组</Text><Text style={styles.setValue}>{set.weight} kg × {set.reps} 次</Text><Ionicons name="checkmark-circle" size={17} color={C.accent} /></View>)}</Card>;
    })}
    {workout.note ? <><SectionTitle title="训练笔记" /><Card><Text style={styles.note}>{workout.note}</Text></Card></> : null}
  </Page>;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }, metrics: { flexDirection: 'row', gap: 8 }, exerciseHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' }, index: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, indexText: { color: C.accent, fontWeight: '800' }, exerciseName: { color: C.text, fontSize: 16, fontWeight: '700' }, exerciseMeta: { color: C.muted, fontSize: 11, marginTop: 4 }, divider: { height: 1, backgroundColor: C.line, marginVertical: 14 }, setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 }, setNumber: { color: C.faint, fontSize: 12, width: 55 }, setValue: { flex: 1, color: C.text, fontSize: 14 }, note: { color: C.text, fontSize: 14, lineHeight: 22 },
});
