import { Pressable, View } from 'react-native';
import { rpeOptions } from '@/lib/types';
import { Button, Sheet, Txt } from './components';
import { makeStyles, radius, space } from './theme';

const rpeHints: Record<number, string> = { 10: '已到极限', 9: '还能再做 1 次', 8: '还能再做 2 次', 7: '还能再做 3 次', 6: '轻松，还能做 4 次以上', 5: '热身强度' };

/** RPE (rate of perceived exertion) chooser, 5–10 in half steps. */
export function RpePicker({ visible, value, title, onSelect, onClose }: { visible: boolean; value: number | null | undefined; title: string; onSelect: (rpe: number | null) => void; onClose: () => void }) {
  return <Sheet visible={visible} title="主观用力程度 RPE" subtitle={title} onClose={onClose}>
    <RpeOptions value={value} onSelect={rpe => { onSelect(rpe); onClose(); }} />
  </Sheet>;
}

export function RpeOptions({ value, onSelect }: { value: number | null | undefined; onSelect: (rpe: number | null) => void }) {
  const s = useStyles();
  return <>
    <View style={s.grid}>
      {rpeOptions.map(option => {
        const selected = value === option;
        return <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`RPE ${option}${rpeHints[option] ? `，${rpeHints[option]}` : ''}`} accessibilityState={{ checked: selected }}
          onPress={() => onSelect(option)} style={({ pressed }) => [s.option, selected && s.selected, pressed && { opacity: 0.7 }]}>
          <Txt variant="number" tone={selected ? 'inverse' : 'default'}>{option}</Txt>
          {rpeHints[option] ? <Txt variant="caption" tone={selected ? 'inverse' : 'muted'} style={s.hint} numberOfLines={2}>{rpeHints[option]}</Txt> : null}
        </Pressable>;
      })}
    </View>
    <Txt variant="caption" tone="muted">RPE 只用于记录当时的感受，不影响容量和个人纪录。</Txt>
    {value != null ? <Button label="清除 RPE" variant="secondary" icon="close-circle-outline" onPress={() => onSelect(null)} /> : null}
  </>;
}

const useStyles = makeStyles(c => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: { width: '31%', minHeight: 76, borderRadius: radius.md, backgroundColor: c.surfaceAlt, padding: space.md, gap: 2, justifyContent: 'center' },
  selected: { backgroundColor: c.inverse },
  hint: { fontSize: 11, lineHeight: 14 },
}));
