import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { Badge, Button, Empty, Field, Header, IconButton, Page } from '@/ui/components';
import { C } from '@/ui/theme';
import { demoFor } from '@/lib/exercise-demos';
import type { Exercise } from '@/lib/types';
import { ExerciseDemoModal } from '@/ui/exercise-demo';

const muscles = ['全部', '胸', '背', '腿', '肩', '手臂', '核心', '全身', '呼吸'];

export default function Exercises() {
  const { exercises, workoutSets, addExercise } = useData();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('全部');
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [newMuscle, setNewMuscle] = useState('胸');
  const [demoExercise, setDemoExercise] = useState<Exercise | null>(null);
  const filtered = useMemo(() => exercises.filter(exercise => (muscle === '全部' || muscle === exercise.muscle) && (exercise.name.includes(query.trim()) || exercise.equipment.includes(query.trim()))), [exercises, muscle, query]);

  async function save() {
    if (!name.trim()) return Alert.alert('请输入动作名称');
    if (exercises.some(item => item.name === name.trim())) return Alert.alert('动作已存在');
    await addExercise(name, newMuscle, equipment || '自定义');
    setName(''); setEquipment(''); setModal(false);
  }

  return <Page>
    <Header eyebrow="EXERCISE LIBRARY" title="动作库" right={<IconButton icon="add" onPress={() => setModal(true)} />} />
    <Field value={query} onChangeText={setQuery} placeholder="搜索动作或器械" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>{muscles.map(item => <Badge key={item} label={item} active={muscle === item} onPress={() => setMuscle(item)} />)}</ScrollView>
    <View style={styles.count}><Text style={styles.countText}>{filtered.length} 个动作</Text><Text style={styles.countText}>自定义 {exercises.filter(item => item.isCustom).length}</Text></View>
    {filtered.length ? filtered.map(exercise => {
      const done = workoutSets.filter(set => set.exerciseId === exercise.id && set.completed);
      const best = done.length ? Math.max(...done.map(set => set.weight)) : null;
      const hasDemo = !!demoFor(exercise);
      return <Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`${exercise.name}，${hasDemo ? '查看动图' : '暂无动图'}`} onPress={() => setDemoExercise(exercise)} style={styles.row}><View style={styles.symbol}><Ionicons name={hasDemo ? 'play-circle-outline' : 'barbell-outline'} size={24} color={C.accent} /></View><View style={{ flex: 1 }}><Text style={styles.name}>{exercise.name}</Text><Text style={styles.sub}>{exercise.muscle} · {exercise.equipment}{exercise.isCustom ? ' · 自定义' : ''}</Text>{hasDemo ? <Text style={styles.demoLabel}>查看动图</Text> : null}</View>{best !== null ? <View style={{ alignItems: 'flex-end' }}><Text style={styles.best}>{best} kg</Text><Text style={styles.bestSub}>最高重量</Text></View> : null}<Ionicons name="chevron-forward" size={16} color={C.faint} /></Pressable>;
    }) : <Empty icon="search-outline" title="没有找到动作" subtitle="调整关键词，或者创建一个自己的动作" />}
    <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}><SafeAreaView style={styles.modal} edges={['top', 'bottom']}><View style={styles.modalHeader}><Text style={styles.modalTitle}>新增动作</Text><IconButton icon="close" onPress={() => setModal(false)} /></View><View style={{ gap: 20, padding: 20 }}><Field label="动作名称" value={name} onChangeText={setName} placeholder="例如：窄握卧推" /><View style={{ gap: 10 }}><Text style={styles.label}>训练部位</Text><View style={styles.muscles}>{muscles.slice(1).map(item => <Badge key={item} label={item} active={newMuscle === item} onPress={() => setNewMuscle(item)} />)}</View></View><Field label="器械" value={equipment} onChangeText={setEquipment} placeholder="例如：杠铃" /><Button label="保存动作" onPress={save} /></View></SafeAreaView></Modal>
    <ExerciseDemoModal exercise={demoExercise} onClose={() => setDemoExercise(null)} />
  </Page>;
}

const styles = StyleSheet.create({
  count: { flexDirection: 'row', justifyContent: 'space-between' }, countText: { color: C.faint, fontSize: 12 },
  row: { borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 15, flexDirection: 'row', gap: 13, alignItems: 'center' }, symbol: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '700' }, sub: { color: C.muted, marginTop: 5, fontSize: 12 }, best: { color: C.accent, fontWeight: '700', fontSize: 14 }, bestSub: { color: C.faint, fontSize: 10, marginTop: 3 },
  demoLabel: { color: C.accent, fontSize: 11, marginTop: 6 },
  modal: { flex: 1, backgroundColor: C.bg }, modalHeader: { paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: C.text, fontSize: 24, fontWeight: '800' }, label: { color: C.muted, fontSize: 13, fontWeight: '600' }, muscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
