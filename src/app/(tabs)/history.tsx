import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { buildTrainingProgress, buildWeeklyTrainingActivity, localDayKey, mondayOf, type TrainingSession } from '@/lib/training-progress';
import { dateLabel, durationLabel } from '@/lib/types';
import { useTrainingDate } from '@/lib/use-training-date';
import { Card, Empty, Header, Metric, Page, SectionTitle } from '@/ui/components';
import { C, space } from '@/ui/theme';
import { ProgressTabs, TrainingCalendar, type CalendarDay } from '@/ui/training-progress-calendar';
import { TrainingProgressChart } from '@/ui/training-progress-chart';
import { ExerciseProgressView } from '@/ui/training-progress-exercise';
import { WeeklyTrainingGoal } from '@/ui/weekly-training-goal';

type ProgressView = 'calendar' | 'exercise';
type Period = 'week' | 'month' | 'all';
const views = [{ value: 'calendar', label: '训练日历' }, { value: 'exercise', label: '动作进步' }] as const;
const periods = [{ value: 'week', label: '周' }, { value: 'month', label: '月' }, { value: 'all', label: '全部' }] as const;
const formatVolume = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, notation: 'compact' });

function plusDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function periodStart(date: Date, period: Exclude<Period, 'all'>) {
  return period === 'week' ? mondayOf(date) : new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function adjacentPeriod(start: Date, period: Exclude<Period, 'all'>, step: -1 | 1) {
  return period === 'week' ? plusDays(start, step * 7) : new Date(start.getFullYear(), start.getMonth() + step, 1, 12);
}

function periodLabel(start: Date, period: Exclude<Period, 'all'>) {
  if (period === 'month') return `${start.getFullYear()}年${start.getMonth() + 1}月`;
  const end = plusDays(start, 6);
  return `${start.getFullYear()}年${dateLabel(start.toISOString())} – ${end.getFullYear() !== start.getFullYear() ? `${end.getFullYear()}年` : ''}${dateLabel(end.toISOString())}`;
}

function openWorkout(id: string) {
  router.push({ pathname: '/history/[id]', params: { id } });
}

function timedLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  return [hours && `${hours} 小时`, minutes % 60 && `${minutes % 60} 分`, seconds && `${seconds} 秒`].filter(Boolean).join(' ');
}

export default function History() {
  const { ready, workouts, workoutSets, exercises } = useData();
  const { exerciseId: requested } = useLocalSearchParams<{ exerciseId?: string | string[] }>();
  const requestedId = Array.isArray(requested) ? requested[0] : requested;
  const [view, setView] = useState<ProgressView>('calendar');
  const [exerciseId, setExerciseId] = useState<string>();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState<Date>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = useTrainingDate();
  const focusDate = anchor ?? today;
  const currentView = requestedId ? 'exercise' : view;
  const selectedExerciseId = requestedId || exerciseId;

  const { sessions, byExercise } = useMemo(() => buildTrainingProgress(workouts, workoutSets), [workouts, workoutSets]);
  const weeks = useMemo(() => buildWeeklyTrainingActivity(sessions, today), [sessions, today]);
  const sessionsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of sessions) counts.set(session.day, (counts.get(session.day) ?? 0) + 1);
    return counts;
  }, [sessions]);
  const exerciseOptions = useMemo(() => {
    const byId = new Map(exercises.map(exercise => [exercise.id, exercise]));
    return [...byExercise.keys()].flatMap(id => {
      const exercise = byId.get(id);
      return exercise ? [exercise] : [];
    });
  }, [byExercise, exercises]);
  const selectedExercise = exercises.find(exercise => exercise.id === selectedExerciseId) ?? exerciseOptions[0];
  const todayKey = localDayKey(today);
  const start = period === 'all' ? null : periodStart(focusDate, period);
  const end = start && period !== 'all' ? adjacentPeriod(start, period, 1) : null;
  const startKey = start ? localDayKey(start) : '';
  const endKey = end ? localDayKey(end) : '';
  const days: CalendarDay[] = [];
  if (start && end) {
    for (let date = mondayOf(start); date < end || date.getDay() !== 1; date = plusDays(date, 1)) {
      const key = localDayKey(date);
      days.push({ key, date, count: sessionsByDay.get(key) ?? 0, inPeriod: date >= start && date < end, today: key === todayKey, future: key > todayKey });
    }
  }
  const shown = currentView === 'calendar' ? sessions.filter(session => {
    if (selectedDay) return session.day === selectedDay;
    return !start || (session.day >= startKey && session.day < endKey);
  }) : [];
  const canGoBack = !!start && sessions.length > 0 && sessions[sessions.length - 1].day < startKey;
  const canGoForward = !!start && period !== 'all' && start < periodStart(today, period);
  const dayLabel = selectedDay ? dateLabel(focusDate.toISOString()) : null;
  const capacityPoints = selectedDay ? [] : shown.slice(0, 6).reverse().map(({ workout, volume }) => ({ workout, value: volume }));

  function changeView(next: ProgressView) {
    if (requestedId) {
      setExerciseId(requestedId);
      router.setParams({ exerciseId: undefined });
    }
    setView(next);
  }

  const header = <View style={styles.header}>
    <Header eyebrow="YOUR PROGRESS" title="训练进度" />
    <ProgressTabs options={views} value={currentView} onChange={changeView} />
    {!ready ? <View style={styles.loading}><ActivityIndicator color={C.accent} /><Text style={styles.help}>正在加载训练记录</Text></View> : currentView === 'exercise' ? <ExerciseProgressView selected={selectedExercise} options={exerciseOptions} progressByExercise={byExercise} onOpenWorkout={openWorkout} onSelect={id => {
      setView('exercise');
      setExerciseId(id);
      if (requestedId) router.setParams({ exerciseId: undefined });
    }} /> : <>
      <WeeklyTrainingGoal weeks={weeks} showRecent />
      <ProgressTabs options={periods} value={period} onChange={next => {
        if (next === period) return;
        setPeriod(next);
        setSelectedDay(null);
      }} />
      {start && period !== 'all' ? <TrainingCalendar label={periodLabel(start, period)} days={days} selectedDay={selectedDay} canGoBack={canGoBack} canGoForward={canGoForward} onMove={direction => {
        setAnchor(adjacentPeriod(start, period, direction));
        setSelectedDay(null);
      }} onToday={() => {
        setAnchor(undefined);
        setSelectedDay(null);
      }} onSelect={day => {
        setAnchor(day.date);
        setSelectedDay(selectedDay === day.key ? null : day.key);
      }} /> : null}
      <PeriodSummary sessions={shown} title={dayLabel ? `${dayLabel}汇总` : period === 'all' ? '全部训练汇总' : '时段汇总'} />
      {capacityPoints.some(point => point.value > 0) ? <>
        <SectionTitle title="训练容量趋势" />
        <TrainingProgressChart description={`最近 ${capacityPoints.length} 次训练`} points={capacityPoints} unit="kg × 次" onOpenWorkout={openWorkout} />
      </> : null}
      <View style={styles.listHeading}>
        <SectionTitle title={dayLabel ? `${dayLabel}训练记录` : '训练记录'} />
        {selectedDay ? <Pressable accessibilityRole="button" onPress={() => setSelectedDay(null)} style={styles.reset}><Text style={styles.resetLabel}>清除日期</Text></Pressable> : null}
      </View>
    </>}
  </View>;

  return <Page scroll={false}>
    <FlatList key={currentView === 'exercise' ? `${currentView}-${selectedExercise?.id ?? ''}` : currentView} data={shown} keyExtractor={session => session.workout.id} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" ListHeaderComponent={header} ListEmptyComponent={ready && currentView === 'calendar' ? <Empty icon="calendar-outline" title={sessions.length ? dayLabel ? '当天没有训练记录' : '这个时段没有训练记录' : '还没有训练记录'} subtitle={sessions.length ? '选择其他日期或切换到全部记录。' : '保存第一次训练后，就能在这里回顾进度。'} /> : null} renderItem={({ item }) => <WorkoutRow session={item} />} />
  </Page>;
}

function PeriodSummary({ sessions, title }: { sessions: TrainingSession[]; title: string }) {
  let totalSets = 0;
  let totalVolume = 0;
  let totalTimedSeconds = 0;
  const trainingDays = new Set<string>();
  for (const session of sessions) {
    totalSets += session.completedSets;
    totalVolume += session.volume;
    totalTimedSeconds += session.timedSeconds;
    if (session.completedSets > 0) trainingDays.add(session.day);
  }
  return <Card style={styles.summary}>
    <Text style={styles.summaryTitle} accessibilityRole="header">{title}</Text>
    <View style={styles.metrics}><Metric value={String(sessions.length)} label="训练次数" accent /><Metric value={String(trainingDays.size)} label="训练天数" /></View>
    <View style={styles.divider} />
    <View style={styles.metrics}><Metric value={String(totalSets)} label="完成组数" /><Metric value={formatVolume.format(totalVolume)} label="训练容量 · kg × 次" /></View>
    {totalTimedSeconds > 0 ? <Text style={styles.help}>计时组总时长 · {timedLabel(totalTimedSeconds)}</Text> : null}
  </Card>;
}

function WorkoutRow({ session }: { session: TrainingSession }) {
  const { workout, completedSets, exerciseCount } = session;
  return <Pressable accessibilityRole="button" accessibilityHint="查看训练明细" onPress={() => openWorkout(workout.id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Card style={styles.workout}>
      <View style={styles.icon}><Ionicons name="checkmark" size={20} color={C.accent} /></View>
      <View style={styles.rowInfo}>
        <Text style={styles.workoutName}>{workout.name}</Text>
        <Text style={styles.workoutMeta}>{dateLabel(workout.startedAt)} · {durationLabel(workout.startedAt, workout.endedAt)} · {exerciseCount} 个动作 · {completedSets} 组</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Card>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.page, paddingBottom: 42 },
  header: { gap: 16 },
  loading: { minHeight: 180, gap: 12, alignItems: 'center', justifyContent: 'center' },
  help: { color: C.muted, fontSize: 13 },
  summary: { gap: 14 },
  summaryTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 12 },
  divider: { height: 1, backgroundColor: C.line },
  listHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  reset: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  resetLabel: { color: C.accent, fontSize: 13, fontWeight: '700' },
  row: { marginTop: 10 },
  pressed: { opacity: 0.7 },
  workout: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDark, justifyContent: 'center', alignItems: 'center' },
  rowInfo: { flex: 1, gap: 5 },
  workoutName: { color: C.text, fontSize: 15, fontWeight: '700' },
  workoutMeta: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
