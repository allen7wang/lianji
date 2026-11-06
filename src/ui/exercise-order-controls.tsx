import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from './theme';

export function ExerciseOrderControls({ name, index, total, disabled = false, onMove }: {
  name: string;
  index: number;
  total: number;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return <View style={styles.controls}>
    {([-1, 1] as const).map(direction => {
      const label = direction === -1 ? '上移' : '下移';
      const unavailable = disabled || index < 0 || index >= total || index + direction < 0 || index + direction >= total;
      return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={`${label}${name}`} accessibilityState={{ disabled: unavailable }} disabled={unavailable} onPress={() => { if (!unavailable) onMove(direction); }} style={({ pressed }) => [styles.button, unavailable && styles.disabled, pressed && styles.pressed]}>
        <Ionicons name={direction === -1 ? 'arrow-up-outline' : 'arrow-down-outline'} size={16} color={C.muted} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.elevated },
  label: { color: C.muted, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
});
