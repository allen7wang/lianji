import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { bestWeightsByExercise, filterExercises } from '@/lib/exercise-library';
import { Badge, Button, Empty, Field, Header, IconButton, Page } from '@/ui/components';
import { C } from '@/ui/theme';
import { demoFor, demoMediaLabel } from '@/lib/exercise-demos';
import type { Exercise } from '@/lib/types';
import { ExerciseDemoModal } from '@/ui/exercise-demo';

const muscles = ['全部', '胸', '背', '腿', '肩', '手臂', '核心', '全身', '呼吸'];

export default function Exercises() {
  const { exercises, workoutSets, addExercise } = useData();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('全部');
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [newMuscle, setNewMuscle] = useState('胸');
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const filtered = useMemo(() => filterExercises(exercises, { query, muscle, offlineOnly }), [exercises, muscle, query, offlineOnly]);
  const bestWeights = useMemo(() => bestWeightsByExercise(workoutSets), [workoutSets]);
  const customCount = useMemo(() => exercises.filter(item => item.isCustom).length, [exercises]);
  const renderExercise = useCallback(({ item }: ListRenderItemInfo<Exercise>) => <ExerciseRow exercise={item} best={bestWeights.get(item.id)} onShow={setDemoExercise} />, [bestWeights]);
  const hasFilters = !!query.trim() || muscle !== '全部' || offlineOnly;
  const clearFilters = () => { setQuery(''); setMuscle('全部'); setOfflineOnly(false); };

  async function save() {
    if (!name.trim()) return Alert.alert('请输入动作名称');
    if (exercises.some(item => item.name === name.trim())) return Alert.alert('动作已存在');
    await addExercise(name, newMuscle, equipment || '自定义');
    setName(''); setEquipment(''); setModal(false);
  }

  return <Page scroll={false}>
    <FlatList style={styles.fill} data={filtered} keyExtractor={item => item.id} renderItem={renderExercise} extraData={bestWeights} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.listHeader}>
        <Header eyebrow="EXERCISE LIBRARY" title="动作库" right={<IconButton icon="add" label="新增动作" onPress={() => setModal(true)} />} />
        <Field value={query} onChangeText={setQuery} placeholder="搜索动作、器械或部位" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{muscles.map(item => <Badge key={item} label={item} active={muscle === item} onPress={() => setMuscle(item)} />)}</ScrollView>
        <View style={styles.count}>
          <Text style={styles.countText}>{filtered.length} 个动作{offlineOnly ? ' · 离线演示' : ` · 自定义 ${customCount}`}</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: offlineOnly }} accessibilityLabel="仅显示离线演示" onPress={() => setOfflineOnly(value => !value)} hitSlop={8} style={styles.offlineToggle}>
            <Ionicons name={offlineOnly ? 'checkbox' : 'square-outline'} size={19} color={offlineOnly ? C.accent : C.muted} /><Text style={[styles.countText, offlineOnly && styles.offlineActive]}>仅离线演示</Text>
          </Pressable>
        </View>
      </View>}
      ListEmptyComponent={<View><Empty icon="search-outline" title="没有找到动作" subtitle={offlineOnly ? '当前筛选下没有离线演示，文字教学仍可离线查看' : '试试用空格组合器械与部位，或创建自己的动作'} />{hasFilters ? <Button label="清除筛选" variant="secondary" onPress={clearFilters} /> : null}</View>}
    />
    <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}><SafeAreaView style={styles.modal} edges={['top', 'bottom']}><View style={styles.modalHeader}><Text style={styles.modalTitle}>新增动作</Text><IconButton icon="close" onPress={() => setModal(false)} /></View><View style={{ gap: 20, padding: 20 }}><Field label="动作名称" value={name} onChangeText={setName} placeholder="例如：窄握卧推" /><View style={{ gap: 10 }}><Text style={styles.label}>训练部位</Text><View style={styles.muscles}>{muscles.slice(1).map(item => <Badge key={item} label={item} active={newMuscle === item} onPress={() => setNewMuscle(item)} />)}</View></View><Field label="器械" value={equipment} onChangeText={setEquipment} placeholder="例如：杠铃" /><Button label="保存动作" onPress={save} /></View></SafeAreaView></Modal>
    <ExerciseDemoModal exercise={demoExercise} onClose={() => setDemoExercise(null)} />
  </Page>;
}

const ExerciseRow = memo(function ExerciseRow({ exercise, best, onShow }: { exercise: Exercise; best?: number; onShow: (exercise: Exercise) => void }) {
  const demo = demoFor(exercise);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.name}，${exercise.muscle}，${exercise.equipment}，${demo ? `${demoMediaLabel(demo)}，查看动作说明` : '暂无动作演示'}`} onPress={() => onShow(exercise)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.symbol}><Ionicons name={demo ? 'play-circle-outline' : 'barbell-outline'} size={24} color={C.accent} /></View>
    <View style={styles.rowText}><Text style={styles.name}>{exercise.name}</Text><Text style={styles.sub}>{exercise.muscle} · {exercise.equipment}{exercise.isCustom ? ' · 自定义' : ''}</Text>{demo ? <Text style={styles.demoLabel}>{demoMediaLabel(demo)} · 动作说明</Text> : null}</View>
    {best !== undefined ? <View style={styles.record}><Text style={styles.best}>{best} kg</Text><Text style={styles.bestSub}>最高重量</Text></View> : null}
    <Ionicons name="chevron-forward" size={16} color={C.faint} />
  </Pressable>;
});

const styles = StyleSheet.create({
  fill: { flex: 1 }, list: { paddingHorizontal: 20, paddingBottom: 110 }, listHeader: { gap: 20, paddingBottom: 8 }, filters: { gap: 8, paddingRight: 8 },
  count: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, countText: { color: C.faint, fontSize: 12 },
  offlineToggle: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 36 }, offlineActive: { color: C.accent },
  rowText: { flex: 1, minWidth: 0 }, record: { alignItems: 'flex-end', flexShrink: 1 }, pressed: { opacity: 0.7 },
  row: { borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 15, flexDirection: 'row', gap: 13, alignItems: 'center' }, symbol: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '700' }, sub: { color: C.muted, marginTop: 5, fontSize: 12 }, best: { color: C.accent, fontWeight: '700', fontSize: 14 }, bestSub: { color: C.faint, fontSize: 10, marginTop: 3 },
  demoLabel: { color: C.accent, fontSize: 11, marginTop: 6 },
  modal: { flex: 1, backgroundColor: C.bg }, modalHeader: { paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: C.text, fontSize: 24, fontWeight: '800' }, label: { color: C.muted, fontSize: 13, fontWeight: '600' }, muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
