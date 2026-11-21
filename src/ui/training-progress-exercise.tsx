import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '@/lib/data';
import { filterExercises } from '@/lib/exercise-library';
import type { ExerciseProgress, ExerciseProgressPoint, ProgressMetric } from '@/lib/training-progress';
import { dateLabel, type Exercise, type WeightUnit } from '@/lib/types';
import { formatVolume, formatWeightValue } from '@/lib/units';
import { Card, Empty, Field, IconButton, Segmented, SectionTitle, Tag, Txt } from './components';
import { formatOneRepMaxValue, toDisplayWeight } from './set-display';
import { makeStyles, radius, space, useTheme } from './theme';
import { formatProgressNumber, TrainingProgressChart } from './training-progress-chart';

type MetricSpec = {
  value: ProgressMetric;
  label: string;
  title: string;
  unit: (weightUnit: WeightUnit) => string;
  /** Raw stored value (kg for loads) → display-unit number for the chart. */
  display: (value: number, weightUnit: WeightUnit) => number;
  format: (value: number, weightUnit: WeightUnit) => string;
};

const plain = (value: number) => value;
const metrics: readonly MetricSpec[] = [
  { value: 'weight', label: '重量', title: '单组最大重量', unit: u => u, display: toDisplayWeight, format: formatWeightValue },
  { value: 'e1rm', label: '1RM', title: '估算 1RM', unit: u => u, display: toDisplayWeight, format: formatOneRepMaxValue },
  { value: 'reps', label: '次数', title: '单组最多次数', unit: () => '次', display: plain, format: formatProgressNumber },
  { value: 'seconds', label: '时长', title: '单组最长时长', unit: () => '秒', display: plain, format: formatProgressNumber },
  { value: 'volume', label: '容量', title: '单次训练最大容量', unit: u => `${u} × 次`, display: toDisplayWeight, format: formatVolume },
];

export function ExerciseProgressView({ selected, options, progressByExercise, onSelect, onOpenWorkout }: {
  selected: Exercise | undefined;
  options: Exercise[];
  progressByExercise: Map<string, ExerciseProgress>;
  onSelect: (id: string) => void;
  onOpenWorkout: (id: string) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const progress = selected ? progressByExercise.get(selected.id) : undefined;
  return <>
    {selected || options.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`选择动作${selected ? `，当前为${selected.name}` : ''}`} accessibilityState={{ disabled: !options.length }} disabled={!options.length} onPress={() => setShowPicker(true)} style={({ pressed }) => pressed && s.pressed}>
      <Card style={s.selector}>
        <View style={s.selectorIcon}><Ionicons name="barbell-outline" size={20} color={c.data} /></View>
        <View style={s.flex}>
          <Txt variant="caption" tone="muted">查看动作</Txt>
          <Txt variant="title3" numberOfLines={1}>{selected?.name ?? '选择动作'}</Txt>
        </View>
        {options.length > 0 ? <View style={s.switch}><Txt variant="caption" tone="muted" style={{ fontWeight: '700' }}>切换</Txt><Ionicons name="chevron-down" size={16} color={c.textMuted} /></View> : null}
      </Card>
    </Pressable> : null}
    {progress ? <ExerciseStats key={progress.exerciseId} progress={progress} onOpenWorkout={onOpenWorkout} /> : <Card><Empty icon="barbell-outline" title={selected ? '这个动作还没有记录' : '从第一次训练开始'} subtitle={selected ? '完成一组这个动作并保存训练后，即可在这里查看表现。' : '保存训练后，在这里查看每个动作的最好成绩和变化。'} /></Card>}
    {showPicker ? <ProgressExercisePicker selectedId={selected?.id} options={options} progressByExercise={progressByExercise} onClose={() => setShowPicker(false)} onSelect={id => { setShowPicker(false); onSelect(id); }} /> : null}
  </>;
}

function ExerciseStats({ progress, onOpenWorkout }: { progress: ExerciseProgress; onOpenWorkout: (id: string) => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const { preferences: { weightUnit } } = useLibrary();
  const [selectedMetric, setSelectedMetric] = useState<ProgressMetric>();
  const options = metrics.filter(item => progress.best[item.value]);
  const metric = options.find(item => item.value === selectedMetric) ?? options[0];
  if (!metric) return <Card><Empty icon="stats-chart-outline" title="还没有可比较的成绩" subtitle="保存含重量、次数或时长的训练组后，这里会显示个人纪录。" /></Card>;
  const best = progress.best[metric.value];
  const unit = metric.unit(weightUnit);
  const relevant = progress.points.filter((point): point is ExerciseProgressPoint & Record<ProgressMetric, number> => point[metric.value] !== undefined);
  const points = relevant.slice(0, 6).reverse().map(point => ({
    workout: point.workout,
    value: metric.display(point[metric.value], weightUnit),
    label: metric.format(point[metric.value], weightUnit),
  }));
  const bestValue = best?.[metric.value] ?? 0;

  return <>
    {options.length > 1 ? <Segmented accessibilityLabel="进步指标" options={options} value={metric.value} onChange={setSelectedMetric} /> : null}
    {best ? <Pressable accessibilityRole="button" accessibilityLabel={`个人纪录，${metric.title} ${metric.format(bestValue, weightUnit)} ${unit}，${dateLabel(best.workout.startedAt)}，${best.workout.name}`} accessibilityHint="查看达成此纪录的训练" onPress={() => onOpenWorkout(best.workout.id)} style={({ pressed }) => pressed && s.pressed}>
      <Card style={s.record}>
        <View style={s.recordHeader}>
          <Tag label="个人纪录" tone="data" icon="trophy" />
          <Ionicons name="chevron-forward" size={17} color={c.textFaint} />
        </View>
        <Txt variant="caption" tone="muted">{metric.title}</Txt>
        <Txt variant="display" numberOfLines={1}>
          {metric.format(bestValue, weightUnit)}
          <Txt variant="title3" tone="muted">{` ${unit}${metric.value === 'weight' && best.weightReps ? ` × ${best.weightReps} 次` : ''}`}</Txt>
        </Txt>
        <View style={s.recordFooter}>
          <Txt variant="caption" tone="muted" numberOfLines={1} style={s.flex}>{dateLabel(best.workout.startedAt)} · {best.workout.name}</Txt>
          <Txt variant="caption" tone="faint">{relevant.length} 次记录</Txt>
        </View>
        {metric.value === 'e1rm' ? <Txt variant="caption" tone="faint">按 Epley 公式由 1–12 次的正式组估算，不含热身组。</Txt> : null}
      </Card>
    </Pressable> : null}
    <SectionTitle title="动作趋势" />
    <TrainingProgressChart description={`${metric.title} · 最近 ${points.length} 次相关训练`} points={points} unit={unit} onOpenWorkout={onOpenWorkout} />
  </>;
}

function ProgressExercisePicker({ selectedId, options, progressByExercise, onClose, onSelect }: {
  selectedId: string | undefined;
  options: Exercise[];
  progressByExercise: Map<string, ExerciseProgress>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [query, setQuery] = useState('');
  const matches = filterExercises(options, { query, muscle: '全部' });
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
      <View style={s.pickerHeader}>
        <View style={s.flex}>
          <Txt variant="title2" accessibilityRole="header">选择有记录的动作</Txt>
          <Txt variant="caption" tone="muted">{options.length} 个动作</Txt>
        </View>
        <IconButton icon="close" label="关闭动作选择" onPress={onClose} />
      </View>
      <View style={s.pickerSearch}><Field label="搜索动作" value={query} onChangeText={setQuery} placeholder="动作、器械或部位" /></View>
      <FlatList data={matches} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.pickerList}
        ListEmptyComponent={<Empty icon="search-outline" title="没有找到动作" subtitle="试试动作、器械或训练部位的关键词。" />}
        renderItem={({ item, index }) => {
          const selected = item.id === selectedId;
          const count = progressByExercise.get(item.id)?.points.length ?? 0;
          return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(item.id)} style={({ pressed }) => [s.pickerRow, index < matches.length - 1 && s.pickerDivider, pressed && s.pressed]}>
            <View style={s.flex}>
              <Txt variant="title3" style={{ fontSize: 16 }} numberOfLines={1}>{item.name}</Txt>
              <Txt variant="caption" tone="muted">{[item.muscle, item.equipment, `${count} 次训练`].filter(Boolean).join(' · ')}</Txt>
            </View>
            <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={selected ? 22 : 18} color={selected ? c.text : c.textFaint} />
          </Pressable>;
        }} />
    </SafeAreaView>
  </Modal>;
}

const useStyles = makeStyles(c => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  selectorIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.dataSoft, alignItems: 'center', justifyContent: 'center' },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: c.surfaceAlt },
  record: { gap: space.xs },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  recordFooter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  modal: { flex: 1, backgroundColor: c.bg },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.page, paddingTop: space.xl, paddingBottom: space.md },
  pickerSearch: { paddingHorizontal: space.page, paddingBottom: space.md },
  pickerList: { paddingHorizontal: space.page, paddingBottom: space.xxl },
  pickerRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  pickerDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
}));
