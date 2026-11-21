import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useActions, useActiveWorkout, useHistory, useLibrary, useWellness } from '@/lib/data';
import { dayTotals, goalProgress } from '@/lib/nutrition';
import { prioritizePlans } from '@/lib/plan-library';
import { buildWeeklyTrainingActivity, localDayKey } from '@/lib/training-progress';
import { completedScheduleKeys, scheduleStatus } from '@/lib/training-schedule';
import { clockLabel, dateLabel, durationLabel, volumeOf, type Plan, type Workout, type WorkoutSet } from '@/lib/types';
import { formatVolume } from '@/lib/units';
import { useNow } from '@/lib/use-now';
import { useTrainingDate } from '@/lib/use-training-date';
import { Button, Card, Header, ListRow, Metric, Page, ProgressTrack, SectionTitle, Tag, Txt } from '@/ui/components';
import { makeStyles, radius, space, useTheme } from '@/ui/theme';
import { WeeklyTrainingGoal } from '@/ui/weekly-training-goal';

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function ActiveHero({ workout, sets }: { workout: Workout; sets: WorkoutSet[] }) {
  const s = useStyles();
  const now = useNow();
  const done = sets.filter(set => set.completed).length;
  return <Card variant="signal" style={s.hero}>
    <View style={s.heroTop}>
      <View style={s.liveTag}><View style={s.liveDot} /><Txt variant="overline" tone="onAccent">训练进行中</Txt></View>
      <Txt variant="caption" tone="onAccent">{done}/{sets.length} 组</Txt>
    </View>
    <Txt variant="title2" tone="onAccent" numberOfLines={2}>{workout.name}</Txt>
    <Txt variant="display" tone="onAccent" accessibilityRole="text">{clockLabel((now - Date.parse(workout.startedAt)) / 1000)}</Txt>
    <ProgressTrack value={sets.length ? done / sets.length : 0} tone="onAccent" />
    <Button label="继续训练" icon="arrow-forward" variant="inverse" onPress={() => router.push('/workout')} />
  </Card>;
}

export default function Today() {
  const s = useStyles();
  const { c } = useTheme();
  const { ready, plans, planItems, exercises, schedule, favoritePlanIds, preferences } = useLibrary();
  const history = useHistory();
  const { workout: active, sets: activeSets, pending } = useActiveWorkout();
  const { foodEntries } = useWellness();
  const { startWorkout, discardWorkout } = useActions();
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const now = useTrainingDate();
  const todayKey = localDayKey(now);
  const favorites = useMemo(() => new Set(favoritePlanIds), [favoritePlanIds]);
  const quickPlans = useMemo(() => prioritizePlans(plans, favoritePlanIds).slice(0, 3), [plans, favoritePlanIds]);
  const exerciseNames = useMemo(() => new Map(exercises.map(exercise => [exercise.id, exercise.name])), [exercises]);

  const todaySchedule = useMemo(() => {
    const entries = schedule.filter(entry => entry.day === todayKey);
    if (!entries.length) return [];
    const byId = new Map(plans.map(plan => [plan.id, plan]));
    const completed = completedScheduleKeys(history.workouts, history.sets);
    return entries.flatMap(entry => {
      const plan = byId.get(entry.planId);
      return plan ? [{ plan, status: scheduleStatus(entry, todayKey, completed) }] : [];
    });
  }, [plans, schedule, todayKey, history]);
  const nextScheduled = todaySchedule.find(item => item.status === '待训练')?.plan;

  const { weeks, weekCount, weekVolume, weekSets } = useMemo(() => {
    const completedWorkouts = new Set(history.sets.filter(set => set.completed).map(set => set.workoutId));
    const sessions = history.workouts.map(workout => ({ workout, day: localDayKey(new Date(workout.startedAt)), completedSets: completedWorkouts.has(workout.id) ? 1 : 0 }));
    const weeks = buildWeeklyTrainingActivity(sessions, now);
    const weekDays = new Set(weeks[0].days.map(day => day.key));
    const weekIds = new Set(sessions.filter(session => weekDays.has(session.day) && session.day <= todayKey && session.completedSets).map(session => session.workout.id));
    const weekSetList = history.sets.filter(set => weekIds.has(set.workoutId));
    return { weeks, weekCount: weekIds.size, weekVolume: volumeOf(weekSetList), weekSets: weekSetList.filter(set => set.completed).length };
  }, [history, now, todayKey]);

  const nutrition = useMemo(() => dayTotals(foodEntries, now), [foodEntries, now]);
  const calorieProgress = goalProgress(nutrition.calories, preferences.calorieGoal);
  const lastWorkout = history.workouts[0];

  const planSummary = (plan: Plan) => {
    const items = planItems.filter(item => item.planId === plan.id);
    const names = items.slice(0, 3).map(item => exerciseNames.get(item.exerciseId)).filter(Boolean).join(' · ');
    return { count: items.length, sets: items.reduce((sum, item) => sum + item.sets, 0), names };
  };

  async function begin(planId?: string, planName?: string) {
    if (startInFlight.current) return;
    if (active && (!planId || active.planId !== planId)) {
      Alert.alert('有进行中的训练', `「${active.name}」尚未结束。${planName ? `开始「${planName}」` : '开始新的训练'}需要先放弃它，其中已记录的组数不会保存。`, [
        { text: '取消', style: 'cancel' },
        { text: '继续当前训练', onPress: () => router.push('/workout') },
        { text: '放弃并开始', style: 'destructive', onPress: () => { (async () => { await discardWorkout(active.id); await startWorkout(planId); router.push('/workout'); })().catch(() => Alert.alert('无法开始训练', '请重试。')); } },
      ]);
      return;
    }
    startInFlight.current = true;
    setStarting(true);
    try {
      await startWorkout(planId);
      router.push('/workout');
    } catch {
      Alert.alert('无法开始训练', '请确认计划仍可用后重试。');
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  }

  return <Page>
    <Header eyebrow={`${weekdayNames[now.getDay()]} · ${now.getMonth() + 1}月${now.getDate()}日`} title={active ? '继续你的训练' : '今天练什么？'} />

    {active ? <ActiveHero workout={active} sets={activeSets} /> : nextScheduled ? <Card variant="signal" style={s.hero}>
      <Txt variant="overline" tone="onAccent">今日安排</Txt>
      <Txt variant="title1" tone="onAccent" numberOfLines={2}>{nextScheduled.name}</Txt>
      <Txt variant="body" tone="onAccent" style={s.heroCopy} numberOfLines={2}>{(() => { const summary = planSummary(nextScheduled); return `${summary.count} 个动作 · ${summary.sets} 组 · ${summary.names}`; })()}</Txt>
      <View style={s.heroActions}>
        <Button label="开始训练" icon="play" variant="inverse" loading={starting || !!pending} onPress={() => begin(nextScheduled.id, nextScheduled.name)} style={{ flex: 1 }} />
        <Button label="自由训练" variant="onSignal" onPress={() => begin()} style={s.heroPlain} />
      </View>
    </Card> : <Card variant="signal" style={s.hero}>
      <Txt variant="overline" tone="onAccent">Ready</Txt>
      <Txt variant="title1" tone="onAccent">把今天练成{'\n'}更强的一天</Txt>
      <Txt variant="body" tone="onAccent" style={s.heroCopy}>从计划开始，或自由记录每一组重量、次数和感受。</Txt>
      <View style={s.heroActions}>
        <Button label="自由训练" icon="flash" variant="inverse" loading={starting || !!pending} onPress={() => begin()} style={{ flex: 1 }} />
        <Button label="选择计划" variant="onSignal" onPress={() => router.navigate('/plans')} style={s.heroPlain} />
      </View>
    </Card>}

    {ready ? <WeeklyTrainingGoal weeks={weeks}>
      <View style={s.metrics}>
        <Metric value={String(weekCount)} unit="次" label="本周训练" />
        <Metric value={String(weekSets)} unit="组" label="完成组数" />
        <Metric value={formatVolume(weekVolume, preferences.weightUnit)} unit={preferences.weightUnit} label="训练容量" />
      </View>
    </WeeklyTrainingGoal> : <Txt tone="muted">正在加载训练数据…</Txt>}

    {ready && todaySchedule.length > (nextScheduled && !active ? 1 : 0) ? <>
      <SectionTitle title="今日安排" action="全部安排" onAction={() => router.push('/training-schedule')} />
      <Card style={s.listCard}>
        {todaySchedule.map(({ plan, status }, index) => {
          const running = active?.planId === plan.id && status === '待训练';
          return <ListRow key={plan.id} title={plan.name} subtitle={running ? '进行中' : status} divider={index < todaySchedule.length - 1}
            icon={status === '已完成' ? 'checkmark-circle' : 'calendar-outline'} iconTone={status === '已完成' ? 'success' : running ? 'accent' : 'default'}
            right={status === '待训练' ? <Button label={running ? '继续' : '开始'} size="sm" variant={running ? 'primary' : 'secondary'} disabled={starting || !!(active && !running)} onPress={() => running ? router.push('/workout') : begin(plan.id, plan.name)} /> : <Tag label={status} tone={status === '已完成' ? 'success' : 'neutral'} />} />;
        })}
      </Card>
    </> : ready ? <Pressable accessibilityRole="button" onPress={() => router.push('/training-schedule')} style={({ pressed }) => [s.inlineAction, pressed && { opacity: 0.7 }]}>
      <Ionicons name="calendar-outline" size={18} color={c.textMuted} />
      <Txt variant="body" tone="muted" style={{ flex: 1 }}>{todaySchedule.length ? '查看训练安排' : '今天没有安排，去安排一周训练'}</Txt>
      <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
    </Pressable> : null}

    <Pressable accessibilityRole="button" accessibilityLabel={`今日饮食 ${Math.round(nutrition.calories)} 千卡${preferences.calorieGoal ? `，目标 ${preferences.calorieGoal}` : ''}`} onPress={() => router.push('/nutrition')}>
      <Card style={s.nutrition}>
        <View style={s.nutritionTop}>
          <View style={s.nutritionIcon}><Ionicons name="restaurant-outline" size={18} color={c.data} /></View>
          <View style={{ flex: 1 }}>
            <Txt variant="title3">今日饮食</Txt>
            <Txt variant="caption" tone="muted">蛋白质 {Math.round(nutrition.protein)}{preferences.proteinGoal ? ` / ${preferences.proteinGoal}` : ''} g · 碳水 {Math.round(nutrition.carbs)} g · 脂肪 {Math.round(nutrition.fat)} g</Txt>
          </View>
          <Txt variant="number">{Math.round(nutrition.calories)}<Txt variant="caption" tone="muted">{preferences.calorieGoal ? ` / ${preferences.calorieGoal}` : ''} kcal</Txt></Txt>
        </View>
        {calorieProgress !== null ? <ProgressTrack value={calorieProgress} tone="data" /> : null}
      </Card>
    </Pressable>

    {quickPlans.length ? <>
      <SectionTitle title="常用计划" action="全部计划" onAction={() => router.navigate('/plans')} />
      <Card style={s.listCard}>
        {quickPlans.map((plan, index) => {
          const summary = planSummary(plan);
          const favorite = favorites.has(plan.id);
          return <ListRow key={plan.id} title={plan.name} subtitle={`${summary.count} 个动作 · ${summary.names}`} divider={index < quickPlans.length - 1}
            icon={favorite ? 'star' : 'albums-outline'} iconTone={favorite ? 'accent' : 'default'} accessibilityLabel={`${favorite ? '常用计划，' : ''}开始「${plan.name}」训练`}
            onPress={() => begin(plan.id, plan.name)} right={<Ionicons name="play-circle" size={28} color={c.accentText} />} />;
        })}
      </Card>
    </> : null}

    {lastWorkout ? <>
      <SectionTitle title="上次训练" action="全部记录" onAction={() => router.navigate('/history')} />
      <Card style={s.listCard}>
        <ListRow title={lastWorkout.name} subtitle={`${dateLabel(lastWorkout.startedAt)} · ${durationLabel(lastWorkout.startedAt, lastWorkout.endedAt)}`} icon="checkmark-done" iconTone="success" divider={false}
          onPress={() => router.push({ pathname: '/history/[id]', params: { id: lastWorkout.id } })} />
      </Card>
    </> : null}
  </Page>;
}

const useStyles = makeStyles(c => ({
  hero: { gap: space.md, padding: space.xl, paddingTop: space.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.onAccent },
  heroCopy: { opacity: 0.8 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  heroPlain: { paddingHorizontal: space.lg },
  metrics: { flexDirection: 'row', gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg },
  listCard: { paddingVertical: space.xs },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border },
  nutrition: { gap: space.md },
  nutritionTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nutritionIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.dataSoft, alignItems: 'center', justifyContent: 'center' },
}));
