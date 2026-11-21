import { Ionicons } from '@expo/vector-icons';
import { memo, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { isWarmup, targetLabel, type WeightUnit, type WorkoutSet } from '@/lib/types';
import { formatWeight, formatWeightValue, parseWeightInput } from '@/lib/units';
import { Txt } from './components';
import { makeStyles, radius, space, type, useTheme } from './theme';

export type SetInputPatch = Partial<Pick<WorkoutSet, 'weight' | 'reps'>>;

export type SetRowProps = {
  item: WorkoutSet;
  /** "W" for warm-ups, otherwise the working-set ordinal. */
  label: string;
  weightUnit: WeightUnit;
  breathing: boolean;
  previous?: WorkoutSet;
  locked: boolean;
  reuseBlocked: boolean;
  onUpdate: (setId: string, patch: SetInputPatch) => Promise<void>;
  onReuse: (setId: string, sourceSetId: string) => Promise<unknown>;
  onToggle: (set: WorkoutSet, patch: SetInputPatch) => void;
  onMenu: (set: WorkoutSet) => void;
  onDelete: (set: WorkoutSet) => void;
  onTimer: (set: WorkoutSet) => void;
  onRpe: (set: WorkoutSet) => void;
};

export const WorkoutSetRow = memo(function WorkoutSetRow({ item, label, weightUnit, breathing, previous, locked, reuseBlocked, onUpdate, onReuse, onToggle, onMenu, onDelete, onTimer, onRpe }: SetRowProps) {
  const s = useStyles();
  const { c } = useTheme();
  // A draft exists only while a field is being edited; otherwise the stored value is shown.
  const [weightDraft, setWeightText] = useState<string | null>(null);
  const [repsDraft, setRepsText] = useState<string | null>(null);
  const weightEdit = useRef<string | null>(null);
  const repsEdit = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [reusing, setReusing] = useState(false);
  const warmup = isWarmup(item);
  const seconds = item.unit === 'seconds';
  const done = !!item.completed;
  const storedWeight = formatWeightValue(item.weight, weightUnit);

  const fail = (message: string) => (cause: unknown) => setError(cause instanceof Error ? cause.message : message);

  function setWeightDraft(draft: string | null) {
    weightEdit.current = draft;
    setWeightText(draft);
  }

  function setRepsDraft(draft: string | null) {
    repsEdit.current = draft;
    setRepsText(draft);
  }

  function readWeightEdit() {
    const draft = weightEdit.current;
    // Untouched text is never re-parsed: lb rounding would otherwise rewrite the stored kilograms.
    if (draft === null || draft.trim() === storedWeight) return;
    const kg = parseWeightInput(draft, weightUnit);
    if (kg === null) {
      setError(`重量需介于 0–${weightUnit === 'lb' ? '4409 lb' : '2000 kg'}。`);
      return null;
    }
    if (kg !== item.weight) return kg;
  }

  function readRepsEdit() {
    const draft = repsEdit.current;
    if (draft === null || draft.trim() === String(item.reps)) return;
    const value = Number(draft.trim());
    if (!draft.trim() || !Number.isInteger(value) || value < 0 || value > 1000) {
      setError('次数或秒数需为 0–1000 的整数。');
      return null;
    }
    if (value !== item.reps) return value;
  }

  function commitWeight() {
    const weight = readWeightEdit();
    setWeightDraft(null);
    if (weight != null) onUpdate(item.id, { weight }).catch(fail('保存这组训练失败，请重试。'));
  }

  function commitReps() {
    const reps = readRepsEdit();
    setRepsDraft(null);
    if (reps != null) onUpdate(item.id, { reps }).catch(fail('保存这组训练失败，请重试。'));
  }

  function takeEdits(): SetInputPatch | null {
    const weight = readWeightEdit();
    const reps = readRepsEdit();
    if (weight === null || reps === null) return null;
    if (weightEdit.current !== null || repsEdit.current !== null) {
      // Android can hide the keyboard while the field stays focused.
      setWeightDraft(null);
      setRepsDraft(null);
      setError('');
      Keyboard.dismiss();
    }
    const patch: SetInputPatch = {};
    if (weight !== undefined) patch.weight = weight;
    if (reps !== undefined) patch.reps = reps;
    return patch;
  }

  function toggle() {
    const patch = takeEdits();
    if (patch) onToggle(item, patch);
  }

  async function startTimer() {
    const patch = takeEdits();
    if (!patch) return;
    try {
      if (patch.weight !== undefined || patch.reps !== undefined) await onUpdate(item.id, patch);
      onTimer({ ...item, ...patch });
    } catch (cause) {
      fail('保存这组训练失败，请重试。')(cause);
    }
  }

  async function reuse() {
    if (!previous || reusing || reuseBlocked || locked || done) return;
    setReusing(true);
    setError('');
    try { await onReuse(item.id, previous.id); } catch (cause) { fail('沿用上次失败，请重试。')(cause); } finally { setReusing(false); }
  }

  const previousTarget = previous ? targetLabel(previous.reps, previous.unit) : '';
  const previousValue = previous && previous.weight > 0 ? `${formatWeight(previous.weight, weightUnit)} ${seconds ? '·' : '×'} ${previousTarget}` : previousTarget;
  const busy = locked || reusing;
  const showRpe = !warmup && !breathing && (done || item.rpe != null);

  return <View style={s.wrap}>
    <View style={[s.row, done && s.rowDone, warmup && !done && s.rowWarmup]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${warmup ? '热身组' : `第 ${label} 组`}，更多操作`} accessibilityHint="长按删除这一组" disabled={busy}
        onPress={() => onMenu(item)} onLongPress={() => onDelete(item)} style={({ pressed }) => [s.number, pressed && { opacity: 0.6 }]}>
        <Text style={[type.bodyStrong, { color: warmup ? c.warning : done ? c.success : c.textMuted }]}>{label}</Text>
      </Pressable>
      {!breathing ? <View style={s.cell}>
        <TextInput accessibilityLabel={`${warmup ? '热身组' : `第 ${label} 组`}重量，${weightUnit === 'lb' ? '磅' : '千克'}`} editable={!busy} value={weightDraft ?? storedWeight}
          onFocus={() => { setWeightDraft(storedWeight); setError(''); }} onChangeText={setWeightDraft} onBlur={commitWeight}
          keyboardType="decimal-pad" selectTextOnFocus style={[s.input, done && s.inputDone]} />
        <Txt variant="caption" tone="faint" style={s.unit}>{weightUnit}</Txt>
      </View> : null}
      <View style={s.cell}>
        <TextInput accessibilityLabel={`${warmup ? '热身组' : `第 ${label} 组`}${seconds ? '秒数' : '次数'}`} editable={!busy} value={repsDraft ?? String(item.reps)}
          onFocus={() => { setRepsDraft(String(item.reps)); setError(''); }} onChangeText={setRepsDraft} onBlur={commitReps}
          keyboardType="number-pad" selectTextOnFocus style={[s.input, done && s.inputDone]} />
        <Txt variant="caption" tone="faint" style={s.unit}>{seconds ? '秒' : '次'}</Txt>
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`完成第 ${label} 组`} accessibilityState={{ checked: done, disabled: busy }} disabled={busy}
        onPress={toggle} style={({ pressed }) => [s.check, done && s.checked, pressed && { opacity: 0.7 }]}>
        <Ionicons name="checkmark" size={22} color={done ? c.onSuccess : c.textFaint} />
      </Pressable>
    </View>
    {!done && previous || showRpe || (seconds && !done) ? <View style={s.extras}>
      {!done && previous ? <Pressable accessibilityRole="button" accessibilityLabel={`第 ${label} 组沿用上次第 ${previous.setNumber} 组，${previousValue}`} accessibilityState={{ disabled: busy || reuseBlocked, busy: reusing }}
        disabled={busy || reuseBlocked} onPress={() => { void reuse(); }} style={({ pressed }) => [s.pill, (busy || reuseBlocked) && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}>
        <Ionicons name="return-down-forward" size={14} color={c.data} />
        <Txt variant="caption" tone="data" style={s.pillText} numberOfLines={1}>{reusing ? '正在沿用…' : `沿用上次 · ${previousValue}`}</Txt>
      </Pressable> : null}
      {seconds && !done ? <Pressable accessibilityRole="button" accessibilityLabel={`${breathing ? '呼吸引导' : '计时'} ${item.reps} 秒`} disabled={busy} onPress={startTimer} style={({ pressed }) => [s.pill, s.pillAccent, pressed && { opacity: 0.7 }]}>
        <Ionicons name={breathing ? 'leaf-outline' : 'timer-outline'} size={14} color={c.accentText} />
        <Txt variant="caption" tone="accent" style={s.pillText}>{breathing ? '呼吸引导' : '计时'} {item.reps} 秒</Txt>
      </Pressable> : null}
      {showRpe ? <Pressable accessibilityRole="button" accessibilityLabel={item.rpe != null ? `第 ${label} 组 RPE ${item.rpe}，点按修改` : `记录第 ${label} 组 RPE`} onPress={() => onRpe(item)} style={({ pressed }) => [s.pill, s.pillNeutral, pressed && { opacity: 0.7 }]}>
        <Txt variant="caption" tone={item.rpe != null ? 'default' : 'muted'} style={s.pillText}>{item.rpe != null ? `RPE ${item.rpe}` : '+ RPE'}</Txt>
      </Pressable> : null}
    </View> : null}
    {error ? <Txt variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ paddingHorizontal: space.xs }}>{error}</Txt> : null}
  </View>;
});

const useStyles = makeStyles(c => ({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: 4, borderRadius: radius.md },
  rowDone: { backgroundColor: c.successSoft },
  rowWarmup: { backgroundColor: c.warningSoft },
  number: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: { flex: 1, minWidth: 40, height: 44, borderRadius: radius.sm, backgroundColor: c.surfaceAlt, color: c.text, textAlign: 'center', fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'], paddingVertical: 0 },
  inputDone: { backgroundColor: c.surface },
  unit: { width: 18, fontSize: 11 },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  checked: { backgroundColor: c.success, borderColor: c.success },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 40 },
  pill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: c.dataSoft, maxWidth: '100%' },
  pillAccent: { backgroundColor: c.accentSoft },
  pillNeutral: { backgroundColor: c.surfaceAlt },
  pillText: { fontWeight: '700', flexShrink: 1 },
}));
