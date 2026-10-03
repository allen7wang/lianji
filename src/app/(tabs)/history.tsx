import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { dateLabel, durationLabel, volumeOf } from '@/lib/types';
import { Badge, Card, Empty, Header, Metric, Page, SectionTitle } from '@/ui/components';
import { C } from '@/ui/theme';

export default function History() {
  const { workouts, workoutSets } = useData();
  const [period, setPeriod] = useState<'本月' | '全部'>('本月');
  const now = new Date();
  const finished = workouts.filter(item => item.endedAt);
  const shown = period === '全部' ? finished : finished.filter(item => {
    const date = new Date(item.startedAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const totalSets = shown.reduce((sum, item) => sum + workoutSets.filter(set => set.workoutId === item.id && set.completed).length, 0);
  const totalVolume = shown.reduce((sum, item) => sum + volumeOf(workoutSets.filter(set => set.workoutId === item.id)), 0);
  const recentVolumes = [...shown.slice(0, 6)].reverse().map(item => volumeOf(workoutSets.filter(set => set.workoutId === item.id)));
  const maxVolume = Math.max(...recentVolumes, 1);
  return <Page>
    <Header eyebrow="YOUR PROGRESS" title="训练历史" />
    <View style={styles.filters}><Badge label="本月" active={period === '本月'} onPress={() => setPeriod('本月')} /><Badge label="全部" active={period === '全部'} onPress={() => setPeriod('全部')} /></View>
    <Card><View style={styles.metrics}><Metric value={String(shown.length)} label="训练次数" accent /><Metric value={String(totalSets)} label="完成组数" /><Metric value={`${Math.round(totalVolume / 100) / 10}k`} label="总容量 · kg" /></View></Card>
    <SectionTitle title="训练容量趋势" />
    <Card><View style={styles.chart}>{recentVolumes.length ? recentVolumes.map((value, index) => <View key={index} style={styles.barColumn}><Text style={styles.barValue}>{Math.round(value)}</Text><View style={[styles.bar, { height: Math.max(6, value / maxVolume * 95), backgroundColor: index === recentVolumes.length - 1 ? C.accent : '#5B7843' }]} /><Text style={styles.barDate}>{dateLabel(shown[recentVolumes.length - 1 - index].startedAt)}</Text></View>) : <View style={{ flex: 1 }}><Empty icon="stats-chart-outline" title="趋势从第一次训练开始" subtitle="完成训练后，这里会显示每次训练的总容量" /></View>}</View></Card>
    <SectionTitle title="训练记录" />
    {shown.length ? shown.map(workout => {
      const sets = workoutSets.filter(set => set.workoutId === workout.id && set.completed);
      const exerciseCount = new Set(sets.map(set => set.exerciseId)).size;
      return <Pressable key={workout.id} onPress={() => router.push({ pathname: '/history/[id]', params: { id: workout.id } })}><Card style={styles.workout}><View style={styles.icon}><Ionicons name="checkmark" size={20} color={C.accent} /></View><View style={{ flex: 1 }}><Text style={styles.workoutName}>{workout.name}</Text><Text style={styles.workoutMeta}>{dateLabel(workout.startedAt)} · {durationLabel(workout.startedAt, workout.endedAt)} · {exerciseCount} 个动作</Text></View><Ionicons name="chevron-forward" size={18} color={C.faint} /></Card></Pressable>;
    }) : <Empty icon="calendar-outline" title="还没有训练记录" subtitle="从计划页开始训练，或在今天开启自由训练" />}
  </Page>;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8 }, metrics: { flexDirection: 'row', gap: 8 }, chart: { height: 170, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  barColumn: { flex: 1, alignItems: 'center', gap: 6 }, bar: { width: 23, borderRadius: 7 }, barValue: { color: C.muted, fontSize: 10 }, barDate: { color: C.faint, fontSize: 9 },
  workout: { flexDirection: 'row', alignItems: 'center', gap: 13 }, icon: { width: 43, height: 43, borderRadius: 13, backgroundColor: C.accentDark, justifyContent: 'center', alignItems: 'center' }, workoutName: { color: C.text, fontSize: 15, fontWeight: '700' }, workoutMeta: { color: C.muted, fontSize: 11, marginTop: 5 },
});
