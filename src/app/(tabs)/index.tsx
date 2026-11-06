import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { prioritizePlans } from '@/lib/plan-library';
import { buildWeeklyTrainingActivity, localDayKey } from '@/lib/training-progress';
import { completedScheduleKeys, scheduleStatus } from '@/lib/training-schedule';
import { dateLabel, durationLabel, volumeOf, type Plan } from '@/lib/types';
import { useTrainingDate } from '@/lib/use-training-date';
import { Button, Card, Header, Metric, Page, SectionTitle } from '@/ui/components';
import { C } from '@/ui/theme';
import { WeeklyTrainingGoal } from '@/ui/weekly-training-goal';

export default function Today() {
  const { ready, plans, planItems, exercises, workouts, workoutSets, schedule, favoritePlanIds, startWorkout, deleteWorkout } = useData();
  const favoritePlans = useMemo(() => new Set(favoritePlanIds), [favoritePlanIds]);
  const quickPlans = useMemo(() => prioritizePlans(plans, favoritePlanIds).slice(0, 3), [plans, favoritePlanIds]);
  const active = workouts.find(item => !item.endedAt);
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const now = useTrainingDate();
  const todayKey = localDayKey(now);
  const todaySchedule = useMemo(() => {
    const entries = schedule.filter(entry => entry.day === todayKey);
    if (!entries.length) return [];
    const byId = new Map(plans.map(plan => [plan.id, plan]));
    const completed = completedScheduleKeys(workouts, workoutSets);
    return entries.flatMap(entry => {
      const plan = byId.get(entry.planId);
      return plan ? [{ plan, status: scheduleStatus(entry, todayKey, completed) }] : [];
    });
  }, [plans, schedule, todayKey, workouts, workoutSets]);
  const { finished, weeks, weekCount, weekVolume, daily } = useMemo(() => {
    const finished = workouts.filter(item => item.endedAt);
    const completedWorkoutIds = new Set(workoutSets.filter(set => set.completed).map(set => set.workoutId));
    const sessions = finished.map(workout => ({
      workout,
      day: localDayKey(new Date(workout.startedAt)),
      completedSets: completedWorkoutIds.has(workout.id) ? 1 : 0,
    }));
    const weeks = buildWeeklyTrainingActivity(sessions, now);
    const counts = new Map(weeks[0].days.map(day => [day.key, 0]));
    const weekIds = new Set<string>();
    for (const { workout, day } of sessions) {
      const count = counts.get(day);
      if (count !== undefined && day <= todayKey) {
        counts.set(day, count + 1);
        weekIds.add(workout.id);
      }
    }
    return {
      finished,
      weeks,
      weekCount: weekIds.size,
      weekVolume: volumeOf(workoutSets.filter(set => weekIds.has(set.workoutId))),
      daily: [...counts.values()],
    };
  }, [now, todayKey, workouts, workoutSets]);

  async function begin(planId?: string, planName?: string) {
    const conflict = planId ? workouts.find(item => !item.endedAt && item.planId !== planId) : null;
    if (conflict) {
      Alert.alert('有进行中的训练', `「${conflict.name}」尚未结束。开始「${planName}」需要先放弃它，其中已记录的组数不会保存。`, [
        { text: '取消', style: 'cancel' },
        { text: `继续「${conflict.name}」`, onPress: () => router.push('/workout') },
        { text: '放弃并开始', style: 'destructive', onPress: () => { (async () => { await deleteWorkout(conflict.id); await startWorkout(planId); router.push('/workout'); })().catch(console.error); } },
      ]);
      return;
    }
    await startWorkout(planId);
    router.push('/workout');
  }

  async function startScheduled(plan: Plan) {
    if (startInFlight.current || (active && active.planId !== plan.id)) return;
    startInFlight.current = true;
    setStarting(true);
    try {
      await startWorkout(plan.id);
      router.push('/workout');
    } catch {
      Alert.alert('无法开始训练', '请确认计划仍可用后重试。');
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  }

  return <Page>
    <Header eyebrow="LIANJI · TRAINING LOG" title="今天练什么？" right={<View style={styles.date}><Text style={styles.dateDay}>{now.getDate()}</Text><Text style={styles.dateMonth}>{now.getMonth() + 1}月</Text></View>} />
    <View style={styles.hero}>
      <View style={styles.orb} />
      <View style={styles.heroContent}>
        <View style={styles.heroTag}><Ionicons name="flash" color={C.bg} size={13} /><Text style={styles.heroTagText}>专注每一次进步</Text></View>
        <Text style={styles.heroTitle}>{active ? '继续你的训练' : '把今天练成\n更强的一天'}</Text>
        <Text style={styles.heroSub}>{active ? `${active.name} · ${durationLabel(active.startedAt, null)}` : '自由记录每一组重量、次数和感受。'}</Text>
        <Button label={active ? '继续记录' : '开始自由训练'} icon="arrow-forward" onPress={() => active ? router.push('/workout') : begin()} style={{ alignSelf: 'flex-start', marginTop: 22 }} />
      </View>
    </View>
    {ready ? <>
      <SectionTitle title="今日安排" action={todaySchedule.length ? '查看安排' : undefined} onAction={() => router.push('/training-schedule')} />
      {todaySchedule.length ? <Card style={styles.schedule}>
        {todaySchedule.map(({ plan, status }) => <View key={plan.id} style={styles.scheduleRow}>
          <View style={styles.scheduleLabel}>
            <Ionicons name={status === '已完成' ? 'checkmark-circle-outline' : 'calendar-outline'} size={20} color={C.accent} />
            <View style={styles.scheduleText}>
              <Text style={styles.planTitle}>{plan.name}</Text>
              <Text style={styles.planSub}>{status === '待训练' && active?.planId === plan.id ? '进行中' : status}</Text>
            </View>
          </View>
          {status === '待训练' ? <Button
            label={active?.planId === plan.id ? '继续' : '开始'}
            variant="secondary"
            disabled={starting || !!(active && active.planId !== plan.id)}
            onPress={() => startScheduled(plan)}
            style={styles.scheduleStart}
          /> : null}
        </View>)}
        {active && todaySchedule.some(({ plan, status }) => status === '待训练' && plan.id !== active.planId) ? <Text style={styles.scheduleHint}>完成当前训练后可开始下一项安排。</Text> : null}
      </Card> : <Button label="安排训练" icon="calendar-outline" variant="secondary" onPress={() => router.push('/training-schedule')} />}
    </> : null}
    <Pressable onPress={() => router.push('/nutrition')} style={styles.nutrition}><View style={styles.nutritionIcon}><Ionicons name="nutrition-outline" size={21} color={C.accent} /></View><View style={{ flex: 1 }}><Text style={styles.nutritionTitle}>记录今日饮食</Text><Text style={styles.nutritionSub}>热量 · 蛋白质 · 碳水 · 脂肪</Text></View><Ionicons name="chevron-forward" size={18} color={C.faint} /></Pressable>
    <SectionTitle title="本周概览" action="查看进度" onAction={() => router.navigate('/history')} />
    {ready ? <WeeklyTrainingGoal weeks={weeks} /> : null}
    <Card><View style={styles.metricRow}><Metric value={`${weekCount}`} label="训练次数" accent /><Metric value={`${Math.round(weekVolume).toLocaleString()}`} label="训练容量 · kg × 次" /></View><View style={styles.bars}>{daily.map((count, i) => <View key={i} style={styles.barColumn}><View style={[styles.bar, { height: Math.max(6, Math.min(50, count * 25)), backgroundColor: count ? C.accent : C.line }]} /><Text style={styles.barLabel}>{'一二三四五六日'[i]}</Text></View>)}</View></Card>
    <SectionTitle title="我的训练计划" action="全部计划" onAction={() => router.push('/plans')} />
    {quickPlans.map((plan, index) => {
      const items = planItems.filter(item => item.planId === plan.id);
      const first = items.slice(0, 3).map(item => exercises.find(ex => ex.id === item.exerciseId)?.name).filter(Boolean).join(' · ');
      const favorite = favoritePlans.has(plan.id);
      return <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={`${favorite ? '常用计划，' : ''}开始「${plan.name}」训练`} style={styles.plan} onPress={() => begin(plan.id, plan.name)}>
        <View style={[styles.planNumber, favorite && styles.favoritePlan]}>
          {favorite ? <Ionicons name="star" size={20} color={C.accent} /> : <Text style={styles.planNumberText}>{String(index + 1).padStart(2, '0')}</Text>}
        </View>
        <View style={{ flex: 1 }}><Text style={styles.planTitle}>{plan.name}</Text><Text style={styles.planSub} numberOfLines={1}>{items.length} 个动作 · {first}</Text></View>
        <Ionicons name="arrow-forward-circle" color={C.accent} size={26} />
      </Pressable>;
    })}
    {finished[0] ? <><SectionTitle title="上次训练" action="全部历史" onAction={() => router.push('/history')} /><Pressable onPress={() => router.push({ pathname: '/history/[id]', params: { id: finished[0].id } })}><Card style={styles.recent}><View><Text style={styles.recentTitle}>{finished[0].name}</Text><Text style={styles.recentSub}>{dateLabel(finished[0].startedAt)} · {durationLabel(finished[0].startedAt, finished[0].endedAt)}</Text></View><Ionicons name="chevron-forward" size={20} color={C.muted} /></Card></Pressable></> : null}
    {!ready ? <Text style={{ color: C.muted }}>正在加载训练数据…</Text> : null}
  </Page>;
}

const styles = StyleSheet.create({
  date: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  dateDay: { color: C.text, fontSize: 18, fontWeight: '800', lineHeight: 20 }, dateMonth: { color: C.muted, fontSize: 10 },
  hero: { overflow: 'hidden', minHeight: 260, borderRadius: 26, backgroundColor: '#263E1B', marginTop: 6 },
  orb: { width: 250, height: 250, borderRadius: 125, backgroundColor: '#517C2D', position: 'absolute', right: -80, top: -100, opacity: 0.6 },
  heroContent: { padding: 24, flex: 1, justifyContent: 'center' },
  heroTag: { alignSelf: 'flex-start', backgroundColor: C.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }, heroTagText: { fontSize: 10, fontWeight: '800', color: C.bg },
  heroTitle: { color: C.text, fontSize: 30, lineHeight: 38, fontWeight: '800', marginTop: 18 }, heroSub: { color: '#C4D3BD', fontSize: 13, marginTop: 8 },
  metricRow: { flexDirection: 'row' }, bars: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 73 },
  barColumn: { alignItems: 'center', gap: 6, width: 24 }, bar: { width: 16, borderRadius: 8 }, barLabel: { color: C.faint, fontSize: 11 },
  schedule: { gap: 14 },
  scheduleRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleText: { flex: 1 },
  scheduleStart: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 14 },
  scheduleHint: { color: C.muted, fontSize: 12, lineHeight: 17 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 15 },
  planNumber: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' }, planNumberText: { color: C.accent, fontSize: 14, fontWeight: '800' }, planTitle: { color: C.text, fontSize: 16, fontWeight: '700' }, planSub: { color: C.muted, fontSize: 11, marginTop: 5 },
  favoritePlan: { backgroundColor: C.accentDark },
  recent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, recentTitle: { color: C.text, fontSize: 16, fontWeight: '700' }, recentSub: { color: C.muted, marginTop: 5, fontSize: 12 },
  nutrition: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 17, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1 }, nutritionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, nutritionTitle: { color: C.text, fontWeight: '700', fontSize: 14 }, nutritionSub: { color: C.muted, fontSize: 11, marginTop: 4 },
});
