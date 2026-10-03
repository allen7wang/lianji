import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import type { PlanDraftItem } from '@/lib/types';
import { defaultUnit } from '@/lib/training-target';
import { Badge, Button, Card, ExercisePicker, Field, IconButton } from '@/ui/components';
import { C } from '@/ui/theme';

function NumberField({ value, onChange, suffix }: { value: number; onChange: (value: number) => void; suffix: string }) {
  const [text, setText] = useState(String(value));
  return <View style={styles.numberBox}><TextInput value={text} onChangeText={setText} onBlur={() => {
    const number = Number(text.replace(',', '.'));
    if (Number.isFinite(number) && number >= 0 && number <= 1000) onChange(number);
    else setText(String(value));
  }} keyboardType="decimal-pad" selectTextOnFocus style={styles.numberInput} /><Text style={styles.numberSuffix}>{suffix}</Text></View>;
}

export default function PlanEditor() {
  const { id: routeId } = useLocalSearchParams<{ id?: string }>();
  const { ready, plans, planItems } = useData();
  const existing = plans.find(item => item.id === routeId);
  if (!ready) return <SafeAreaView style={styles.screen} edges={['top']} />;
  return <PlanEditorContent key={routeId ?? 'new'} routeId={routeId} initialName={existing?.name ?? ''} initialNote={existing?.note ?? ''} initialItems={planItems.filter(item => item.planId === routeId).map(item => ({ exerciseId: item.exerciseId, sets: item.sets, reps: item.reps, weight: item.weight, unit: item.unit, restSeconds: item.restSeconds }))} />;
}

function PlanEditorContent({ routeId, initialName, initialNote, initialItems }: { routeId?: string; initialName: string; initialNote: string; initialItems: PlanDraftItem[] }) {
  const { exercises, savePlan } = useData();
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState(initialNote);
  const [items, setItems] = useState<PlanDraftItem[]>(initialItems);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const change = (index: number, patch: Partial<PlanDraftItem>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  async function save() {
    if (!name.trim()) return Alert.alert('请输入计划名称');
    if (!items.length) return Alert.alert('请至少添加一个动作');
    if (items.some(item => !Number.isInteger(item.sets) || item.sets < 1 || item.sets > 20 || !Number.isInteger(item.reps) || item.reps < 1 || item.reps > 1000 || !Number.isInteger(item.restSeconds ?? 90) || (item.restSeconds ?? 90) < 0 || (item.restSeconds ?? 90) > 600)) return Alert.alert('组数、次数或秒数及休息时间需为有效整数', '组数 1–20，次数或秒数 1–1000，休息 0–600 秒。');
    setSaving(true);
    try { await savePlan(name, note, items, routeId); router.back(); }
    catch (error) { Alert.alert('保存失败', String(error)); }
    finally { setSaving(false); }
  }

  return <SafeAreaView style={styles.screen} edges={['top']}>
    <View style={styles.header}><IconButton icon="chevron-back" onPress={() => router.back()} /><Text style={styles.headerTitle}>{routeId ? '编辑计划' : '创建计划'}</Text><View style={{ width: 39 }} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Field label="计划名称" value={name} onChangeText={setName} placeholder="例如：周一 · 推日" />
      <Field label="计划说明（可选）" value={note} onChangeText={setNote} placeholder="记录这个计划的训练重点" />
      <View style={styles.section}><Text style={styles.sectionTitle}>训练动作</Text><Text style={styles.sectionCount}>{items.length} 个动作</Text></View>
      {items.map((item, index) => {
        const exercise = exercises.find(ex => ex.id === item.exerciseId);
        return <Card key={item.exerciseId} style={{ gap: 15 }}><View style={styles.exerciseHeader}><View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={styles.exerciseName}>{exercise?.name ?? '未知动作'}</Text><Text style={styles.exerciseMeta}>{exercise?.muscle} · {exercise?.equipment}</Text></View><Pressable onPress={() => setItems(current => current.filter((_, i) => i !== index))} hitSlop={12}><Ionicons name="close-circle-outline" size={22} color={C.faint} /></Pressable></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><Badge label="按次数" active={item.unit !== 'seconds'} onPress={() => change(index, { unit: 'reps' })} /><Badge label="按秒" active={item.unit === 'seconds'} onPress={() => change(index, { unit: 'seconds' })} /></View>
          <View style={styles.fields}><View style={styles.field}><Text style={styles.fieldLabel}>组数</Text><NumberField value={item.sets} suffix="组" onChange={sets => change(index, { sets })} /></View><View style={styles.field}><Text style={styles.fieldLabel}>{item.unit === 'seconds' ? '时长' : '次数'}</Text><NumberField value={item.reps} suffix={item.unit === 'seconds' ? '秒' : '次'} onChange={reps => change(index, { reps })} /></View><View style={styles.field}><Text style={styles.fieldLabel}>目标重量</Text><NumberField value={item.weight} suffix="kg" onChange={weight => change(index, { weight })} /></View></View>
          <View style={{ gap: 6 }}><Text style={styles.fieldLabel}>每组结束后的休息</Text><NumberField value={item.restSeconds ?? 90} suffix="秒" onChange={restSeconds => change(index, { restSeconds })} /></View>
        </Card>;
      })}
      <Button label="添加动作" icon="add-circle-outline" variant="secondary" onPress={() => setPicker(true)} />
      <Text style={styles.hint}>目标重量可填 0，正式训练时可以按实际情况修改。</Text>
    </ScrollView>
    <View style={styles.footer}><Button label={saving ? '保存中…' : '保存计划'} onPress={save} disabled={saving} /></View>
    <ExercisePicker visible={picker} onClose={() => setPicker(false)} excluded={items.map(item => item.exerciseId)} onSelect={exercise => setItems(current => [...current, { exerciseId: exercise.id, sets: 3, reps: defaultUnit(exercise) === 'seconds' ? 30 : 10, weight: 0, unit: defaultUnit(exercise), restSeconds: 90 }])} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  content: { paddingHorizontal: 20, gap: 18, paddingBottom: 30 }, section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }, sectionTitle: { color: C.text, fontSize: 19, fontWeight: '700' }, sectionCount: { color: C.muted, fontSize: 12 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, index: { width: 39, height: 39, borderRadius: 11, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, indexText: { color: C.accent, fontWeight: '800' }, exerciseName: { color: C.text, fontWeight: '700', fontSize: 16 }, exerciseMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  fields: { flexDirection: 'row', gap: 10 }, field: { flex: 1, gap: 6 }, fieldLabel: { color: C.muted, fontSize: 11 }, numberBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, backgroundColor: C.elevated, paddingHorizontal: 8 }, numberInput: { color: C.text, textAlign: 'center', flex: 1, height: 43, fontWeight: '700' }, numberSuffix: { color: C.faint, fontSize: 10 },
  hint: { color: C.faint, fontSize: 11, lineHeight: 17 }, footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: C.line },
});
