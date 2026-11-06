import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { id, type PlanDraftItem } from '@/lib/types';
import { defaultSetTarget } from '@/lib/training-target';
import { availablePlanName, draftPlanCopy } from '@/lib/plan-library';
import { draftPlanFromWorkout, planLimits } from '@/lib/workout-plan';
import { breathingProfileFor } from '@/lib/breathing';
import { Badge, Button, Card, Empty, ExercisePicker, Field, IconButton, Page } from '@/ui/components';
import { ExerciseOrderControls } from '@/ui/exercise-order-controls';
import { C } from '@/ui/theme';

type EditorItem = Omit<PlanDraftItem, 'sets' | 'reps' | 'weight' | 'restSeconds'> & {
  draftId: string;
  sets: string;
  reps: string;
  weight: string;
  restSeconds: string;
};

function editorItem(item: PlanDraftItem): EditorItem {
  return { ...item, draftId: id(), sets: String(item.sets), reps: String(item.reps), weight: String(item.weight), restSeconds: String(item.restSeconds ?? 90) };
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix: string }) {
  return <View style={styles.numberBox}><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={suffix === 'kg' ? 'decimal-pad' : 'number-pad'} selectTextOnFocus style={styles.numberInput} /><Text style={styles.numberSuffix}>{suffix}</Text></View>;
}

export default function PlanEditor() {
  const { id: routeId, workoutId, copyPlanId } = useLocalSearchParams<{ id?: string; workoutId?: string; copyPlanId?: string }>();
  const { ready, plans, planItems, workouts, workoutSets, exercises } = useData();
  const existing = plans.find(item => item.id === routeId);
  if (!ready) return <SafeAreaView style={styles.screen} edges={['top']} />;

  if (copyPlanId && !routeId) {
    const source = plans.find(plan => plan.id === copyPlanId);
    if (!source) return <Page>
      <Empty icon="calendar-outline" title="找不到要复制的计划" subtitle="可以从计划页选择其他训练计划。" />
      <Button label="返回计划" onPress={() => router.navigate('/plans')} />
    </Page>;
    const draft = draftPlanCopy(source, planItems, plans);
    return <PlanEditorContent key={`copy-${source.id}`} copiedPlan initialName={draft.name} initialNote={draft.note} initialItems={draft.items} />;
  }
  if (workoutId && !routeId) {
    const source = workouts.find(workout => workout.id === workoutId && workout.endedAt);
    const exerciseIds = new Set(exercises.map(exercise => exercise.id));
    const items = source ? draftPlanFromWorkout(workoutSets.filter(set => set.workoutId === source.id && exerciseIds.has(set.exerciseId))) : [];
    if (!source || !items.length) return <Page>
      <Empty icon="barbell-outline" title="无法从这次训练创建计划" subtitle="请选择有完成组的训练记录。" />
      <Button label="返回训练记录" onPress={() => router.canGoBack() ? router.back() : router.navigate('/history')} />
    </Page>;
    const name = availablePlanName(`${source.name} · 复练计划`, plans);
    return <PlanEditorContent key={source.id} fromWorkout initialName={name} initialNote="" initialItems={items} />;
  }
  if (routeId && !existing) return <Page>
    <Empty icon="calendar-outline" title="训练计划不存在" subtitle="可以在计划页选择其他训练计划。" />
    <Button label="返回计划" onPress={() => router.navigate('/plans')} />
  </Page>;
  return <PlanEditorContent key={routeId ?? 'new'} routeId={routeId} initialName={existing?.name ?? ''} initialNote={existing?.note ?? ''} initialItems={planItems.filter(item => item.planId === routeId)} />;
}

function PlanEditorContent({ routeId, fromWorkout = false, copiedPlan = false, initialName, initialNote, initialItems }: { routeId?: string; fromWorkout?: boolean; copiedPlan?: boolean; initialName: string; initialNote: string; initialItems: PlanDraftItem[] }) {
  const { exercises, savePlan } = useData();
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState(initialNote);
  const [items, setItems] = useState(() => initialItems.map(editorItem));
  const [picker, setPicker] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);

  const change = (draftId: string, patch: Partial<EditorItem>) => setItems(current => current.map(item => item.draftId === draftId ? { ...item, ...patch } : item));
  const move = (draftId: string, direction: -1 | 1) => {
    if (saveInFlight.current) return;
    setItems(current => {
      const index = current.findIndex(item => item.draftId === draftId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  async function save() {
    if (saveInFlight.current) return;
    if (!name.trim()) return Alert.alert('请输入计划名称');
    if (!items.length) return Alert.alert('请至少添加一个动作');
    const targets = items.map(item => ({
      exerciseId: item.exerciseId,
      unit: item.unit,
      sets: Number(item.sets),
      reps: Number(item.reps),
      weight: Number(item.weight.replace(',', '.')),
      restSeconds: Number(item.restSeconds),
    }));
    if (targets.some(item =>
      !Number.isInteger(item.sets) || item.sets < 1 || item.sets > planLimits.sets ||
      !Number.isInteger(item.reps) || item.reps < 1 || item.reps > planLimits.reps ||
      !Number.isInteger(item.restSeconds) || item.restSeconds < 0 || item.restSeconds > planLimits.restSeconds ||
      !Number.isFinite(item.weight) || item.weight < 0 || item.weight > planLimits.weight
    )) return Alert.alert('请检查训练目标', `组数 1–${planLimits.sets}，次数或秒数 1–${planLimits.reps}，休息 0–${planLimits.restSeconds} 秒。以上三项须为整数。重量 0–${planLimits.weight} kg。`);
    saveInFlight.current = true;
    setSaving(true);
    try {
      await savePlan(name, note, targets, routeId);
      if (fromWorkout || copiedPlan || !router.canGoBack()) router.navigate('/plans');
      else router.back();
    }
    catch (error) { Alert.alert('保存失败', String(error)); }
    finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}><IconButton icon="chevron-back" label="返回" onPress={() => router.canGoBack() ? router.back() : router.navigate('/plans')} /><Text style={styles.headerTitle}>{copiedPlan ? '复制计划' : fromWorkout ? '存为训练计划' : routeId ? '编辑计划' : '创建计划'}</Text><View style={{ width: 39 }} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {copiedPlan ? <Card><Text style={styles.copyHint}>已填入这份计划的动作和训练目标。调整后保存，即可添加一份新计划。</Text></Card> : null}
      {fromWorkout ? <Card><Text style={styles.copyHint}>按每个动作最后一个完成组填入目标，组数取同单位的完成组。超出计划上限的值已按上限预填，保存前可调整。</Text></Card> : null}
      <Field label="计划名称" value={name} onChangeText={setName} placeholder="例如：周一 · 推日" />
      <Field label="计划说明（可选）" value={note} onChangeText={setNote} placeholder="记录这个计划的训练重点" />
      <View style={styles.section}><Text style={styles.sectionTitle}>训练动作</Text><Text style={styles.sectionCount}>{items.length} 个动作</Text></View>
      {items.map((item, index) => {
        const exercise = exercises.find(ex => ex.id === item.exerciseId);
        return <Card key={item.draftId} style={{ gap: 15 }}><View style={styles.exerciseHeader}><View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise?.name ?? '未知动作'}</Text><Text style={styles.exerciseMeta}>{exercise?.muscle} · {exercise?.equipment}</Text></View><Pressable onPress={() => setItems(current => current.filter(candidate => candidate.draftId !== item.draftId))} hitSlop={12}><Ionicons name="close-circle-outline" size={22} color={C.faint} /></Pressable></View>
          <ExerciseOrderControls name={exercise?.name ?? '未知动作'} index={index} total={items.length} disabled={saving} onMove={direction => move(item.draftId, direction)} />
          <Button label="更换动作" icon="swap-horizontal-outline" variant="secondary" onPress={() => { setReplacingId(item.draftId); setPicker(true); }} />
          <View style={{ flexDirection: 'row', gap: 8 }}><Badge label="按次数" active={item.unit !== 'seconds'} onPress={() => change(item.draftId, { unit: 'reps' })} /><Badge label="按秒" active={item.unit === 'seconds'} onPress={() => change(item.draftId, { unit: 'seconds' })} /></View>
          <View style={styles.fields}><View style={styles.field}><Text style={styles.fieldLabel}>组数</Text><NumberField label="组数" value={item.sets} suffix="组" onChange={sets => change(item.draftId, { sets })} /></View><View style={styles.field}><Text style={styles.fieldLabel}>{item.unit === 'seconds' ? '时长' : '次数'}</Text><NumberField label={item.unit === 'seconds' ? '时长（秒）' : '次数'} value={item.reps} suffix={item.unit === 'seconds' ? '秒' : '次'} onChange={reps => change(item.draftId, { reps })} /></View>{!breathingProfileFor(exercise) ? <View style={styles.field}><Text style={styles.fieldLabel}>目标重量</Text><NumberField label="目标重量（kg）" value={item.weight} suffix="kg" onChange={weight => change(item.draftId, { weight })} /></View> : null}</View>
          <View style={{ gap: 6 }}><Text style={styles.fieldLabel}>每组结束后的休息</Text><NumberField label="每组休息时间（秒）" value={item.restSeconds} suffix="秒" onChange={restSeconds => change(item.draftId, { restSeconds })} /></View>
        </Card>;
      })}
      <Button label="添加动作" icon="add-circle-outline" variant="secondary" onPress={() => { setReplacingId(null); setPicker(true); }} />
      <Text style={styles.hint}>上移或下移可调整训练顺序。更换动作会预填 0 kg 和新动作的默认次数或时长，正式训练时可再调整。</Text>
    </ScrollView>
    <View style={styles.footer}><Button label={saving ? '保存中…' : '保存计划'} onPress={save} disabled={saving} /></View>
    <ExercisePicker visible={picker} replacing={replacingId !== null} onClose={() => { setPicker(false); setReplacingId(null); }} excluded={items.map(item => item.exerciseId)} onSelect={exercise => {
      const target = defaultSetTarget(exercise);
      if (replacingId === null) {
        setItems(current => [...current, editorItem({ exerciseId: exercise.id, sets: 3, ...target, restSeconds: 90 })]);
      } else {
        change(replacingId, { exerciseId: exercise.id, unit: target.unit, reps: String(target.reps), weight: String(target.weight) });
      }
    }} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 20, gap: 18, paddingBottom: 30 }, section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }, sectionTitle: { color: C.text, fontSize: 19, fontWeight: '700' }, sectionCount: { color: C.muted, fontSize: 12 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, index: { width: 39, height: 39, borderRadius: 11, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, indexText: { color: C.accent, fontWeight: '800' }, exerciseName: { color: C.text, fontWeight: '700', fontSize: 16 }, exerciseMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  fields: { flexDirection: 'row', gap: 10 }, field: { flex: 1, gap: 6 }, fieldLabel: { color: C.muted, fontSize: 11 }, numberBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, backgroundColor: C.elevated, paddingHorizontal: 8 }, numberInput: { color: C.text, textAlign: 'center', flex: 1, height: 43, fontWeight: '700' }, numberSuffix: { color: C.faint, fontSize: 10 },
  hint: { color: C.faint, fontSize: 11, lineHeight: 17 }, footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: C.line },
  copyHint: { color: C.muted, fontSize: 13, lineHeight: 20 },
});
