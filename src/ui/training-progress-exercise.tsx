import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { filterExercises } from '@/lib/exercise-library';
import type { ExerciseProgress, ProgressMetric } from '@/lib/training-progress';
import { dateLabel, type Exercise } from '@/lib/types';
import { Card, Empty, Field, IconButton, SectionTitle } from './components';
import { C } from './theme';
import { ProgressTabs } from './training-progress-calendar';
import { formatProgressNumber, TrainingProgressChart } from './training-progress-chart';

const metrics: readonly { value: ProgressMetric; label: string; title: string; unit: string }[] = [
  { value: 'weight', label: '重量', title: '单组最大重量', unit: 'kg' },
  { value: 'reps', label: '次数', title: '单组最多次数', unit: '次' },
  { value: 'seconds', label: '时长', title: '单组最长时长', unit: '秒' },
  { value: 'volume', label: '容量', title: '单次训练最大容量', unit: 'kg × 次' },
];

export function ExerciseProgressView({ selected, options, progressByExercise, onSelect, onOpenWorkout }: {
  selected: Exercise | undefined;
  options: Exercise[];
  progressByExercise: Map<string, ExerciseProgress>;
  onSelect: (id: string) => void;
  onOpenWorkout: (id: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const progress = selected ? progressByExercise.get(selected.id) : undefined;
  return <>
    {selected || options.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`选择动作${selected ? `，当前为${selected.name}` : ''}`} accessibilityState={{ disabled: !options.length }} disabled={!options.length} onPress={() => setShowPicker(true)} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.selector}>
        <View style={styles.icon}><Ionicons name="barbell-outline" size={23} color={C.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.selectorLabel}>查看动作</Text>
          <Text style={styles.selectorTitle}>{selected?.name ?? '选择动作'}</Text>
        </View>
        {options.length > 0 ? <Ionicons name="chevron-down" size={19} color={C.muted} /> : null}
      </Card>
    </Pressable> : null}
    {progress ? <ExerciseStats key={progress.exerciseId} progress={progress} onOpenWorkout={onOpenWorkout} /> : <Card><Empty icon="barbell-outline" title={selected ? '这个动作还没有记录' : '从第一次训练开始'} subtitle={selected ? '完成一组这个动作并保存训练后，即可在这里查看表现。' : '保存训练后，在这里查看每个动作的最好成绩和变化。'} /></Card>}
    {showPicker ? <ProgressExercisePicker selectedId={selected?.id} options={options} progressByExercise={progressByExercise} onClose={() => setShowPicker(false)} onSelect={id => { setShowPicker(false); onSelect(id); }} /> : null}
  </>;
}

function ExerciseStats({ progress, onOpenWorkout }: { progress: ExerciseProgress; onOpenWorkout: (id: string) => void }) {
  const [selectedMetric, setSelectedMetric] = useState<ProgressMetric>();
  const options = metrics.filter(item => progress.best[item.value]);
  const metric = options.find(item => item.value === selectedMetric) ?? options[0];
  if (!metric) return <Card><Empty icon="stats-chart-outline" title="还没有可比较的成绩" subtitle="保存含重量、次数或时长的训练组后，这里会显示个人纪录。" /></Card>;
  const best = progress.best[metric.value];
  const points = progress.points.flatMap(point => {
    const value = point[metric.value];
    return value === undefined ? [] : [{ ...point, value }];
  }).slice(0, 6).reverse();

  return <>
    {options.length > 1 ? <ProgressTabs options={options} value={metric.value} onChange={setSelectedMetric} /> : null}
    {best ? <Pressable accessibilityRole="button" accessibilityHint="查看达成此纪录的训练" onPress={() => onOpenWorkout(best.workout.id)} style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.record}>
        <View style={styles.recordHeader}>
          <View style={styles.recordTag}><Ionicons name="trophy-outline" size={14} color={C.accent} /><Text style={styles.recordTagText}>个人纪录</Text></View>
          <Ionicons name="chevron-forward" size={17} color={C.muted} />
        </View>
        <Text style={styles.recordTitle}>{metric.title}</Text>
        <Text style={styles.recordValue}>{formatProgressNumber(best[metric.value] ?? 0)} <Text style={styles.recordUnit}>{metric.unit}{metric.value === 'weight' && best.weightReps ? ` × ${best.weightReps} 次` : ''}</Text></Text>
        <Text style={styles.description}>{dateLabel(best.workout.startedAt)} · {best.workout.name}</Text>
      </Card>
    </Pressable> : null}
    <SectionTitle title="动作趋势" />
    <TrainingProgressChart description={`${metric.title} · 最近 ${points.length} 次相关训练`} points={points} unit={metric.unit} onOpenWorkout={onOpenWorkout} />
  </>;
}

function ProgressExercisePicker({ selectedId, options, progressByExercise, onClose, onSelect }: {
  selectedId: string | undefined;
  options: Exercise[];
  progressByExercise: Map<string, ExerciseProgress>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = filterExercises(options, { query, muscle: '全部' });
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
      <View style={styles.pickerHeader}><Text style={styles.pickerTitle} accessibilityRole="header">选择有记录的动作</Text><IconButton icon="close" label="关闭动作选择" onPress={onClose} /></View>
      <View style={styles.pickerSearch}><Field label="搜索动作" value={query} onChangeText={setQuery} placeholder="动作、器械或部位" /></View>
      <FlatList data={matches} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pickerList} ListEmptyComponent={<Empty icon="search-outline" title="没有找到动作" subtitle="试试动作、器械或训练部位的关键词。" />} renderItem={({ item }) => {
        const selected = item.id === selectedId;
        const count = progressByExercise.get(item.id)?.points.length ?? 0;
        return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(item.id)} style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
          <View style={styles.flex}><Text style={styles.selectorTitle}>{item.name}</Text><Text style={styles.description}>{[item.muscle, item.equipment, `${count} 次训练`].filter(Boolean).join(' · ')}</Text></View>
          <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={21} color={selected ? C.accent : C.muted} />
        </Pressable>;
      }} />
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' },
  selectorLabel: { color: C.muted, fontSize: 12, marginBottom: 4 },
  selectorTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  record: { gap: 8, backgroundColor: C.accentDark, borderColor: '#3A552A' },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordTag: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  recordTagText: { color: C.accent, fontSize: 12, fontWeight: '800' },
  recordTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  recordValue: { color: C.accent, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  recordUnit: { color: C.accent, fontSize: 14, fontWeight: '700' },
  description: { color: C.muted, fontSize: 12, lineHeight: 18 },
  modal: { flex: 1, backgroundColor: C.bg },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20 },
  pickerTitle: { flex: 1, color: C.text, fontSize: 22, fontWeight: '800' },
  pickerSearch: { paddingHorizontal: 20, paddingBottom: 12 },
  pickerList: { paddingHorizontal: 20, paddingBottom: 24 },
  pickerRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
});
