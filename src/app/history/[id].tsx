import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { formatVolume, formatWeight } from '@/lib/units';
import { bestOneRepMax, formatOneRepMax, RpeTag, setOrdinals, setTitle, toDisplayWeight } from '@/ui/set-display';
import { useActions, useHistory, useLibrary } from '@/lib/data';
import { findWorkoutComparison, type WorkoutComparison } from '@/lib/training-comparison';
import { buildTrainingProgress, workoutMilestones } from '@/lib/training-progress';
import { dateLabel, durationLabel, isWarmup, targetLabel, volumeOf } from '@/lib/types';
import { Button, Card, Header, IconButton, Metric, Page, SectionTitle } from '@/ui/components';
import { makeStyles, useTheme } from '@/ui/theme';

const recordLabels = {
  weight: { label: '单组重量', unit: 'kg' },
  reps: { label: '单组次数', unit: '次' },
  seconds: { label: '单组时长', unit: '秒' },
};

const comparisonNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

export default function HistoryDetail() {
  const styles = useStyles();
  const { c } = useTheme();
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const { ready, exercises, preferences: { weightUnit } } = useLibrary();
  const { workouts, sets: workoutSets } = useHistory();
  const { deleteWorkout, repeatWorkout } = useActions();
  const [starting, setStarting] = useState(false);
  const startInFlight = useRef(false);
  const workout = workouts.find(item => item.id === id && item.endedAt);
  const sets = useMemo(() => workoutSets.filter(set => set.workoutId === id && set.completed), [id, workoutSets]);
  const comparison = useMemo(() => workout ? findWorkoutComparison(workout, workouts, workoutSets) : null, [workout, workouts, workoutSets]);
  const canSavePlan = sets.some(set => !isWarmup(set) && Number.isFinite(set.reps) && set.reps > 0);
  const milestones = useMemo(() => {
    if (!workout || !sets.length) return [];
    const exerciseIds = new Set(sets.map(set => set.exerciseId));
    const { byExercise } = buildTrainingProgress(workouts, workoutSets.filter(set => exerciseIds.has(set.exerciseId)));
    return workoutMilestones(workout, byExercise);
  }, [workout, workouts, workoutSets, sets]);

  const justSaved = saved === '1';
  const back = () => justSaved || !router.canGoBack() ? router.navigate('/history') : router.back();
  if (!workout) return <Page>
    <Header title={ready ? '训练记录不存在' : '正在加载训练…'} />
    <Button label="返回" onPress={back} />
  </Page>;

  const exerciseIds = [...new Set(sets.map(set => set.exerciseId))];
  const startAgain = async () => {
    if (startInFlight.current) return;
    startInFlight.current = true;
    setStarting(true);
    try {
      if (await repeatWorkout(workout.id)) {
        router.replace('/workout');
      } else {
        Alert.alert('有进行中的训练', '完成或放弃当前训练后，可以从这条记录再练一次。', [
          { text: '取消', style: 'cancel' },
          { text: '继续当前训练', onPress: () => router.push('/workout') },
        ]);
      }
    } catch (error) {
      Alert.alert('无法开始训练', error instanceof Error ? error.message : '请再试一次。');
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  };
  const confirmDelete = () => Alert.alert('删除训练记录', '删除后无法恢复，确定继续？', [
    { text: '取消', style: 'cancel' },
    { text: '删除', style: 'destructive', onPress: async () => {
      try {
        await deleteWorkout(workout.id);
        router.navigate('/history');
      } catch {
        Alert.alert('删除失败', '请再试一次。');
      }
    } },
  ]);

  return <Page>
    <View style={styles.back}>
      <IconButton icon="chevron-back" label="返回" onPress={back} />
      <View style={styles.actions}>
        <IconButton icon="create-outline" label="编辑训练记录" onPress={() => router.push({ pathname: '/history/edit/[id]', params: { id: workout.id } })} />
        <IconButton icon="trash-outline" label="删除训练记录" color={c.danger} onPress={confirmDelete} />
      </View>
    </View>
    <Header eyebrow={`${justSaved ? '已保存 · ' : ''}${dateLabel(workout.startedAt)}`} title={workout.name} />
    <Card style={styles.metrics}>
      <Metric value={durationLabel(workout.startedAt, workout.endedAt)} label="训练时长" accent />
      <Metric value={String(sets.length)} label="完成组数" />
      <Metric value={formatVolume(volumeOf(sets), weightUnit)} label={`容量 · ${weightUnit} × 次`} />
    </Card>
    {justSaved ? <Button label="查看训练进度" icon="stats-chart-outline" onPress={() => router.navigate('/history')} /> : null}
    {canSavePlan ? <Button label="存为训练计划" icon="bookmark-outline" variant="secondary" onPress={() => router.push({ pathname: '/plan-editor', params: { workoutId: workout.id } })} /> : null}
    {comparison ? <ComparisonCard comparison={comparison} /> : null}
    {milestones.length ? <>
      <SectionTitle title="本次里程碑" />
      <Card style={styles.milestones}>
        {milestones.map(({ exerciseId, metric, value, previous }) => {
          const { label, unit } = recordLabels[metric];
          const format = (amount: number) => metric === 'weight' ? formatWeight(amount, weightUnit) : `${amount} ${unit}`;
          return <View key={`${exerciseId}:${metric}`} style={styles.milestone}>
            <Ionicons name={previous ? 'trophy-outline' : 'flag-outline'} color={c.accent} size={20} />
            <View style={styles.flex}>
              <Text style={styles.exerciseName}>{exercises.find(item => item.id === exerciseId)?.name ?? '未知动作'}</Text>
              <Text style={styles.exerciseMeta}>{previous ? `${label}新高 · 原纪录 ${format(previous)}` : `${label}首次记录`}</Text>
            </View>
            <Text style={styles.milestoneValue}>{format(value)}</Text>
          </View>;
        })}
      </Card>
    </> : null}
    <SectionTitle title="动作明细" />
    {!sets.length ? <Card><Text style={styles.note}>这次训练没有已完成的组。</Text></Card> : null}
    {exerciseIds.map((exerciseId, index) => {
      const exercise = exercises.find(item => item.id === exerciseId);
      const exerciseSets = sets.filter(set => set.exerciseId === exerciseId);
      const volume = volumeOf(exerciseSets);
      const seconds = exerciseSets.reduce((sum, set) => sum + (set.unit === 'seconds' ? set.reps : 0), 0);
      const ordinals = setOrdinals(exerciseSets);
      const e1rm = bestOneRepMax(exerciseSets);
      return <Card key={exerciseId}>
        <View style={styles.exerciseHeader}>
          <View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.exerciseName}>{exercise?.name ?? '未知动作'}</Text>
            <Text style={styles.exerciseMeta}>{exerciseSets.length} 组{volume ? ` · ${formatVolume(volume, weightUnit)} ${weightUnit} × 次` : ''}{seconds ? ` · ${seconds} 秒` : ''}</Text>
            {e1rm !== undefined ? <Text style={styles.exerciseMeta}>估算 1RM · {formatOneRepMax(e1rm, weightUnit)}</Text> : null}
          </View>
          {exerciseSets.some(set => set.reps > 0) ? <IconButton
            icon="stats-chart-outline"
            color={c.accent}
            label={`查看${exercise?.name ?? '该动作'}的进步`}
            onPress={() => router.navigate({ pathname: '/history', params: { exerciseId } })}
          /> : null}
        </View>
        <View style={styles.divider} />
        {exerciseSets.map(set => <View key={set.id} style={[styles.setRow, ordinals.get(set.id)?.warmup && styles.warmup]}>
          <Text style={styles.setNumber}>{ordinals.get(set.id)?.warmup ? `W · ${setTitle(ordinals.get(set.id))}` : setTitle(ordinals.get(set.id))}</Text>
          <Text style={styles.setValue}>{set.weight > 0 ? `${formatWeight(set.weight, weightUnit)} × ` : ''}{targetLabel(set.reps, set.unit)}</Text>
          <RpeTag rpe={set.rpe} />
          <Ionicons name="checkmark-circle" size={17} color={c.success} />
        </View>)}
      </Card>;
    })}
    {workout.note ? <><SectionTitle title="训练笔记" /><Card><Text style={styles.note}>{workout.note}</Text></Card></> : null}
    {!justSaved && sets.length > 0 ? <Button label={starting ? '正在开始…' : '再练一次'} icon="repeat-outline" onPress={startAgain} disabled={starting} /> : null}
  </Page>;
}

function ComparisonCard({ comparison: { current, previous, previousWorkout } }: { comparison: WorkoutComparison }) {
  const styles = useStyles();
  const { preferences: { weightUnit } } = useLibrary();
  const rows = [{ label: '完成组数', unit: '组', before: previous.completedSets, after: current.completedSets }];
  if (current.volume || previous.volume) rows.push({ label: '训练容量', unit: `${weightUnit} × 次`, before: toDisplayWeight(previous.volume, weightUnit), after: toDisplayWeight(current.volume, weightUnit) });
  if (current.timedSeconds || previous.timedSeconds) rows.push({ label: '计时总时长', unit: '秒', before: previous.timedSeconds, after: current.timedSeconds });

  return <>
    <SectionTitle title="同计划对照" action="查看上次" onAction={() => router.push({ pathname: '/history/[id]', params: { id: previousWorkout.id } })} />
    <Card style={styles.comparison}>
      <Text style={styles.comparisonSource}>{new Date(previousWorkout.startedAt).toLocaleDateString('zh-CN')} · {previousWorkout.name}</Text>
      {rows.map(({ label, unit, before, after }) => {
        const delta = Math.round((after - before) * 100) / 100;
        return <View key={label} style={styles.comparisonRow}>
          <View style={styles.flex}>
            <Text style={styles.exerciseName}>{label}</Text>
            <Text style={styles.comparisonSource}>上次 {comparisonNumber.format(before)} · 本次 {comparisonNumber.format(after)} {unit}</Text>
          </View>
          <Text style={styles.comparisonChange}>{delta ? `${delta > 0 ? '+' : ''}${comparisonNumber.format(delta)} ${unit}` : '持平'}</Text>
        </View>;
      })}
    </Card>
  </>;
}

const useStyles = makeStyles(c => ({
  back: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 18 },
  metrics: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  comparison: { gap: 14 },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  comparisonSource: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
  comparisonChange: { color: c.text, fontSize: 14, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  milestones: { gap: 16 },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestoneValue: { color: c.accent, fontSize: 17, fontWeight: '800' },
  exerciseHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  index: { width: 38, height: 38, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  indexText: { color: c.accent, fontWeight: '800' },
  exerciseName: { color: c.text, fontSize: 16, fontWeight: '700' },
  exerciseMeta: { color: c.textMuted, fontSize: 11, marginTop: 4 },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 14 },
  warmup: { backgroundColor: c.warningSoft, borderRadius: 10, paddingHorizontal: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 },
  setNumber: { color: c.textFaint, fontSize: 12, width: 55 },
  setValue: { flex: 1, color: c.text, fontSize: 14 },
  note: { color: c.text, fontSize: 14, lineHeight: 22 },
}));
