import { View } from 'react-native';
import { IconButton } from './components';

export function ExerciseOrderControls({ name, index, total, disabled = false, onMove }: {
  name: string;
  index: number;
  total: number;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return <View style={{ flexDirection: 'row', gap: 6 }}>
    {([-1, 1] as const).map(direction => {
      const unavailable = disabled || index < 0 || index >= total || index + direction < 0 || index + direction >= total;
      return <IconButton key={direction} icon={direction === -1 ? 'arrow-up' : 'arrow-down'} size={36} label={`${direction === -1 ? '上移' : '下移'}${name}`} disabled={unavailable} onPress={() => { if (!unavailable) onMove(direction); }} />;
    })}
  </View>;
}
