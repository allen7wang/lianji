import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import type { Exercise } from '@/lib/types';
import { C, space } from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

export function Page({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  return <SafeAreaView style={[styles.safe, style]} edges={['top']}>
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>{children}</ScrollView> : children}
  </SafeAreaView>;
}

export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return <View style={styles.header}><View>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.title}>{title}</Text></View>{right}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, icon, variant = 'primary', disabled = false, style }: { label: string; onPress: () => void; icon?: IconName; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === 'primary' ? styles.primary : variant === 'secondary' ? styles.secondary : variant === 'danger' ? styles.danger : styles.ghost, disabled && styles.disabled, pressed && styles.pressed, style]}>
    {icon ? <Ionicons name={icon} size={18} color={variant === 'primary' ? C.bg : variant === 'danger' ? C.danger : C.text} /> : null}
    <Text style={[styles.buttonText, variant === 'primary' && { color: C.bg }, variant === 'danger' && { color: C.danger }]}>{label}</Text>
  </Pressable>;
}

export function IconButton({ icon, onPress, color = C.text }: { icon: IconName; onPress: () => void; color?: string }) {
  return <Pressable onPress={onPress} hitSlop={12} style={styles.iconButton}><Ionicons name={icon} size={21} color={color} /></Pressable>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onAction}><Text style={styles.sectionAction}>{action}  →</Text></Pressable> : null}</View>;
}

export function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, accent && { color: C.accent }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

export function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false }: { label?: string; value: string; onChangeText: (value: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions; multiline?: boolean }) {
  return <View style={{ gap: 8 }}>{label ? <Text style={styles.fieldLabel}>{label}</Text> : null}<TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.faint} keyboardType={keyboardType} multiline={multiline} style={[styles.input, multiline && { minHeight: 88, textAlignVertical: 'top' }]} /></View>;
}

export function Empty({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={C.accent} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptySubtitle}>{subtitle}</Text></View>;
}

export function Badge({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return <Pressable disabled={!onPress} onPress={onPress} style={[styles.badge, active && styles.badgeActive]}><Text style={[styles.badgeText, active && { color: C.bg }]}>{label}</Text></Pressable>;
}

export function ExercisePicker({ visible, onClose, onSelect, excluded = [] }: { visible: boolean; onClose: () => void; onSelect: (exercise: Exercise) => void; excluded?: string[] }) {
  const { exercises } = useData();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('全部');
  const muscles = ['全部', '胸', '背', '腿', '肩', '手臂', '核心', '全身'];
  const filtered = exercises.filter(exercise => !excluded.includes(exercise.id) && (muscle === '全部' || exercise.muscle === muscle) && (exercise.name.includes(query.trim()) || exercise.equipment.includes(query.trim())));
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
      <View style={styles.pickerHeader}><Text style={styles.pickerTitle}>选择动作</Text><IconButton icon="close" onPress={onClose} /></View>
      <View style={{ paddingHorizontal: 20 }}><Field value={query} onChangeText={setQuery} placeholder="搜索动作或器械" /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{muscles.map(item => <Badge key={item} label={item} active={muscle === item} onPress={() => setMuscle(item)} />)}</ScrollView>
      <FlatList data={filtered} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} renderItem={({ item }) => <Pressable onPress={() => { onSelect(item); onClose(); setQuery(''); }} style={styles.pickerRow}><View><Text style={styles.pickerRowTitle}>{item.name}</Text><Text style={styles.pickerRowSub}>{item.muscle} · {item.equipment}</Text></View><Ionicons name="add-circle" size={24} color={C.accent} /></Pressable>} ListEmptyComponent={<Empty icon="search-outline" title="没有找到动作" subtitle="试试其他关键词，或在动作库创建自定义动作" />} />
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { paddingHorizontal: space.page, paddingBottom: 110, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 18, marginBottom: 4 },
  eyebrow: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 7 },
  title: { color: C.text, fontSize: 31, fontWeight: '800', letterSpacing: -0.5 },
  card: { backgroundColor: C.surface, borderRadius: space.radius, borderWidth: 1, borderColor: C.line, padding: 18 },
  button: { minHeight: 50, paddingHorizontal: 18, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: { backgroundColor: C.accent }, secondary: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.line }, ghost: { backgroundColor: 'transparent' }, danger: { backgroundColor: '#3A2528' },
  disabled: { opacity: 0.4 }, pressed: { opacity: 0.75 }, buttonText: { color: C.text, fontSize: 15, fontWeight: '700' },
  iconButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: C.text, fontSize: 19, fontWeight: '700' }, sectionAction: { color: C.accent, fontSize: 13, fontWeight: '600' },
  metric: { flex: 1, gap: 7 }, metricValue: { color: C.text, fontSize: 24, fontWeight: '800' }, metricLabel: { color: C.muted, fontSize: 12 },
  fieldLabel: { color: C.muted, fontSize: 13, fontWeight: '600' }, input: { minHeight: 48, borderRadius: 13, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 8 }, emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }, emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' }, emptySubtitle: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  badge: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.elevated }, badgeActive: { backgroundColor: C.accent, borderColor: C.accent }, badgeText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: C.bg }, pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 }, pickerTitle: { color: C.text, fontSize: 24, fontWeight: '800' }, filters: { gap: 8, padding: 20 },
  pickerRow: { borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, pickerRowTitle: { color: C.text, fontSize: 16, fontWeight: '600' }, pickerRowSub: { color: C.muted, fontSize: 12, marginTop: 5 },
});
