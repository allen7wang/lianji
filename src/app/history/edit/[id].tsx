import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatWeightValue, parseWeightInput } from '@/lib/units';
import { useActions, useHistory, useLibrary } from '@/lib/data';
import { dateLabel, type Workout, type WorkoutSet } from '@/lib/types';
import { Button, Card, Empty, Header, IconButton, Page } from '@/ui/components';
import { RpePicker } from '@/ui/rpe-picker';
import { setOrdinals, setTitle } from '@/ui/set-display';
import { makeStyles, useTheme, space } from '@/ui/theme';

type SetDraft = { weight: string; target: string; completed: boolean; rpe: number | null };

function readValue(text: string, original: number, integer: boolean, maximum: number) {
  if (text === String(original)) return original;
  const normalized = text.trim().replace(',', '.');
  const pattern = integer ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/;
  const value = Number(normalized);
  return pattern.test(normalized) && Number.isFinite(value) && value <= maximum ? value : null;
}

export default function EditHistory() {
  const styles = useStyles();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useLibrary();
  const { workouts, sets: workoutSets } = useHistory();
  const workout = workouts.find(item => item.id === id && item.endedAt);
  if (!ready) return <Page><ActivityIndicator accessibilityLabel="正在加载训练" color={c.accent} style={styles.loading} /></Page>;
  if (!workout) return <Page>
    <Empty icon="calendar-outline" title="训练记录不存在" subtitle="返回训练进度，选择一条已保存的训练。" />
    <Button label="返回" onPress={() => router.canGoBack() ? router.back() : router.replace('/history')} />
  </Page>;
  return <HistoryEditor key={workout.id} workout={workout} sets={workoutSets.filter(set => set.workoutId === workout.id)} />;
}

function HistoryEditor({ workout, sets }: { workout: Workout; sets: WorkoutSet[] }) {
  const styles = useStyles();
  const { c } = useTheme();
  const { exercises, preferences: { weightUnit } } = useLibrary();
  const { editFinishedWorkout } = useActions();
  const navigation = useNavigation();
  const [original] = useState(() => ({ name: workout.name, note: workout.note, sets }));
  const [name, setName] = useState(original.name);
  const [note, setNote] = useState(original.note);
  const [rpeSetId, setRpeSetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, SetDraft>>(() => Object.fromEntries(original.sets.map(set => [set.id, {
    weight: formatWeightValue(set.weight, weightUnit), target: String(set.reps), completed: !!set.completed, rpe: set.rpe ?? null,
  }])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const saveInFlight = useRef(false);

  const completed = original.sets.filter(set => draft[set.id].completed).length;
  const dirty = name !== original.name || note !== original.note || original.sets.some(set => {
    const values = draft[set.id];
    return values.weight !== formatWeightValue(set.weight, weightUnit) || values.target !== String(set.reps) || values.completed !== !!set.completed || values.rpe !== (set.rpe ?? null);
  });
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of original.sets) {
    const group = groups.get(set.exerciseId);
    if (group) group.push(set);
    else groups.set(set.exerciseId, [set]);
  }
  const exerciseNames = new Map(exercises.map(exercise => [exercise.id, exercise.name]));

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/history/[id]', params: { id: workout.id } });
  }, [workout.id]);
  usePreventRemove(!saved && (dirty || saving), ({ data }) => {
    if (saveInFlight.current) return;
    Alert.alert('放弃修改？', '离开后，这次编辑的内容将不会保存。', [
      { text: '继续编辑', style: 'cancel' },
      { text: '放弃修改', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { if (saved) back(); }, [back, saved]);

  function updateSet(id: string, patch: Partial<SetDraft>) {
    setDraft(current => ({ ...current, [id]: { ...current[id], ...patch } }));
    setError('');
  }

  async function save() {
    if (saveInFlight.current) return;
    Keyboard.dismiss();
    if (!name.trim()) return setError('请输入训练名称。');
    if (!completed) return setError('至少保留一组已完成的训练。');
    const nextSets = [];
    for (const set of original.sets) {
      const values = draft[set.id];
      const group = `「${exerciseNames.get(set.exerciseId) ?? '未知动作'}」第 ${set.setNumber} 组`;
      const unit = set.unit === 'seconds' ? '秒' : '次';
      const weight = values.weight === formatWeightValue(set.weight, weightUnit) ? set.weight : parseWeightInput(values.weight, weightUnit);
      const reps = readValue(values.target, set.reps, true, 1000);
      if (weight === null) return setError(`${group}的重量超出允许范围。`);
      if (reps === null) return setError(`${group}的目标须为 0–1000 ${unit}的整数。`);
      if (values.completed && reps <= 0) return setError(`${group}已标记完成，目标须大于 0 ${unit}。`);
      nextSets.push({ id: set.id, weight, reps, completed: values.completed ? 1 : 0, rpe: values.rpe });
    }
    saveInFlight.current = true;
    setSaving(true);
    setError('');
    try {
      await editFinishedWorkout(workout.id, { name, note, sets: nextSets });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}><IconButton icon="chevron-back" label="返回训练记录" onPress={() => { if (!saveInFlight.current) back(); }} /><Text style={styles.topTitle} accessibilityRole="header">编辑训练记录</Text><View style={styles.balance} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Header eyebrow={dateLabel(workout.startedAt)} title="修正本次训练" />
        <Card style={styles.card}>
          <Text style={styles.fieldLabel}>训练名称</Text>
          <TextInput accessibilityLabel="训练名称" editable={!saving} value={name} onChangeText={value => { setName(value); setError(''); }} style={styles.input} placeholder="训练名称" placeholderTextColor={c.textMuted} />
          <Text style={styles.fieldLabel}>训练笔记</Text>
          <TextInput accessibilityLabel="训练笔记" editable={!saving} value={note} onChangeText={value => { setNote(value); setError(''); }} multiline style={[styles.input, styles.note]} placeholder="记录当天的训练感受" placeholderTextColor={c.textMuted} />
        </Card>
        <Text style={styles.sectionTitle} accessibilityRole="header">训练组</Text>
        {original.sets.length === 0 ? <Empty icon="barbell-outline" title="这条记录没有训练组" subtitle="保留至少一组已完成的训练才可保存修改。" /> : null}
        {[...groups].map(([exerciseId, items]) => {
          const exerciseName = exerciseNames.get(exerciseId) ?? '未知动作';
          const ordinals = setOrdinals(items);
          return <Card key={exerciseId} style={styles.card}>
            <Text style={styles.exercise} accessibilityRole="header">{exerciseName}</Text>
            {items.map(set => {
              const values = draft[set.id];
              const timed = set.unit === 'seconds';
              const ordinal = ordinals.get(set.id);
              const label = `${exerciseName}${setTitle(ordinal)}`;
              return <View key={set.id} style={[styles.set, ordinal?.warmup && styles.warmup]}>
                <View style={styles.setHeader}>
                  <Text style={styles.setNumber}>{ordinal?.warmup ? `W · ${setTitle(ordinal)}` : setTitle(ordinal)}</Text>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={`${label}完成状态`} accessibilityState={{ checked: values.completed, disabled: saving }} disabled={saving} onPress={() => updateSet(set.id, { completed: !values.completed })} style={[styles.checkbox, values.completed && styles.checked]}>
                    <Ionicons name={values.completed ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={values.completed ? c.success : c.textMuted} />
                    <Text style={[styles.checkboxLabel, values.completed && styles.checkedLabel]}>{values.completed ? '已完成' : '未完成'}</Text>
                  </Pressable>
                </View>
                <View style={styles.fields}>
                  <View style={styles.flex}>
                    <Text style={styles.fieldLabel}>重量 · {weightUnit}</Text>
                    <TextInput accessibilityLabel={`${label}重量，${weightUnit}`} editable={!saving} keyboardType="decimal-pad" selectTextOnFocus value={values.weight} onChangeText={weight => updateSet(set.id, { weight })} style={styles.input} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.fieldLabel}>{timed ? '时长 · 秒' : '次数 · 次'}</Text>
                    <TextInput accessibilityLabel={`${label}${timed ? '时长，秒' : '次数'}`} editable={!saving} keyboardType="number-pad" selectTextOnFocus value={values.target} onChangeText={target => updateSet(set.id, { target })} style={styles.input} />
                  </View>
                </View>
                <Button label={values.rpe === null ? '记录 RPE' : `RPE ${values.rpe}`} variant="plain" size="sm" disabled={saving} onPress={() => setRpeSetId(set.id)} />
              </View>;
            })}
          </Card>;
        })}
      </ScrollView>
      {rpeSetId ? <RpePicker visible title="训练组" value={draft[rpeSetId].rpe} onClose={() => setRpeSetId(null)} onSelect={rpe => updateSet(rpeSetId, { rpe })} /> : null}
      <View style={styles.footer}>
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        <Text style={styles.summary}>{completed} / {original.sets.length} 组完成 · 至少保留 1 组</Text>
        <Button label={saving ? '正在保存…' : '保存修改'} icon="checkmark" disabled={!dirty || saving || saved || !original.sets.length} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const useStyles = makeStyles(c => ({
  screen: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  loading: { marginTop: 32 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.page, paddingVertical: 10, gap: 8 },
  topTitle: { flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '800' },
  balance: { width: 39 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.page, paddingBottom: 28, gap: 16 },
  card: { gap: 8 },
  fieldLabel: { color: c.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: c.surfaceAlt, color: c.text, fontSize: 16 },
  note: { minHeight: 88, textAlignVertical: 'top' },
  sectionTitle: { color: c.text, fontSize: 19, fontWeight: '800' },
  exercise: { color: c.text, fontSize: 17, fontWeight: '800' },
  warmup: { backgroundColor: c.warningSoft, borderRadius: 10, paddingHorizontal: 8 },
  set: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, gap: 4 },
  setHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  setNumber: { color: c.text, fontSize: 14, fontWeight: '700' },
  checkbox: { minHeight: 44, borderRadius: 12, backgroundColor: c.surfaceAlt, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, gap: 6 },
  checked: { backgroundColor: c.successSoft },
  checkboxLabel: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  checkedLabel: { color: c.success },
  fields: { flexDirection: 'row', gap: 10 },
  footer: { width: '100%', maxWidth: 720, alignSelf: 'center', borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 10, paddingHorizontal: space.page, gap: 6 },
  summary: { color: c.textMuted, fontSize: 12, textAlign: 'center' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18, fontWeight: '700' },
}));
