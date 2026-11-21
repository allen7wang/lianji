import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '@/lib/data';
import { filterExercises } from '@/lib/exercise-library';
import type { Exercise } from '@/lib/types';
import { makeStyles, radius, space, type, useTheme, type Palette } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'data' | 'success' | 'warning' | 'danger' | 'onAccent' | 'inverse';
const toneColor = (c: Palette, tone: Tone) => ({
  default: c.text, muted: c.textMuted, faint: c.textFaint, accent: c.accentText, data: c.data,
  success: c.success, warning: c.warning, danger: c.danger, onAccent: c.onAccent, inverse: c.onInverse,
})[tone];

/** Text with a design-system variant and color tone. */
export function Txt({ variant = 'body', tone = 'default', style, children, numberOfLines, accessibilityRole, accessibilityLiveRegion }: {
  variant?: keyof typeof type;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'alert' | 'text';
  accessibilityLiveRegion?: 'polite' | 'assertive';
}) {
  const { c } = useTheme();
  return <Text numberOfLines={numberOfLines} accessibilityRole={accessibilityRole} accessibilityLiveRegion={accessibilityLiveRegion} style={[type[variant], { color: toneColor(c, tone) }, style]}>{children}</Text>;
}

/** A tab or stack screen with the page background and safe top edge. */
export function Page({ children, scroll = true, style, contentStyle }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return <SafeAreaView style={[s.safe, style]} edges={['top']}>
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.page, contentStyle]}>{children}</ScrollView> : children}
  </SafeAreaView>;
}

/** Overline + large title, with optional trailing actions. */
export function Header({ eyebrow, title, subtitle, right, onBack }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode; onBack?: () => void }) {
  const s = useStyles();
  return <View style={s.header}>
    {onBack ? <IconButton icon="chevron-back" label="返回" onPress={onBack} /> : null}
    <View style={s.headerText}>
      {eyebrow ? <Txt variant="overline" tone="muted">{eyebrow}</Txt> : null}
      <Txt variant="title1" accessibilityRole="header" numberOfLines={2}>{title}</Txt>
      {subtitle ? <Txt variant="caption" tone="muted">{subtitle}</Txt> : null}
    </View>
    {right ? <View style={s.headerRight}>{right}</View> : null}
  </View>;
}

export function SectionTitle({ title, action, onAction, caption }: { title: string; action?: string; onAction?: () => void; caption?: string }) {
  const s = useStyles();
  const { c } = useTheme();
  return <View style={s.section}>
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="title2" accessibilityRole="header">{title}</Txt>
      {caption ? <Txt variant="caption" tone="muted">{caption}</Txt> : null}
    </View>
    {action ? <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={10} onPress={onAction} style={({ pressed }) => [s.sectionAction, pressed && s.pressed]}>
      <Txt variant="bodyStrong" tone="accent">{action}</Txt>
      <Ionicons name="arrow-forward" size={15} color={c.accentText} />
    </Pressable> : null}
  </View>;
}

/** Surface card. `signal` is the one orange hero per screen; `soft` is a quiet filled panel. */
export function Card({ children, style, variant = 'default' }: { children: ReactNode; style?: StyleProp<ViewStyle>; variant?: 'default' | 'signal' | 'soft' | 'data' }) {
  const s = useStyles();
  return <View style={[s.card, variant === 'signal' && s.signal, variant === 'soft' && s.soft, variant === 'data' && s.dataCard, style]}>{children}</View>;
}

/** `onSignal` is the secondary action inside an orange signal card. */
export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'danger' | 'inverse' | 'ghost' | 'onSignal';

export function Button({ label, onPress, icon, variant = 'primary', size = 'md', disabled = false, loading = false, style, accessibilityLabel }: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const kind = variant === 'ghost' ? 'plain' : variant;
  const color = { primary: c.onAccent, secondary: c.text, plain: c.accentText, danger: c.danger, inverse: c.onInverse, onSignal: c.onAccent }[kind];
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [s.button, size === 'sm' && s.buttonSmall, s[kind], disabled && s.disabled, pressed && s.pressed, style]}>
    {loading ? <ActivityIndicator size="small" color={color} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={color} /> : null}
    <Text numberOfLines={1} style={[type.bodyStrong, size === 'sm' ? s.buttonLabelSmall : s.buttonLabel, { color }]}>{label}</Text>
  </Pressable>;
}

export function IconButton({ icon, onPress, label, color, variant = 'filled', size = 40, disabled = false }: { icon: IconName; onPress: () => void; label?: string; color?: string; variant?: 'filled' | 'plain' | 'accent'; size?: number; disabled?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={Math.max(0, (44 - size) / 2)}
    style={({ pressed }) => [s.iconButton, { width: size, height: size, borderRadius: size / 2 }, variant === 'plain' && s.iconPlain, variant === 'accent' && s.primary, disabled && s.disabled, pressed && s.pressed]}>
    <Ionicons name={icon} size={Math.round(size * 0.5)} color={color ?? (variant === 'accent' ? c.onAccent : c.text)} />
  </Pressable>;
}

/** Number with a small unit and caption beneath. */
export function Metric({ value, unit, label, accent = false, tone, align = 'left' }: { value: string; unit?: string; label: string; accent?: boolean; tone?: Tone; align?: 'left' | 'center' }) {
  return <View style={{ flex: 1, gap: 2, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
    <Text numberOfLines={1} adjustsFontSizeToFit>
      <Txt variant="number" tone={tone ?? (accent ? 'accent' : 'default')}>{value}</Txt>
      {unit ? <Txt variant="caption" tone={tone === 'onAccent' ? 'onAccent' : 'muted'}>{` ${unit}`}</Txt> : null}
    </Text>
    <Txt variant="caption" tone={tone === 'onAccent' ? 'onAccent' : 'muted'} numberOfLines={1}>{label}</Txt>
  </View>;
}

export function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false, suffix, autoFocus, onBlur, accessibilityLabel, maxLength }: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  suffix?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  accessibilityLabel?: string;
  maxLength?: number;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: space.sm }}>
    {label ? <Txt variant="caption" tone="muted">{label}</Txt> : null}
    <View style={[s.input, multiline && s.inputMultiline, focused && s.inputFocused]}>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textFaint} keyboardType={keyboardType} multiline={multiline} autoFocus={autoFocus} maxLength={maxLength}
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur?.(); }}
        style={[type.body, s.inputText, multiline && s.inputTextMultiline, { color: c.text }]} />
      {suffix ? <Txt variant="caption" tone="muted">{suffix}</Txt> : null}
    </View>
  </View>;
}

export function Empty({ icon, title, subtitle, action, onAction }: { icon: IconName; title: string; subtitle: string; action?: string; onAction?: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  return <View style={s.empty}>
    <View style={s.emptyIcon}><Ionicons name={icon} size={26} color={c.textMuted} /></View>
    <Txt variant="title3" style={{ textAlign: 'center' }}>{title}</Txt>
    <Txt variant="caption" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>{subtitle}</Txt>
    {action && onAction ? <Button label={action} variant="secondary" size="sm" onPress={onAction} style={{ marginTop: space.sm }} /> : null}
  </View>;
}

/** Filter chip; selected chips use the inverse ink fill. */
export function Badge({ label, active = false, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  const s = useStyles();
  const { c } = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={{ selected: active }} disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.chip, active && s.chipActive, pressed && s.pressed]}>
    {icon ? <Ionicons name={icon} size={14} color={active ? c.onInverse : c.textMuted} /> : null}
    <Text style={[s.chipText, active && { color: c.onInverse }]}>{label}</Text>
  </Pressable>;
}
export const Chip = Badge;

/** Small status label. */
export function Tag({ label, tone = 'accent', icon }: { label: string; tone?: 'accent' | 'success' | 'data' | 'warning' | 'neutral' | 'danger'; icon?: IconName }) {
  const s = useStyles();
  const { c } = useTheme();
  const colors = {
    accent: [c.accentSoft, c.accentText], success: [c.successSoft, c.success], data: [c.dataSoft, c.data],
    warning: [c.warningSoft, c.warning], neutral: [c.surfaceAlt, c.textMuted], danger: [c.dangerSoft, c.danger],
  }[tone];
  return <View style={[s.tag, { backgroundColor: colors[0] }]}>
    {icon ? <Ionicons name={icon} size={11} color={colors[1]} /> : null}
    <Text style={[s.tagText, { color: colors[1] }]}>{label}</Text>
  </View>;
}

export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; accessibilityLabel?: string }) {
  const s = useStyles();
  return <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={s.segmented}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={[s.segment, selected && s.segmentActive]}>
        <Txt variant="bodyStrong" tone={selected ? 'default' : 'muted'} style={{ fontSize: 14 }}>{option.label}</Txt>
      </Pressable>;
    })}
  </View>;
}

/** The "trace" progress bar. */
export function ProgressTrack({ value, tone = 'accent', height = 6, style }: { value: number; tone?: 'accent' | 'success' | 'data' | 'onAccent'; height?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const fill = { accent: c.accent, success: c.success, data: c.data, onAccent: c.onAccent }[tone];
  const track = tone === 'onAccent' ? 'rgba(21, 21, 21, 0.18)' : c.surfaceAlt;
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }, style]}>
    <View style={{ width: `${ratio * 100}%`, height, borderRadius: height / 2, backgroundColor: fill }} />
  </View>;
}

/** Tappable list row with leading icon, title, subtitle and trailing content. */
export function ListRow({ title, subtitle, icon, iconTone = 'default', right, onPress, onLongPress, accessibilityLabel, divider = true }: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'default' | 'accent' | 'success' | 'data';
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  divider?: boolean;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const iconColors = { default: [c.surfaceAlt, c.text], accent: [c.accentSoft, c.accentText], success: [c.successSoft, c.success], data: [c.dataSoft, c.data] }[iconTone];
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={accessibilityLabel ?? title} disabled={!onPress && !onLongPress} onPress={onPress} onLongPress={onLongPress}
    style={({ pressed }) => [s.row, divider && s.rowDivider, pressed && s.pressed]}>
    {icon ? <View style={[s.rowIcon, { backgroundColor: iconColors[0] }]}><Ionicons name={icon} size={19} color={iconColors[1]} /></View> : null}
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="title3" numberOfLines={1} style={{ fontSize: 16 }}>{title}</Txt>
      {subtitle ? <Txt variant="caption" tone="muted" numberOfLines={2}>{subtitle}</Txt> : null}
    </View>
    {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null)}
  </Pressable>;
}

/** Page-sheet modal with a title bar. */
export function Sheet({ visible, title, subtitle, onClose, closeDisabled = false, children, scroll = true, footer }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const s = useStyles();
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!closeDisabled) onClose(); }}>
    <SafeAreaView style={s.sheet} edges={['top', 'bottom']}>
      <View style={s.sheetHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title2" accessibilityRole="header" accessibilityLiveRegion="polite">{title}</Txt>
          {subtitle ? <Txt variant="caption" tone="muted">{subtitle}</Txt> : null}
        </View>
        {!closeDisabled ? <IconButton icon="close" label="关闭" onPress={onClose} /> : null}
      </View>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}>{children}</ScrollView> : children}
      {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
    </SafeAreaView>
  </Modal>;
}

const muscles = ['全部', '胸', '背', '腿', '肩', '手臂', '核心', '全身', '呼吸'];

export function ExercisePicker({ visible, onClose, onSelect, excluded = [], replacing = false, autoClose = true, busy = false }: { visible: boolean; onClose: () => void; onSelect: (exercise: Exercise) => void; excluded?: string[]; replacing?: boolean; autoClose?: boolean; busy?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const { exercises } = useLibrary();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('全部');
  const filtered = filterExercises(exercises, { query, muscle }).filter(exercise => !excluded.includes(exercise.id));
  return <Sheet visible={visible} title={busy ? '正在更换…' : replacing ? '更换动作' : '添加动作'} subtitle={replacing ? '沿用组数、顺序与休息，重新预填目标' : `${filtered.length} 个动作`} onClose={onClose} closeDisabled={busy} scroll={false}>
    <View style={{ paddingHorizontal: space.page }}><Field value={query} onChangeText={setQuery} placeholder="搜索动作、器械或部位" accessibilityLabel="搜索动作" /></View>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{muscles.map(item => <Badge key={item} label={item} active={muscle === item} onPress={() => setMuscle(item)} />)}</ScrollView></View>
    <FlatList data={filtered} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl }}
      renderItem={({ item }) => <ListRow title={item.name} subtitle={`${item.muscle} · ${item.equipment}${item.isCustom ? ' · 自定义' : ''}`} accessibilityLabel={`${replacing ? '更换为' : '添加'}${item.name}`}
        onPress={() => { if (busy) return; onSelect(item); if (autoClose) onClose(); setQuery(''); }}
        right={<Ionicons name={replacing ? 'swap-horizontal' : 'add-circle'} size={24} color={c.accentText} />} />}
      ListEmptyComponent={<Empty icon="search-outline" title="没有找到动作" subtitle="试试其他关键词，或在动作库创建自定义动作" />} />
  </Sheet>;
}

const useStyles = makeStyles(c => ({
  safe: { flex: 1, backgroundColor: c.bg },
  page: { paddingHorizontal: space.page, paddingBottom: 140, gap: space.xl },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingTop: space.lg, marginBottom: space.xs },
  headerText: { flex: 1, gap: space.xs },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: 2 },
  section: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md, marginTop: space.sm },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space.card },
  signal: { backgroundColor: c.accent, borderColor: c.accent, borderRadius: radius.xl },
  soft: { backgroundColor: c.surfaceAlt, borderColor: c.surfaceAlt },
  dataCard: { backgroundColor: c.dataSoft, borderColor: c.dataSoft },
  button: { minHeight: 52, paddingHorizontal: space.xl, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonSmall: { minHeight: 40, paddingHorizontal: space.lg },
  buttonLabel: { fontSize: 16, flexShrink: 1, textAlign: 'center' },
  buttonLabelSmall: { fontSize: 14, flexShrink: 1, textAlign: 'center' },
  primary: { backgroundColor: c.accent },
  secondary: { backgroundColor: c.surfaceAlt },
  plain: { backgroundColor: 'transparent', paddingHorizontal: space.sm },
  danger: { backgroundColor: c.dangerSoft },
  inverse: { backgroundColor: c.inverse },
  onSignal: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(21, 21, 21, 0.28)' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  iconButton: { backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  iconPlain: { backgroundColor: 'transparent' },
  input: { minHeight: 50, borderRadius: radius.md, backgroundColor: c.surfaceAlt, borderWidth: 1.5, borderColor: c.surfaceAlt, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inputMultiline: { minHeight: 96, alignItems: 'flex-start', paddingVertical: space.md },
  inputFocused: { borderColor: c.accent },
  inputText: { flex: 1, paddingVertical: space.md },
  inputTextMultiline: { minHeight: 70, paddingVertical: 0, textAlignVertical: 'top' },
  empty: { alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl, gap: space.sm },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  chip: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: c.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipActive: { backgroundColor: c.inverse },
  chipText: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
  tag: { minHeight: 22, borderRadius: 6, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  tagText: { fontSize: 11, fontWeight: '700' },
  segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segmentActive: { backgroundColor: c.raised, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, backgroundColor: c.bg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.page, paddingTop: space.xl, paddingBottom: space.md },
  sheetContent: { paddingHorizontal: space.page, paddingBottom: space.xxxl, gap: space.xl },
  sheetFooter: { paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg },
  filters: { gap: space.sm, paddingHorizontal: space.page, paddingVertical: space.md },
}));
